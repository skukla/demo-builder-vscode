/**
 * Project reset's second data question (datapack-engine step 10): when the demo's STORE also holds
 * things Demo Builder did not install, offer to clear those too, and close its orders. Opt in, and
 * cannot be undone.
 *
 * The plan's design was one unticked box under the datapack question. A VS Code modal has no
 * checkbox, so it is the next question, asked only when there is something to clear, with the
 * safe answer as the close button: Esc keeps everything, as it does for the datapack question.
 * It is asked after the SC chose to remove the datapack, or when the project names none: keeping
 * the datapack must not clear its data under another name.
 *
 * The store asked about is the project's own: the store its recorded store view belongs to
 * (`projectStoreChoice`), the same reading the Data Installer's check takes its default from. The
 * list is made early (beside the datapack check) and the clearing later goes ahead only when the
 * store would clear nothing that list did not hold (`clearShown`); what the datapack's removal took
 * in between is fine. No outcome here may fail the reset: every one is a log line.
 *
 * **Not asked for a store another project on this machine records as its own** (`readWipeClaims`,
 * owner 2026-10-30): scratch-1028 records JustRite's store, so its reset offered to clear JustRite's
 * live demo. The SC is told nothing extra: they asked to reset their storefront, never saw this
 * question, and a notice about a question not asked would be the only unexplained thing on screen.
 * Debug Logs carries the one line naming the other project. What any project's install records list
 * on the store's website is left too.
 *
 * @module features/eds/services/reset/edsResetOtherData
 */

import { loadOtherProjects } from '@/core/state/otherProjects';
import { andList } from '@/core/utils/andList';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import { projectCommerce } from '@/features/data-installer/services/buildDatapackEngine';
import { commerceBackendOf } from '@/features/data-installer/services/commerceBackend';
import { type RecordFiles, nodeRecordFiles } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { RemovalAccess } from '@/features/data-installer/services/demoBuilderEngine/removers';
import { type WipeClaims, projectStoreChoice, readWipeClaims } from '@/features/data-installer/services/demoDataWipe/wipeClaims';
import { type WipePlan, planWipe } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { readWipeStructure } from '@/features/data-installer/services/demoDataWipe/wipeReads';
import { clearShown } from '@/features/data-installer/services/demoDataWipe/wipeRun';
import { resolveWipeScope } from '@/features/data-installer/services/demoDataWipe/wipeScope';
import type { Project } from '@/types/base';
import type { WipeStoreChoice } from '@/types/demoDataWipe';
import type { HandlerContext } from '@/types/handlers';

const LOG_PREFIX = '[EdsReset]';

/** The project's store and records, and the other local projects, handed in so a test drives fakes. */
export interface OtherDataDeps {
    commerce: (project: Project, context: HandlerContext) => Promise<RemovalAccess | { refusal: string }>;
    files: RecordFiles;
    /** Every other project on this machine, as the projects list reads them. */
    others: (project: Project, context: HandlerContext) => Promise<Project[]>;
}

export const DEFAULT_OTHER_DATA_DEPS: OtherDataDeps = {
    commerce: (project, context) => projectCommerce({ project, authManager: context.authManager, secrets: context.context?.secrets })(),
    files: nodeRecordFiles,
    others: (project, context) => loadOtherProjects(context, project.path),
};

/** What clearing these stores from the project must respect, read from the store as it is now. */
async function claimsOf(project: Project, context: HandlerContext, deps: OtherDataDeps, commerce: RemovalAccess, stores: WipeStoreChoice[] | undefined) {
    const structure = await readWipeStructure(commerce.get);
    const chosen = stores ?? [projectStoreChoice(structure, project)].flatMap((s) => s ?? []);
    if (chosen.length === 0) return undefined;
    const scope = resolveWipeScope(structure, chosen);
    const claims: WipeClaims = await readWipeClaims(deps.files, project, await deps.others(project, context), structure, scope);
    return { structure, scope, claims };
}

/**
 * What clearing the project's store would remove, started early, awaited late. **Never rejects**:
 * no store, no Commerce, or a read that fails answers undefined, and the question is not asked.
 */
