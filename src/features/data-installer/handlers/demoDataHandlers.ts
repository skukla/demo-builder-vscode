/**
 * Clearing a demo's part of the store (datapack-engine step 10): two handlers, one the agent tools
 * reach and project reset's question uses the same services as.
 *
 * - `check-demo-data`: what this project's install records list, and what else is on the website
 *   that a clearing would remove, take off or leave, with why. Reads only. The plan is kept here by
 *   its token, so the clearing can be held to it.
 * - `clear-demo-data`: confirm-gated, and never defaulted: it names the website, and is handed the
 *   token of the list the SC (or the agent's user) was shown. It goes ahead only when the store
 *   would clear nothing that list did not hold (`clearShown`). Cannot be undone.
 *
 * Both first read every other project on this machine (`readWipeClaims`): a website another project
 * records as its own is refused, naming it, before the store is opened (the check answers that as a
 * normal answer, `WipeRefusal`, so an agent explains it); and what any project's install records list
 * on the website is left.
 *
 * Both open the project's own signed Commerce access (`projectCommerce`, Store: `all`), after the
 * sign-in is checked against the org that owns the store (`orgGuard`, adobe-org-context).
 *
 * @module features/data-installer/handlers/demoDataHandlers
 */

import { projectCommerce } from '../services/buildDatapackEngine';
import { type InstallRecord, type RecordFiles, nodeRecordFiles } from '../services/demoBuilderEngine/installRecord';
import type { RemovalAccess } from '../services/demoBuilderEngine/removers';
import { type WipeClaims, readWipeClaims } from '../services/demoDataWipe/wipeClaims';
import { type WipePlan, planWipe } from '../services/demoDataWipe/wipePlan';
import { WipeScopeError } from '../services/demoDataWipe/wipeReads';
import { WipeChangedError, clearShown } from '../services/demoDataWipe/wipeRun';
import { resolveInstallTarget } from '../services/sampleDataInstall';
import { loadOtherProjects } from '@/core/state/otherProjects';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';

/** What either handler may be sent. Checked here: an agent sends these too. */
export interface DemoDataPayload {
    /** The website to look at or clear, by code. The check defaults to the project's; the clearing never does. */
    websiteCode?: string;
    /** Clear only: the token of the list shown (`check-demo-data`'s answer). */
    token?: string;
    /** Clear only: must be true. */
    confirm?: boolean;
}

/** What the handlers need, handed in so a test drives them against a fake store. */
export interface DemoDataDeps {
    commerce: (context: HandlerContext, project: Project) => Promise<RemovalAccess | { refusal: string }>;
    guard: (context: HandlerContext, project: Project) => Promise<string | undefined>;
    files: RecordFiles;
    /** Every other project on this machine, as the projects list reads them. */
    others: (context: HandlerContext, project: Project) => Promise<Project[]>;
}

/** The check's answer when another project records the website as its own: nothing to clear from here. */
export interface WipeRefusal {
    website: { code: string };
    /** One sentence naming the other project, for the agent to say. */
    refused: string;
}

/** The plans shown, by token, newest last; a few is plenty, since one is shown per question. */
const PLANS_KEPT = 10;

function keep(plans: Map<string, WipePlan>, plan: WipePlan): void {
    plans.set(plan.preview.token, plan);
    while (plans.size > PLANS_KEPT) plans.delete(plans.keys().next().value as string);
}

const NO_PROJECT: HandlerResponse = { success: false, error: 'No project is open.' };

/** The project's store, or the response to answer instead. */
async function openStore(deps: DemoDataDeps, context: HandlerContext, project: Project): Promise<{ commerce: RemovalAccess } | { response: HandlerResponse }> {
    const mismatch = await deps.guard(context, project);
    if (mismatch) return { response: { success: false, error: mismatch, code: ErrorCode.ORG_MISMATCH } };
    const commerce = await deps.commerce(context, project);
    if ('refusal' in commerce) return { response: { success: false, error: commerce.refusal } };
    return { commerce };
}

async function claimsOf(deps: DemoDataDeps, context: HandlerContext, project: Project, websiteCode: string): Promise<WipeClaims> {
    return readWipeClaims(deps.files, project, await deps.others(context, project), websiteCode);
}

