/**
 * Project reset's second data question (datapack-engine step 10): when the demo's website also
 * holds things Demo Builder did not install, offer to clear those too. Opt in, and cannot be undone.
 *
 * The plan's design was one unticked box under the datapack question. A VS Code modal has no
 * checkbox, so it is the next question, asked only when there is something to clear, with the
 * safe answer as the close button: Esc keeps everything, as it does for the datapack question.
 * It is asked after the SC chose to remove the datapack, or when the project names none: keeping
 * the datapack must not clear its data under another name.
 *
 * The list is made early (beside the datapack check) and the clearing later goes ahead only when
 * the store would clear nothing that list did not hold (`clearShown`); what the datapack's removal
 * took in between is fine. No outcome here may fail the reset: every one is a log line.
 *
 * **Not asked for a website another project on this machine records as its own** (`readWipeClaims`,
 * owner 2026-10-30): scratch-1028 records JustRite's website, so its reset offered to clear JustRite's
 * live demo. The SC is told nothing extra: they asked to reset their storefront, never saw this
 * question, and a notice about a question not asked would be the only unexplained thing on screen.
 * Debug Logs carries the one line naming the other project. What any project's install records list
 * on the website is left too.
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
import { type WipeClaims, readWipeClaims } from '@/features/data-installer/services/demoDataWipe/wipeClaims';
import { type WipePlan, planWipe } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { clearShown } from '@/features/data-installer/services/demoDataWipe/wipeRun';
import { resolveInstallTarget } from '@/features/data-installer/services/sampleDataInstall';
import type { Project } from '@/types/base';
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

async function claimsOf(project: Project, context: HandlerContext, deps: OtherDataDeps, websiteCode: string): Promise<WipeClaims> {
    return readWipeClaims(deps.files, project, await deps.others(project, context), websiteCode);
}

/**
 * What clearing the project's website would remove, started early, awaited late. **Never rejects**:
 * no website, no Commerce, or a read that fails answers undefined, and the question is not asked.
 */
export async function beginOtherDataCheck(project: Project, context: HandlerContext, deps: OtherDataDeps = DEFAULT_OTHER_DATA_DEPS): Promise<WipePlan | undefined> {
    try {
        const websiteCode = resolveInstallTarget(project)?.websiteCode;
        if (!websiteCode || !commerceBackendOf(project)) return undefined;
        const claims = await claimsOf(project, context, deps, websiteCode);
        if ('refusal' in claims) {
            context.logger.info(`${LOG_PREFIX} Not offering to clear the website: ${claims.refusal}`);
            return undefined;
        }
        const commerce = await deps.commerce(project, context);
        if ('refusal' in commerce) return undefined;
        return await planWipe(commerce.get, websiteCode, claims.records);
    } catch (error) {
        context.logger.debug(`${LOG_PREFIX} What else the website holds could not be read: ${error instanceof Error ? error.message : String(error)}`);
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

/**
 * Ask whether to clear the rest, when there is any. The message names the website and says it
 * cannot be undone; Esc and "Keep Them" both keep everything.
 */
export async function confirmClearOtherData(vscode: typeof import('vscode'), plan: WipePlan | undefined): Promise<boolean> {
    if (!plan || plan.preview.total === 0) return false;
    const { website, takenOff, left } = plan.preview;
    const clearButton: import('vscode').MessageItem = { title: 'Remove Those Too' };
    const keepButton: import('vscode').MessageItem = { title: 'Keep Them', isCloseAffordance: true };
    const shared = takenOff.count > 0 ? ` ${counted(takenOff.count, 'product', 'products')} another website also sells will only be taken off this one.` : '';
    const leftLine = left.length > 0 ? ` Some things are left: ${left.map((l) => `${l.count} ${l.kind} (${l.why})`).join('; ')}.` : '';
    const answer = await vscode.window.showWarningMessage(
        `This demo's store, the website ${website.name} (${website.code}), also holds ${kindsLine(plan)} Demo Builder didn't install.${shared}${leftLine} ` +
            "Also remove those, to leave this demo's store empty? This can't be undone.",
        { modal: true },
        clearButton,
        keepButton,
    );
    return answer?.title === clearButton.title;
}

function notCleared(context: HandlerContext, why: string): { cleared: false; sentence: string } {
    const sentence = `The website was not cleared: ${why}`;
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
        const claims = await claimsOf(project, context, deps, plan.preview.website.code);
        if ('refusal' in claims) return notCleared(context, claims.refusal);
        const commerce = await deps.commerce(project, context);
        if ('refusal' in commerce) return notCleared(context, commerce.refusal);
        const outcome = await clearShown(commerce, plan, claims.records, (stage) => report(stage));
        const log = outcome.failed.length > 0 ? context.logger.warn : context.logger.info;
        log.call(context.logger, `${LOG_PREFIX} ${outcome.sentence}`);
        return { cleared: true, sentence: outcome.sentence };
    } catch (error) {
        const sentence = `The website was not cleared, reset stands: ${error instanceof Error ? error.message : String(error)}`;
        context.logger.warn(`${LOG_PREFIX} ${sentence}`);
        return { cleared: false, sentence };
    }
}
