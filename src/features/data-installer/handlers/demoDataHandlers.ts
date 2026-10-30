/**
 * Clearing a demo's part of the store (datapack-engine step 10): two handlers, which the agent tools
 * and the Data Installer's "Clear demo data" both reach, and which project reset's question uses the
 * same services as. The unit chosen is the STORE (owner, 2026-10-30), by website and store code.
 *
 * - `check-demo-data`: every website and store to choose from (`choices`), and, when stores are
 *   chosen (or the project names its own), what their install records list and what else they hold
 *   that a clearing would remove, take off, close or leave, with why. Reads only. The plan is kept
 *   here by its token, so the clearing can be held to it. No stores chosen and none of the project's
 *   own: the choices alone.
 * - `clear-demo-data`: confirm-gated, and never defaulted: it names the stores, and is handed the
 *   token of the list the SC (or the agent's user) was shown. It goes ahead only when the store
 *   would clear nothing that list did not hold (`clearShown`). Cannot be undone. From the Data
 *   Installer's button (`progress: 'modal'`) its stages go to the screen's progress window.
 *
 * Both read every other project on this machine (`readWipeClaims`): a chosen store another project
 * records as its own is refused, naming it, before any product, customer or order is read (the check
 * answers that as a normal answer, `refused`, so an agent explains it, and the picker locks the
 * store); and what any project's install records list on the chosen websites is left.
 *
 * Both open the project's own signed Commerce access (`projectCommerce`, Store: `all`), after the
 * sign-in is checked against the org that owns the store (`orgGuard`, adobe-org-context).
 *
 * @module features/data-installer/handlers/demoDataHandlers
 */

import { projectCommerce } from '../services/buildDatapackEngine';
import { type InstallRecord, type RecordFiles, nodeRecordFiles } from '../services/demoBuilderEngine/installRecord';
import type { RemovalAccess } from '../services/demoBuilderEngine/removers';
import { claimedStores, projectStoreChoice, readWipeClaims } from '../services/demoDataWipe/wipeClaims';
import { type WipePlan, planWipe, planWipeFor } from '../services/demoDataWipe/wipePlan';
import { WipeScopeError, readWipeStructure } from '../services/demoDataWipe/wipeReads';
import { WipeChangedError, clearShown, storesInWords } from '../services/demoDataWipe/wipeRun';
import { choicesOf, resolveWipeScope } from '../services/demoDataWipe/wipeScope';
import { loadOtherProjects } from '@/core/state/otherProjects';
import { DATAPACK_STAGES } from '@/core/utils/datapackStages';
import { DEMO_DATA_CLEAR_OPERATION_ID } from '@/core/utils/operationIds';
import { narrateOutcomeToModal } from '@/core/vscode/operationProgress';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import type { Project } from '@/types/base';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { DemoDataCheck, DemoDataRequest, WipeStoreChoice } from '@/types/demoDataWipe';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';

/** What the handlers need, handed in so a test drives them against a fake store. */
export interface DemoDataDeps {
    commerce: (context: HandlerContext, project: Project) => Promise<RemovalAccess | { refusal: string }>;
    guard: (context: HandlerContext, project: Project) => Promise<string | undefined>;
    files: RecordFiles;
    /** Every other project on this machine, as the projects list reads them. */
    others: (context: HandlerContext, project: Project) => Promise<Project[]>;
}

/** The plans shown, by token, newest last; a few is plenty, since one is shown per question. */
const PLANS_KEPT = 10;

function keep(plans: Map<string, WipePlan>, plan: WipePlan): void {
    plans.set(plan.preview.token, plan);
    while (plans.size > PLANS_KEPT) plans.delete(plans.keys().next().value as string);
}

const NO_PROJECT: HandlerResponse = { success: false, error: 'No project is open.' };

/** The project's store, read, with every other local project. */
interface Opened {
    project: Project;
    commerce: RemovalAccess;
    structure: CommerceStoreStructure;
    others: Project[];
}

/** The open project's store, its structure and the other projects, or the response to answer instead. */
async function openStore(deps: DemoDataDeps, context: HandlerContext): Promise<Opened | { response: HandlerResponse }> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return { response: NO_PROJECT };
    const mismatch = await deps.guard(context, project);
    if (mismatch) return { response: { success: false, error: mismatch, code: ErrorCode.ORG_MISMATCH } };
    const others = await deps.others(context, project);
    const commerce = await deps.commerce(context, project);
    if ('refusal' in commerce) return { response: { success: false, error: commerce.refusal } };
    return { project, commerce, others, structure: await readWipeStructure(commerce.get) };
}