export async function beginOtherDataCheck(project: Project, context: HandlerContext, deps: OtherDataDeps = DEFAULT_OTHER_DATA_DEPS): Promise<WipePlan | undefined> {
    try {
        if (!commerceBackendOf(project)) return undefined;
        const commerce = await deps.commerce(project, context);
        if ('refusal' in commerce) return undefined;
        const read = await claimsOf(project, context, deps, commerce, undefined);
        if (!read) return undefined;
        if ('refusal' in read.claims) {
            context.logger.info(`${LOG_PREFIX} Not offering to clear the store: ${read.claims.refusal}`);
            return undefined;
        }
        return await planWipe(commerce.get, read.structure, read.scope, read.claims.records);
    } catch (error) {
        context.logger.debug(`${LOG_PREFIX} What else the store holds could not be read: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}

const counted = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** "18 products, 13 categories and 2 customers", the kinds with anything in them. */
function kindsLine(plan: WipePlan): string {
    const { remove, takenOff } = plan.preview;
    return andList(
        [
            remove.products.count + takenOff.count > 0 ? counted(remove.products.count + takenOff.count, 'product', 'products') : '',
            remove.categories.count > 0 ? counted(remove.categories.count, 'category', 'categories') : '',
            remove.customers.count > 0 ? counted(remove.customers.count, 'customer', 'customers') : '',
        ].filter(Boolean),
    );
}

/** " Its orders will be closed, never deleted: 12 canceled, 4 refunded and 2 returns closed." when there are any. */
function ordersLine(plan: WipePlan): string {
    const { cancel, refund, leftOpen, returns } = plan.preview.orders;
    const parts = [
        cancel.count > 0 ? `${cancel.count} canceled` : '',
        refund.count > 0 ? `${refund.count} refunded` : '',
        leftOpen.count > 0 ? `${leftOpen.count} left open with a note` : '',
        returns.count > 0 ? `${counted(returns.count, 'return', 'returns')} closed` : '',
    ].filter(Boolean);
    return parts.length > 0 ? ` Its orders will be closed, never deleted: ${andList(parts)}.` : '';
}

/**
 * Ask whether to clear the rest, when there is any. The message names the store and says it
 * cannot be undone; Esc and "Keep Them" both keep everything.
 */
export async function confirmClearOtherData(vscode: typeof import('vscode'), plan: WipePlan | undefined): Promise<boolean> {
    if (!plan || plan.preview.total === 0) return false;
    const { stores, takenOff, left } = plan.preview;
    const store = stores.map((s) => `${s.storeName} (${s.storeCode}, website ${s.websiteCode})`).join(', ');
    const clearButton: import('vscode').MessageItem = { title: 'Remove Those Too' };
    const keepButton: import('vscode').MessageItem = { title: 'Keep Them', isCloseAffordance: true };
    const holds = kindsLine(plan) ? `also holds ${kindsLine(plan)} Demo Builder didn't install.` : "holds orders Demo Builder didn't place.";
    const shared = takenOff.count > 0 ? ` ${counted(takenOff.count, 'product', 'products')} another website also sells will only be taken off this one.` : '';
    const leftLine = left.length > 0 ? ` Some things are left: ${left.map((l) => `${l.count} ${l.kind} (${l.why})`).join('; ')}.` : '';
    const answer = await vscode.window.showWarningMessage(
        `This demo's store, ${store}, ${holds}${ordersLine(plan)}${shared}${leftLine} ` + "Also remove those, to leave this demo's store empty? This can't be undone.",
        { modal: true },
        clearButton,
        keepButton,
    );
    return answer?.title === clearButton.title;
}

function notCleared(context: HandlerContext, why: string): { cleared: false; sentence: string } {
    const sentence = `The store was not cleared: ${why}`;
    context.logger.warn(`${LOG_PREFIX} ${sentence}`);
    return { cleared: false, sentence };
}

/**
 * Clear what the SC was shown. Reports rather than throws: the reset stands whatever happens here.
 *
 * @returns what it did, or why it did nothing, in one sentence (also logged)
 */
export async function clearProjectOtherData(
    project: Project,
    context: HandlerContext,
    report: ReportStage,
    plan: WipePlan,
    deps: OtherDataDeps = DEFAULT_OTHER_DATA_DEPS,
): Promise<{ cleared: boolean; sentence: string }> {
    try {
        const commerce = await deps.commerce(project, context);
        if ('refusal' in commerce) return notCleared(context, commerce.refusal);
        const read = await claimsOf(project, context, deps, commerce, plan.choices);
        if (!read) return notCleared(context, 'the project names no store');
        if ('refusal' in read.claims) return notCleared(context, read.claims.refusal);
        const outcome = await clearShown(commerce, plan, read.claims.records, (stage) => report(stage));
        const log = outcome.failed.length > 0 ? context.logger.warn : context.logger.info;
        log.call(context.logger, `${LOG_PREFIX} ${outcome.sentence}`);
        return { cleared: true, sentence: outcome.sentence };
    } catch (error) {
        const sentence = `The store was not cleared, reset stands: ${error instanceof Error ? error.message : String(error)}`;
        context.logger.warn(`${LOG_PREFIX} ${sentence}`);
        return { cleared: false, sentence };
    }
}
