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
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

const PERCENT = 97;

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
): Promise<void> {
    const say = sayer(context, progressTracker, OPERATION_STAGES.addingCatalogMenu.label);
    await runCatalogMenu(context, project, say, makeSite, (target) =>
        carryRecord(project, existingProject, target),
    );
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
    await runCatalogMenu(context, project, say, makeSite, undefined, async (site) => {
        const removed = await removeCatalogMenuStep(project, site);
        if (removed !== undefined) say(removed.summary);
    });
}

/** Logs and shows one catalog menu sentence under `step`. */
function sayer(
    context: HandlerContext,
    progressTracker: ProgressReporter,
    step: string,
): (summary: string) => void {
    return (summary) => {
        context.logger.info(`[Catalog Menu] ${summary}`);
        progressTracker(step, PERCENT, summary);
    };
}

/** Resolve the site, run what comes first, then the write. Never throws. */
async function runCatalogMenu(
    context: HandlerContext,
    project: Project,
    say: (summary: string) => void,
    makeSite: ((target: CatalogMenuTarget) => CatalogMenuSite) | undefined,
    beforeSite?: (target: CatalogMenuTarget) => void,
    beforeWrite?: (site: CatalogMenuSite) => Promise<void>,
): Promise<void> {
    try {
        const target = storefrontTarget(project);
        if (!target) return;
        beforeSite?.(target);
        const site = makeSite ? makeSite(target) : catalogMenuSiteFor(context, project);
        if (!site) return;
        await beforeWrite?.(site);
        const summary = (await applyCatalogMenuStep(project, site))?.summary;
        if (summary !== undefined) say(summary);
    } catch (error) {
        // Belt and braces: the step already swallows its own failures.
        context.logger.warn(`[Catalog Menu] Phase failed: ${(error as Error).message}`);
    }
}
