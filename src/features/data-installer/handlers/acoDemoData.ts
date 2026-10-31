/**
 * The ACO half of Clear demo data (PL-60, owner 2026-10-31: needed): `check-demo-data` and
 * `clear-demo-data` asked with `aco: true` come here instead of to the Commerce stores.
 *
 * Same two steps, same safety: the check plans and names what would go, under a token; the clear
 * deletes only the plan shown, by that token, and only with `confirm`. What the plan reads and
 * deletes, and its one limit (only what the catalog view shows), is `services/aco/acoWipe.ts`.
 *
 * No org check: the ingestion credential is the project's own OAuth client, not the signed-in
 * Adobe account, so the account's org does not decide what it reaches.
 *
 * @module features/data-installer/handlers/acoDemoData
 */

import type { AcoAccess } from '../services/aco/acoJobs';
import { type AcoSearch, AcoSearchError, type AcoWipePlan, planAcoWipe, runAcoWipe } from '../services/aco/acoWipe';
import { type InstallRecord, type RecordFiles, readProjectRecords } from '../services/demoBuilderEngine/installRecord';
import type { AcoStorefrontSettings } from '@/types/aco';
import type { Project } from '@/types/base';
import type { DemoDataRequest } from '@/types/demoDataWipe';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';

/** What the ACO path needs, handed in so a test drives it against a fake ACO. */
export interface AcoDemoDataDeps {
    aco: (context: HandlerContext, project: Project) => Promise<AcoAccess | { refusal: string }>;
    search: (settings: AcoStorefrontSettings) => AcoSearch;
    files: RecordFiles;
    others: (context: HandlerContext, project: Project) => Promise<Project[]>;
}

/** The plans shown, by token; a few is plenty, since one is shown per question. */
const PLANS_KEPT = 10;

function keep(plans: Map<string, AcoWipePlan>, plan: AcoWipePlan): void {
    plans.set(plan.preview.token, plan);
    while (plans.size > PLANS_KEPT) plans.delete(plans.keys().next().value as string);
}

/** Every install record on this machine: this project's and every other local project's. */
async function allRecords(deps: AcoDemoDataDeps, context: HandlerContext, project: Project): Promise<InstallRecord[]> {
    const others = await deps.others(context, project);
    const lists = await Promise.all([project, ...others].map((p) => readProjectRecords(deps.files, p.path)));
    return lists.flat();
}

function failure(context: HandlerContext, error: unknown, fallback: string): HandlerResponse {
    if (error instanceof AcoSearchError) return { success: false, error: `${fallback} ${error.message}` };
    context.logger.warn(`${LOG_PREFIX} ${fallback} ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, error: `${fallback} Details are in Debug Logs.`, code: ErrorCode.UNKNOWN };
}

/** What clearing the project's ACO catalog would do, under a token. */
export async function checkAco(deps: AcoDemoDataDeps, plans: Map<string, AcoWipePlan>, context: HandlerContext): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return { success: false, error: 'No project is open.' };
    try {
        const access = await deps.aco(context, project);
        if ('refusal' in access) return { success: false, error: access.refusal };
        const plan = await planAcoWipe(deps.search(access.settings), access.settings, await allRecords(deps, context, project));
        keep(plans, plan);
        return { success: true, data: { choices: [], aco: plan.preview } };
    } catch (error) {
        return failure(context, error, 'What the ACO catalog holds could not be read.');
    }
}

/** "1 product", "2 products". */
const counted = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** The sentence a clearing ends on. */
function doneSentence(done: { products: number; prices: number; categories: number }): string {
    const parts = [
        counted(done.products, 'product', 'products'),
        ...(done.prices ? [counted(done.prices, 'price', 'prices')] : []),
        counted(done.categories, 'category', 'categories'),
    ];
    return `Removed ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]} from the ACO catalog.`;
}

/** The refusal an unconfirmed or unchecked ACO clearing answers. */
function clearRefusal(payload: DemoDataRequest | undefined): string | undefined {
    if (!payload?.token) return 'Check what would be removed first (check_demo_data with aco), and hand its token back.';
    if (payload.confirm !== true) {
        return 'This deletes the products, prices and categories the ACO catalog view shows that Demo Builder did not install, as listed. It cannot be undone. Confirm to proceed.';
    }
    return undefined;
}

/**
 * Clear the plan shown: its prices, products and categories, through the project's ingestion
 * client for the plan's instance.
 *
 * @param report - each stage as it starts, for the progress window
 */
export async function clearAco(
    deps: AcoDemoDataDeps,
    plans: Map<string, AcoWipePlan>,
    context: HandlerContext,
    payload: DemoDataRequest | undefined,
    report: (stage: string) => void,
): Promise<HandlerResponse> {
    const refusal = clearRefusal(payload);
    if (refusal) return { success: false, error: refusal, code: ErrorCode.INVALID_OPERATION };
    const shown = plans.get(payload?.token ?? '');
    if (!shown) return { success: false, error: 'That list is no longer known here. Check what would be removed again.' };
    const project = await context.stateManager.getCurrentProject();
    if (!project) return { success: false, error: 'No project is open.' };
    try {
        const access = await deps.aco(context, project);
        if ('refusal' in access) return { success: false, error: access.refusal };
        plans.delete(shown.preview.token);
        const done = await runAcoWipe(shown, access.clientFor(shown.settings), report);
        const sentence = doneSentence(done);
        context.logger.info(`${LOG_PREFIX} ${sentence}`);
        return { success: true, note: sentence, data: done };
    } catch (error) {
        return failure(context, error, 'The ACO catalog could not be cleared.');
    }
}
