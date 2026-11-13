/**
 * Clearing a demo's data from the store (datapack-engine step 10; datapack-simplification step 06):
 * two handlers, which the agent tools and the Data Installer's "Clear Demo Data" both reach; no
 * reset offers it (owner, 2026-11-12). The unit is the WEBSITE, always whole: Clear Demo Data
 * covers every website the project uses (`readWipeClaims`, project scope).
 *
 * - `check-demo-data`: what clearing the project's websites would do, as one row and one full record
 *   list per data type (`ClearCheck`). What any install record lists, this project's included, is
 *   left: its datapack is for its uninstall until step 06's C3 runs that removal first. Reads only. The plan is kept here by its token, so the clearing can be
 *   held to it. Another local project using one of these websites is a `warning` naming it, never a
 *   refusal (P6-Q2). A data type a read failed for is marked by its kind (P6-Q3): a slow one is the
 *   `problem` to retry; a refused or strange one is left alone and the rest is planned. The check
 *   failing as a whole (signed out, offline) answers the failure codes the Datapacks failure
 *   treatment reads (`renderDataInstallerFailure`).
 * - `clear-demo-data`: confirm-gated, and handed the token of the list the SC (or the agent's user)
 *   was shown. It waits while that list has a slow type (Retry first). It goes ahead only when the
 *   store would clear nothing that list did not hold (`clearShown`). Cannot be undone. From the Data
 *   Installer's button (`progress: 'modal'`) its stages go to the screen's progress window. Its
 *   result says the project's datapack was left, as the check does.
 *
 * Both read every other project on this machine (`readWipeClaims`): what any project's install records
 * list on the chosen websites is left, and so is any company, catalog, group, attribute set or
 * attribute a record of any website lists.
 *
 * Both find the ERP integration serving the instance, from any local project (`findWipeErp`): the
 * clearing closes every order itself, and when the integration sends some chosen websites' orders to
 * an ERP, its ERP is brought in line and filled again from Commerce after the clearing ("One action,
 * ERP included", owner 2026-10-30; Commerce is the source system, 2026-11-11).
 *
 * Both open the project's own signed Commerce access (`projectCommerce`, Store: `all`), after the
 * sign-in is checked against the org that owns the store (`orgGuard`, adobe-org-context).
 *
 * @module features/data-installer/handlers/demoDataHandlers
 */

import { projectCommerce } from '../services/buildDatapackEngine';
import { phaseLine } from '../services/datapackTypesLine';
import { type RecordFiles, nodeRecordFiles } from '../services/demoBuilderEngine/installRecord';
import type { RemovalAccess } from '../services/demoBuilderEngine/removers';
import { rememberShownClear } from '../services/demoDataWipe/shownClears';
import { type WipeClaims, readWipeClaims } from '../services/demoDataWipe/wipeClaims';
import type { WipeErp } from '../services/demoDataWipe/wipeErp';
import { findWipeErp } from '../services/demoDataWipe/wipeErpDeps';
import { WIPE_PHASES } from '../services/demoDataWipe/wipePhases';
import { type WipePlan, planWipe } from '../services/demoDataWipe/wipePlan';
import { WipeScopeError, readWipeStructure } from '../services/demoDataWipe/wipeReads';
import { WipeChangedError, clearShown, websitesInWords } from '../services/demoDataWipe/wipeRun';
import { rememberWipeUnfinished } from '../services/demoDataWipe/wipeUnfinished';
import { datapackLeft } from '../ui/clearDemoDataWords';
import { dataTypeLabel } from '../ui/dataTypeLabel';
import { classifyTransience } from '@/core/errors';
import { loadOtherProjects } from '@/core/state/otherProjects';
import { andList } from '@/core/utils/andList';
import { DATAPACK_STAGES } from '@/core/utils/datapackStages';
import { DEMO_DATA_CLEAR_OPERATION_ID } from '@/core/utils/operationIds';
import { narrateOutcomeToModal } from '@/core/vscode/operationProgress';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import type { Project } from '@/types/base';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { ClearCheck, DemoDataRequest } from '@/types/demoDataWipe';
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
    /** The ERP integration serving the project's Commerce instance, from any of those projects. */
    erp: (context: HandlerContext, project: Project, others: readonly Project[]) => WipeErp | undefined;
}

