/**
 * Category pages and the catalog menu, written at the END of project creation (EDS-24).
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

import { daLiveOps, helixFor, storefrontTarget } from '@/features/ai/server/storefrontPages';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import {
    isEmptyRecord,
    readCatalogMenuRecord,
    writeCatalogMenuRecord,
} from '@/features/eds/services/catalogMenu/catalogMenuRecord';
import { createCatalogMenuSite, type CatalogMenuTarget } from '@/features/eds/services/catalogMenu/catalogMenuSiteDeps';
import { applyCatalogMenuStep, type CatalogMenuSite } from '@/features/eds/services/catalogMenu/catalogMenuStep';
import type { ProgressReporter } from '@/features/project-creation/services/catalogPrewarmPhase';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

const STAGE = 'Writing Category Pages';
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
    try {
        const target = storefrontTarget(project);
        if (!target) return;
        carryRecord(project, existingProject, target);
        const site = makeSite
            ? makeSite(target)
            : createCatalogMenuSite({
                  project,
                  target,
                  daLive: daLiveOps(context),
                  helix: helixFor(context),
                  github: getGitHubServices(context.context.secrets).fileOperations,
              });
        const summary = await applyCatalogMenuStep(project, site);
        if (summary === undefined) return;
        context.logger.info(`[Catalog Menu] ${summary}`);
        progressTracker(STAGE, PERCENT, summary);
    } catch (error) {
        // Belt and braces: the step already swallows its own failures.
        context.logger.warn(`[Catalog Menu] Phase failed: ${(error as Error).message}`);
    }
}