function failure(context: HandlerContext, error: unknown, fallback: string): HandlerResponse {
    if (error instanceof WipeScopeError) return { success: false, error: error.message };
    context.logger.warn(`${LOG_PREFIX} ${fallback} ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, error: `${fallback} Details are in Debug Logs.`, code: ErrorCode.UNKNOWN };
}

/** The refusal an unconfirmed or unnamed clearing answers: which website, and that it cannot be undone. */
function clearRefusal(payload: DemoDataPayload | undefined): string | undefined {
    if (!payload?.websiteCode) return 'Name the website to clear (websiteCode). It is never taken from the project.';
    if (!payload.token) return 'Check what would be removed first (check_demo_data), and hand its token back.';
    if (payload.confirm !== true) {
        return `This removes everything on the website ${payload.websiteCode} that Demo Builder did not install, as listed. It cannot be undone. Confirm to proceed.`;
    }
    return undefined;
}

async function check(deps: DemoDataDeps, plans: Map<string, WipePlan>, context: HandlerContext, payload?: DemoDataPayload): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return NO_PROJECT;
    const websiteCode = payload?.websiteCode ?? resolveInstallTarget(project)?.websiteCode;
    if (!websiteCode) return { success: false, error: 'The project names no website. Name one (websiteCode).' };
    try {
        const claims = await claimsOf(deps, context, project, websiteCode);
        if ('refusal' in claims) return { success: true, data: { website: { code: websiteCode }, refused: claims.refusal } satisfies WipeRefusal };
        const opened = await openStore(deps, context, project);
        if ('response' in opened) return opened.response;
        const plan = await planWipe(opened.commerce.get, websiteCode, claims.records);
        keep(plans, plan);
        return { success: true, data: plan.preview };
    } catch (error) {
        return failure(context, error, 'What the website holds could not be read.');
    }
}

/** The store would now clear more than was shown: the new list is offered, never acted on. */
async function offerAgain(plans: Map<string, WipePlan>, commerce: RemovalAccess, shown: WipePlan, records: InstallRecord[], error: WipeChangedError): Promise<HandlerResponse> {
    const fresh = await planWipe(commerce.get, shown.preview.website.code, records);
    keep(plans, fresh);
    return { success: false, error: error.message, data: { preview: fresh.preview } };
}

/** Clear the list shown, from this project, when no other project claims its website. */
async function clearFor(deps: DemoDataDeps, plans: Map<string, WipePlan>, context: HandlerContext, project: Project, shown: WipePlan): Promise<HandlerResponse> {
    const claims = await claimsOf(deps, context, project, shown.preview.website.code);
    if ('refusal' in claims) {
        plans.delete(shown.preview.token);
        return { success: false, error: claims.refusal, code: ErrorCode.INVALID_OPERATION };
    }
    const opened = await openStore(deps, context, project);
    if ('response' in opened) return opened.response;
    try {
        const outcome = await clearShown(opened.commerce, shown, claims.records);
        plans.delete(shown.preview.token);
        context.logger.info(`${LOG_PREFIX} ${outcome.sentence}`);
        return { success: true, note: outcome.sentence, data: outcome };
    } catch (error) {
        if (!(error instanceof WipeChangedError)) throw error;
        plans.delete(shown.preview.token);
        return offerAgain(plans, opened.commerce, shown, claims.records, error);
    }
}

async function clear(deps: DemoDataDeps, plans: Map<string, WipePlan>, context: HandlerContext, payload?: DemoDataPayload): Promise<HandlerResponse> {
    const refusal = clearRefusal(payload);
    if (refusal) return { success: false, error: refusal, code: ErrorCode.INVALID_OPERATION };
    const shown = plans.get(payload?.token ?? '');
    if (!shown) return { success: false, error: 'That list is no longer known here. Check what would be removed again.' };
    if (shown.preview.website.code !== payload?.websiteCode) {
        return { success: false, error: `That list is for the website ${shown.preview.website.code}, not ${payload?.websiteCode}.` };
    }
    const project = await context.stateManager.getCurrentProject();
    if (!project) return NO_PROJECT;
    try {
        return await clearFor(deps, plans, context, project, shown);
    } catch (error) {
        return failure(context, error, 'The website could not be cleared.');
    }
}

/**
 * The two handlers over the deps given.
 *
 * @param deps - Commerce access, the org check, the record files and the other projects
 */
export function createDemoDataHandlers(deps: DemoDataDeps) {
    const plans = new Map<string, WipePlan>();
    return defineHandlers({
        'check-demo-data': (context: HandlerContext, payload?: DemoDataPayload) => check(deps, plans, context, payload),
        'clear-demo-data': (context: HandlerContext, payload?: DemoDataPayload) => clear(deps, plans, context, payload),
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