/** The plans shown, by token, newest last; a few is plenty, since one is shown per question. */
const PLANS_KEPT = 10;

function keep(plans: Map<string, WipePlan>, plan: WipePlan): void {
    plans.set(plan.check.token, plan);
    while (plans.size > PLANS_KEPT) plans.delete(plans.keys().next().value as string);
}

const NO_PROJECT: HandlerResponse = { success: false, error: 'No project is open.' };

/** The project's store, read, with every other local project. */
interface Opened {
    project: Project;
    commerce: RemovalAccess;
    structure: CommerceStoreStructure;
    others: Project[];
    erp?: WipeErp;
}

/** The failure code the Datapacks failure treatment reads, from what went wrong: signed out is Sign In, never Retry. */
function codeOf(error: unknown): ErrorCode {
    const { kind } = classifyTransience(error);
    if (kind === 'auth') return ErrorCode.AUTH_REQUIRED;
    if (kind === 'timeout') return ErrorCode.TIMEOUT;
    return kind === 'network' ? ErrorCode.NETWORK : ErrorCode.UNKNOWN;
}

/** The open project's store, its structure and the other projects, or the response to answer instead. */
async function openStore(deps: DemoDataDeps, context: HandlerContext): Promise<Opened | { response: HandlerResponse }> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return { response: NO_PROJECT };
    const mismatch = await deps.guard(context, project);
    if (mismatch) return { response: { success: false, error: mismatch, code: ErrorCode.ORG_MISMATCH } };
    const others = await deps.others(context, project);
    const commerce = await deps.commerce(context, project);
    if ('refusal' in commerce) return { response: { success: false, error: commerce.refusal, code: codeOf(commerce.refusal) } };
    const erp = deps.erp(context, project, others);
    return { project, commerce, others, structure: await readWipeStructure(commerce.get), ...(erp ? { erp } : {}) };
}

