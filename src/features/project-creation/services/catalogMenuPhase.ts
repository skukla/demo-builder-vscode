/**
 * Category pages and the catalog menu, published at the END of project creation (EDS-24,
 * EDS-61: through the product page overlay).
 *
 * Storefront setup in the wizard runs before the project exists and before its datapack
 * lands, so — like catalog pre-warming (`catalogPrewarmPhase.ts`) — this runs here,
 * after the sample data phase, when the project is real and its categories are in
 * Commerce. Reset and republish run the same step (`catalogMenuStep.ts`) on their own
 * paths, so a project created today and one reset later end the same way.
 *
 * Acts only when the new storefront has the `catalog-menu` block (the Demo Builder
 * Blocks library). The step's sentence — pages written, and a colleague's pages left
 * alone by name — goes on the progress line and in the log.
 *
 * Never throws: a storefront without its category pages is still a working storefront.
 *
 * @module features/project-creation/services/catalogMenuPhase
 */

import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { catalogMenuSiteFor, storefrontTarget } from '@/features/ai/server/storefrontPages';
import {
    isEmptyRecord,
    readCatalogMenuRecord,
    writeCatalogMenuRecord,
} from '@/features/eds/services/catalogMenu/catalogMenuRecord';
import type { CatalogMenuTarget } from '@/features/eds/services/catalogMenu/catalogMenuSiteDeps';
import {
    applyCatalogMenuStep,
    removeCatalogMenuStep,
    type CatalogMenuSite,
} from '@/features/eds/services/catalogMenu/catalogMenuStep';
import type { ProgressReporter } from '@/features/project-creation/services/catalogPrewarmPhase';
import { type StepFailure, stepFailureOf } from '@/features/project-creation/services/stepFailure';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

const PERCENT = 97;

/**
 * Shown while a swap builds the new menu, after the old one came out (owner, 2026-11-16): the
 * removal's own sentence stood alone for the half minute the new pages took, so the step read as if
 * the menu were only taken away. The removal's sentence still goes to the log.
 */
export const SWAP_LINE = 'Took the old catalog menu out. Building the new one.';

/**
 * Edit mode rebuilds the project's component instances from scratch, which would drop
 * the record of what Demo Builder wrote and turn its own pages into "someone else's".
 * Carry the record over when the storefront is the same one.
 */
function carryRecord(project: Project, existing: Project | undefined, target: CatalogMenuTarget): void {
    if (!existing) return;
    const before = storefrontTarget(existing);
    if (before?.repoOwner !== target.repoOwner || before.repoName !== target.repoName) return;
    const carried = readCatalogMenuRecord(existing);
    if (isEmptyRecord(readCatalogMenuRecord(project))) writeCatalogMenuRecord(project, carried);
}

/**
 * @param context - Handler context (sign-ins, logger)
 * @param project - The project just created — real, and seeded
 * @param progressTracker - Creation progress reporter
 * @param existingProject - In edit mode, the project as it was before the edit
 * @param makeSite - Site seam; production builds it from this call's clients
 */
export async function executeCatalogMenuPhase(
    context: HandlerContext,
    project: Project,
    progressTracker: ProgressReporter,
    existingProject?: Project,
    makeSite?: (target: CatalogMenuTarget) => CatalogMenuSite,
): Promise<StepFailure | undefined> {
    const { label, detail } = OPERATION_STAGES.addingCatalogMenu;
    const say = sayer(context, progressTracker, label);
    return runCatalogMenu(context, project, say, makeSite, (target) =>
        carryRecord(project, existingProject, target),
    undefined, () => progressTracker(label, PERCENT, detail));
}

/**
 * The same phase after an Edit that removed the old datapack's data (PL-75): first
 * Reset's own removal of what Demo Builder wrote (only pages nobody has edited, by
 * the recorded hashes), then the same write, for the categories there are now. The
 * write alone keeps claiming a page whose category is gone, so it stayed published
 * after its category was deleted.
 *
 * @param context - Handler context (sign-ins, logger)
 * @param project - The project, with its new datapack in place
 * @param progressTracker - The wizard's progress reporter
 * @param makeSite - Site seam; production builds it from this call's clients
 */
export async function rewriteCatalogMenuPhase(
    context: HandlerContext,
    project: Project,
    progressTracker: ProgressReporter,
    makeSite?: (target: CatalogMenuTarget) => CatalogMenuSite,
): Promise<void> {
    // A swap: Republish's step for the same job after a store change.
    const say = sayer(context, progressTracker, OPERATION_STAGES.updatingCatalogMenu.label);
    // An Edit's swap stays as it was: it shows its problem and goes on.
    await runCatalogMenu(context, project, say, makeSite, undefined, async (site) => {
        const removed = await removeCatalogMenuStep(project, site);
        if (removed !== undefined) say(removed.summary, SWAP_LINE);
    });
}

/** Logs one catalog menu sentence and shows it under `step`, or `shown` in its place. */
function sayer(
    context: HandlerContext,
    progressTracker: ProgressReporter,
    step: string,
): (summary: string, shown?: string) => void {
    return (summary, shown = summary) => {
        context.logger.info(`[Catalog Menu] ${summary}`);
        progressTracker(step, PERCENT, shown);
    };
}

/**
 * The site, saying the step has started once it confirms the storefront has the menu block: the
 * step said nothing until it ended, so the screen sat on the step before it (walk F207).
 */
function announcing(site: CatalogMenuSite, onStart: () => void): CatalogMenuSite {
    return {
        ...site,
        hasBlock: async () => {
            const has = await site.hasBlock();
            if (has) onStart();
            return has;
        },
    };
}

/** Resolve the site, run what comes first, then the write. Never throws: resolves a failure. */
async function runCatalogMenu(
    context: HandlerContext,
    project: Project,
    say: (summary: string) => void,
    makeSite: ((target: CatalogMenuTarget) => CatalogMenuSite) | undefined,
    beforeSite?: (target: CatalogMenuTarget) => void,
    beforeWrite?: (site: CatalogMenuSite) => Promise<void>,
    onStart?: () => void,
): Promise<StepFailure | undefined> {
    try {
        const target = storefrontTarget(project);
        if (!target) return undefined;
        beforeSite?.(target);
        const built = makeSite ? makeSite(target) : catalogMenuSiteFor(context, project);
        if (!built) return undefined;
        const site = onStart ? announcing(built, onStart) : built;
        await beforeWrite?.(site);
        const result = await applyCatalogMenuStep(project, site);
        if (result?.summary !== undefined) say(result.summary);
        return result && !result.ok ? stepFailureOf(result.summary) : undefined;
    } catch (error) {
        // Belt and braces: the step already swallows its own failures.
        context.logger.warn(`[Catalog Menu] Phase failed: ${(error as Error).message}`);
        // The library's words stay in the log above; the SC reads the step's own.
        return stepFailureOf('The catalog menu could not be added. Check that DA.live and GitHub are signed in, then try again.');
    }
}
