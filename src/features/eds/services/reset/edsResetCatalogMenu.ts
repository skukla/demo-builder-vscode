/**
 * Reset's two touches on the category pages and the catalog menu (EDS-24, EDS-61), on
 * reset's own clients.
 *
 * Reset takes out what Demo Builder made before re-copying the content — the
 * authored-pages sheet (so the overlay leaves every category address alone while the
 * content is published again), the template and the nav switch while unedited, and any
 * page the old model wrote — and puts them back after the content is published
 * (`edsResetService.ts`): the sheet first, then the category pages, taking down those of
 * categories the store no longer has. Both sentences go on the reset's result.
 *
 * @module features/eds/services/reset/edsResetCatalogMenu
 */

import { createCatalogMenuSite } from '../catalogMenu/catalogMenuSiteDeps';
import {
    applyCatalogMenuStep,
    removeCatalogMenuStep,
    type CatalogMenuSite,
    type CatalogMenuStepResult,
} from '../catalogMenu/catalogMenuStep';
import type { DaLiveContentOperations } from '../daLive/daLiveContentOperations';
import type { TokenProvider } from '../daLive/daLiveOrgOperations';
import type { GitHubFileOperations } from '../github/githubFileOperations';
import type { GitHubTokenService } from '../github/githubTokenService';
import { HelixService } from '../helix/helixService';
import type { EdsResetParams, PageSentence } from './edsResetParams';
import { RESET_STEP } from '@/core/utils/resetStages';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

/** The clients reset already holds. */
interface ResetClients {
    daLiveContentOps: DaLiveContentOperations;
    githubFileOps: GitHubFileOperations;
    githubTokenService: GitHubTokenService;
    tokenProvider: TokenProvider;
}

/** The Helix calls the catalog menu makes; production builds a `HelixService`. */
type CatalogMenuHelix = Parameters<typeof createCatalogMenuSite>[0]['helix'];

/** What the take-out leaves for the put-back: the site, and what it said. */
export interface TakenOutCatalogMenu {
    site: CatalogMenuSite;
    /** The take-out's sentence and whether it did all it set out to; undefined when there was nothing of ours. */
    removed?: CatalogMenuStepResult;
}

type Report = (step: number, message: string) => void;

/** Log and show one catalog menu sentence, when there is one. */
function say(summary: string | undefined, step: number, logger: Logger, report: Report): void {
    if (summary === undefined) return;
    logger.info(`[EdsReset] Catalog menu: ${summary}`);
    report(step, summary);
}

/**
 * Before the content is cleared and re-copied: take out the category pages, the template
 * and the switch, so a reset that keeps the content still returns `/nav` and the site to
 * the template's state.
 *
 * @param params - the reset's parameters: the project and its storefront coordinates
 * @param context - the reset's logger and state manager
 * @param clients - the DA.live, GitHub and token clients reset built
 * @param report - the reset's progress reporter
 * @param helixSeam - Helix seam; production builds it from reset's clients
 * @returns the site and the sentence, for {@link putBackCatalogMenu}
 */
export async function takeOutCatalogMenu(
    params: EdsResetParams,
    context: { logger: Logger; stateManager: StateManager },
    clients: ResetClients,
    report: Report,
    helixSeam?: CatalogMenuHelix,
): Promise<TakenOutCatalogMenu> {
    const { logger, stateManager } = context;
    const site = createCatalogMenuSite({
        project: params.project,
        target: params,
        daLive: clients.daLiveContentOps.sourceOps,
        helix: helixSeam ?? new HelixService(logger, clients.githubTokenService, clients.tokenProvider),
        github: clients.githubFileOps,
        stateManager,
        logger,
        // The overlay reset registers the site with: one answer for both.
        overlay: params.byomOverlayUrl !== undefined,
    });
    const removed = await removeCatalogMenuStep(params.project, site);
    say(removed?.summary, RESET_STEP.clearingOldContent, logger, report);
    return { site, removed };
}

/**
 * After the content is published: the same step storefront setup and republish run.
 * The record lands on the project, which the reset's final save keeps.
 *
 * @returns both sentences for the reset's result, and whether either step left something
 *   undone; undefined when there was nothing to say
 */
export async function putBackCatalogMenu(
    params: EdsResetParams,
    taken: TakenOutCatalogMenu,
    logger: Logger,
    report: Report,
): Promise<PageSentence | undefined> {
    const built = await applyCatalogMenuStep(params.project, taken.site);
    say(built?.summary, RESET_STEP.addingCatalogMenu, logger, report);
    const both = [taken.removed, built].filter((s): s is CatalogMenuStepResult => s !== undefined);
    if (both.length === 0) return undefined;
    return { sentence: both.map((s) => s.summary).join(' '), problem: both.some((s) => !s.ok) };
}