function failure(context: HandlerContext, error: unknown, fallback: string): HandlerResponse {
    if (error instanceof WipeScopeError) return { success: false, error: error.message };
    context.logger.warn(`${LOG_PREFIX} ${fallback} ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, error: `${fallback} Details are in Debug Logs.`, code: codeOf(error) };
}

/** Which websites the project uses, and what to respect, read for this project. */
const claimsOf = (deps: DemoDataDeps, opened: Opened): Promise<WipeClaims> =>
    readWipeClaims(deps.files, opened.project, opened.others, opened.structure, { kind: 'project' });

/** The plan the check shows: everything any install record lists, this project's included, left. */
async function checkPlan(opened: Opened, claims: WipeClaims, context: HandlerContext): Promise<WipePlan> {
    const plan = await planWipe(opened.commerce.get, claims.scope, { ...claims.respects, erp: opened.erp });
    for (const [type, detail] of Object.entries(plan.unreadDetails)) context.logger.warn(`${LOG_PREFIX} ${dataTypeLabel(type)} could not be read: ${detail}`);
    return plan;
}

/**
 * The check's answer: the plan's, with the warning and the datapack the project names. What it covers
 * is noted by its token, so `clear_demo_data`'s consent can name it (`shownClears.ts`).
 */
function answerOf(plan: WipePlan, claims: WipeClaims, project: Project): ClearCheck {
    const datapack = project.datapack ? { datapack: { name: project.datapack.name, changes: 'unchecked' as const } } : {};
    const warning = claims.warning ? { warning: claims.warning } : {};
    rememberShownClear(plan.check.token, { websites: plan.websiteCodes, ...warning });
    return { ...plan.check, ...warning, ...datapack };
}

async function check(deps: DemoDataDeps, plans: Map<string, WipePlan>, context: HandlerContext): Promise<HandlerResponse> {
    try {
        const opened = await openStore(deps, context);
        if ('response' in opened) return opened.response;
        const claims = await claimsOf(deps, opened);
        const plan = await checkPlan(opened, claims, context);
        keep(plans, plan);
        return { success: true, data: answerOf(plan, claims, opened.project) };
    } catch (error) {
        return failure(context, error, "What this project's websites hold could not be read.");
    }
}

/** The types the list could not read in time, by name: the clearing waits for Retry. */
function slowTypes(plan: WipePlan): string[] {
    return Object.entries(plan.check.unread ?? {}).filter(([, kind]) => kind === 'slow').map(([type]) => dataTypeLabel(type));
}

/** The refusal an unconfirmed clearing, or one of a list that must be read again, answers. */
function clearRefusal(payload: DemoDataRequest | undefined, shown: WipePlan): string | undefined {
    const slow = slowTypes(shown);
    if (slow.length > 0) return `Commerce didn't answer for ${andList(slow)}, so nothing was cleared. Check again (check_demo_data) before clearing.`;
    if (payload?.confirm === true) return undefined;
    return (
        `This removes everything on ${websitesInWords(shown.check)} that no datapack Demo Builder installed lists, as listed: products, ` +
        'categories, customers, cart rules, companies, shared catalogs, customer groups, attribute sets and attributes. It sets ' +
        "those websites' settings to the default's value, cancels or refunds their orders and closes their returns (bringing in " +
        "line the ERP of an ERP integration that serves these websites, from Commerce). It cannot be undone. Confirm to proceed."
    );
}

/** The store would now clear more than was shown: the new list is offered, never acted on. */
async function offerAgain(plans: Map<string, WipePlan>, opened: Opened, claims: WipeClaims, context: HandlerContext, error: WipeChangedError): Promise<HandlerResponse> {
    const fresh = await checkPlan(opened, claims, context);
    keep(plans, fresh);
    return { success: false, error: error.message, data: answerOf(fresh, claims, opened.project) };
}

/** Clear the list shown, from this project, when the websites it uses are still the list's. */
async function clearIn(deps: DemoDataDeps, plans: Map<string, WipePlan>, context: HandlerContext, shown: WipePlan, report: (stage: string, step?: string) => void): Promise<HandlerResponse> {
    const opened = await openStore(deps, context);
    if ('response' in opened) return opened.response;
    const claims = await claimsOf(deps, opened);
    if (claims.scope.key !== shown.scopeKey) return { success: false, error: `That list is for ${websitesInWords(shown.check)}, not the websites this project uses now. Check again.` };
    plans.delete(shown.check.token);
    try {
        const verifying = DATAPACK_STAGES.verifyingDemoData.label;
        const onPhase = (at: number): void => report(verifying, phaseLine(WIPE_PHASES, at));
        onPhase(0);
        const outcome = await clearShown(opened.commerce, shown, { ...claims.respects, erp: opened.erp, onPhase }, report);
        await rememberWipeUnfinished(deps.files, opened.project.path, outcome.unfinished).catch((error: unknown) => context.logger.warn(`${LOG_PREFIX} What was left to do could not be noted: ${String(error)}`));
        const pack = opened.project.datapack;
        const sentence = pack ? `${outcome.sentence} ${datapackLeft(pack.name)}` : outcome.sentence;
        context.logger.info(`${LOG_PREFIX} ${sentence}`);
        return { success: true, note: sentence, data: { ...outcome, sentence } };
    } catch (error) {
        if (!(error instanceof WipeChangedError)) throw error;
        return offerAgain(plans, opened, claims, context, error);
    }
}

async function clear(deps: DemoDataDeps, plans: Map<string, WipePlan>, context: HandlerContext, payload?: DemoDataRequest): Promise<HandlerResponse> {
    if (!payload?.token) return { success: false, error: 'Check what would be removed first (check_demo_data), and hand its token back.', code: ErrorCode.INVALID_OPERATION };
    const shown = plans.get(payload.token);
    if (!shown) return { success: false, error: 'That list is no longer known here. Check what would be removed again.' };
    const refusal = clearRefusal(payload, shown);
    if (refusal) return { success: false, error: refusal, code: ErrorCode.INVALID_OPERATION };
    const options = { id: DEMO_DATA_CLEAR_OPERATION_ID, title: 'Clearing Demo Data', inModal: payload.progress === 'modal' };
    return withOperationProgress(options, async (report) => {
        try {
            return await clearIn(deps, plans, context, shown, (stage, step) => report(stage, step));
        } catch (error) {
            return failure(context, error, "This project's websites could not be cleared.");
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
        'check-demo-data': (context: HandlerContext) => check(deps, plans, context),
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
    erp: findWipeErp,
};

export const demoDataHandlers = createDemoDataHandlers(DEFAULT_DEMO_DATA_DEPS);