function failure(context: HandlerContext, error: unknown, fallback: string): HandlerResponse {
    if (error instanceof WipeScopeError) return { success: false, error: error.message };
    context.logger.warn(`${LOG_PREFIX} ${fallback} ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, error: `${fallback} Details are in Debug Logs.`, code: ErrorCode.UNKNOWN };
}

const answer = (data: DemoDataCheck): HandlerResponse => ({ success: true, data });

/** The list for the stores chosen, or the project's own; the choices alone when there are none. */
async function checkIn(deps: DemoDataDeps, plans: Map<string, WipePlan>, opened: Opened, stores: WipeStoreChoice[] | undefined): Promise<HandlerResponse> {
    const { project, structure, others } = opened;
    const claims = claimedStores(structure, project, others);
    const own = projectStoreChoice(structure, project);
    const chosen = stores ?? (own ? [own] : []);
    if (chosen.length === 0) return answer({ choices: choicesOf(structure, undefined, claims) });
    const scope = resolveWipeScope(structure, chosen);
    const choices = choicesOf(structure, scope, claims);
    const wiped = await readWipeClaims(deps.files, project, others, structure, scope);
    if ('refusal' in wiped) return answer({ choices, refused: wiped.refusal });
    const plan = await planWipe(opened.commerce.get, structure, scope, wiped.records);
    keep(plans, plan);
    return answer({ choices, preview: plan.preview });
}

async function check(deps: DemoDataDeps, plans: Map<string, WipePlan>, context: HandlerContext, payload?: DemoDataRequest): Promise<HandlerResponse> {
    try {
        const opened = await openStore(deps, context);
        if ('response' in opened) return opened.response;
        return await checkIn(deps, plans, opened, payload?.stores);
    } catch (error) {
        return failure(context, error, 'What the stores hold could not be read.');
    }
}

/** The refusal an unconfirmed or unnamed clearing answers: which stores, and that it cannot be undone. */
function clearRefusal(payload: DemoDataRequest | undefined): string | undefined {
    if (!payload?.stores?.length) return 'Name the stores to clear (stores). They are never taken from the project.';
    if (!payload.token) return 'Check what would be removed first (check_demo_data), and hand its token back.';
    if (payload.confirm !== true) {
        const named = payload.stores.map((s) => (s.storeCode ? `${s.storeCode} (${s.websiteCode})` : `every store of ${s.websiteCode}`)).join(', ');
        return (
            `This removes everything in the stores ${named} that Demo Builder did not install, as listed, ` +
            'cancels or refunds their orders and closes their returns. It cannot be undone. Confirm to proceed.'
        );
    }
    return undefined;
}

/** The store would now clear more than was shown: the new list is offered, never acted on. */
async function offerAgain(plans: Map<string, WipePlan>, commerce: RemovalAccess, shown: WipePlan, records: InstallRecord[], error: WipeChangedError): Promise<HandlerResponse> {
    const fresh = await planWipeFor(commerce.get, shown.choices, records);
    keep(plans, fresh);
    return { success: false, error: error.message, data: { preview: fresh.preview } };
}

/** Clear the list shown, from this project, when the stores named are the list's and no other project claims one. */
async function clearIn(deps: DemoDataDeps, plans: Map<string, WipePlan>, context: HandlerContext, shown: WipePlan, stores: WipeStoreChoice[], report: (stage: string) => void): Promise<HandlerResponse> {
    const opened = await openStore(deps, context);
    if ('response' in opened) return opened.response;
    const scope = resolveWipeScope(opened.structure, stores);
    if (scope.key !== shown.scopeKey) return { success: false, error: `That list is for ${storesInWords(shown.preview)}, not the stores named.` };
    const claims = await readWipeClaims(deps.files, opened.project, opened.others, opened.structure, scope);
    plans.delete(shown.preview.token);
    if ('refusal' in claims) return { success: false, error: claims.refusal, code: ErrorCode.INVALID_OPERATION };
    try {
        report(DATAPACK_STAGES.checkingStores.label);
        const outcome = await clearShown(opened.commerce, shown, claims.records, report);
        context.logger.info(`${LOG_PREFIX} ${outcome.sentence}`);
        return { success: true, note: outcome.sentence, data: outcome };
    } catch (error) {
        if (!(error instanceof WipeChangedError)) throw error;
        return offerAgain(plans, opened.commerce, shown, claims.records, error);
    }
}

async function clear(deps: DemoDataDeps, plans: Map<string, WipePlan>, context: HandlerContext, payload?: DemoDataRequest): Promise<HandlerResponse> {
    const refusal = clearRefusal(payload);
    if (refusal || !payload?.stores) return { success: false, error: refusal, code: ErrorCode.INVALID_OPERATION };
    const shown = plans.get(payload.token ?? '');
    if (!shown) return { success: false, error: 'That list is no longer known here. Check what would be removed again.' };
    const options = { id: DEMO_DATA_CLEAR_OPERATION_ID, title: 'Clearing demo data', inModal: payload.progress === 'modal' };
    const stores = payload.stores;
    return withOperationProgress(options, async (report) => {
        try {
            return await clearIn(deps, plans, context, shown, stores, (stage) => report(stage));
        } catch (error) {
            return failure(context, error, 'The stores could not be cleared.');
        }
    });
}

/**
 * The two handlers over the deps given.
 *
 * @param deps - Commerce access, the org check, the record files and the other projects
 */
export function createDemoDataHandlers(deps: DemoDataDeps) {
    const plans = new Map<string, WipePlan>();
    return defineHandlers({
        'check-demo-data': (context: HandlerContext, payload?: DemoDataRequest) => check(deps, plans, context, payload),
        'clear-demo-data': narrateOutcomeToModal<DemoDataRequest>(
            (context, payload) => clear(deps, plans, context, payload),
            () => DEMO_DATA_CLEAR_OPERATION_ID,
        ),
    });
}

/** The project's own access, the org check against the store's org, the records on disk, and every other local project. */
export const DEFAULT_DEMO_DATA_DEPS: DemoDataDeps = {
    commerce: (context, project) => projectCommerce({ project, authManager: context.authManager, secrets: context.context?.secrets })(),
    guard: async (context, project) => (context.authManager ? (await orgGuard(context, project, context.authManager))?.error : undefined),
    files: nodeRecordFiles,
    others: (context, project) => loadOtherProjects(context, project.path),
};

export const demoDataHandlers = createDemoDataHandlers(DEFAULT_DEMO_DATA_DEPS);
