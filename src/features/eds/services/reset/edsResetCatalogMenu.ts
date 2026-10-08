/**
 * Reset's two touches on the category pages and the catalog menu (EDS-24), on reset's
 * own clients.
 *
 * Reset takes the pages and the switch out with the stored record before re-copying the
 * content, and writes them again after it is published (`edsResetService.ts`).
 *
 * @module features/eds/services/reset/edsResetCatalogMenu
 */

import { createCatalogMenuSite } from '../catalogMenu/catalogMenuSiteDeps';
import {
    applyCatalogMenuStep,
    removeCatalogMenuStep,
    type CatalogMenuSite,
} from '../catalogMenu/catalogMenuStep';
import type { DaLiveContentOperations } from '../daLive/daLiveContentOperations';
import type { TokenProvider } from '../daLive/daLiveOrgOperations';
import type { GitHubFileOperations } from '../github/githubFileOperations';
import type { GitHubTokenService } from '../github/githubTokenService';
import { HelixService } from '../helix/helixService';
import type { EdsResetParams } from './edsResetParams';
import type { Logger } from '@/types/logger';

/** The clients reset already holds. */
interface ResetClients {
    daLiveContentOps: DaLiveContentOperations;
    githubFileOps: GitHubFileOperations;
    githubTokenService: GitHubTokenService;
    tokenProvider: TokenProvider;
}

type Report = (step: number, message: string) => void;

/** Log and show one catalog menu sentence, when there is one. */
function say(summary: string | undefined, step: number, logger: Logger, report: Report): void {
    if (summary === undefined) return;
    logger.info(`[EdsReset] Catalog menu: ${summary}`);
    report(step, summary);
}

/**
 * Before the content is cleared and re-copied: take out the pages and the switch the
 * stored record proves Demo Builder wrote, so a reset that keeps the content still
 * returns `/nav` and the site to the template's state.
 *
 * @param params - the reset's parameters: the project and its storefront coordinates
 * @param logger - the reset's logger
 * @param clients - the DA.live, GitHub and token clients reset built
 * @param report - the reset's progress reporter
 * @returns the site, for {@link putBackCatalogMenu}
 */
export async function takeOutCatalogMenu(
    params: EdsResetParams,
    logger: Logger,
    clients: ResetClients,
    report: Report,
): Promise<CatalogMenuSite> {
    const site = createCatalogMenuSite({
        project: params.project,
        target: params,
        daLive: clients.daLiveContentOps.sourceOps,
        helix: new HelixService(logger, clients.githubTokenService, clients.tokenProvider),
        github: clients.githubFileOps,
    });
    say(await removeCatalogMenuStep(params.project, site.pages), 8, logger, report);
    return site;
}

/**
 * After the content is published: the same step storefront setup and republish run.
 * The record lands on the project, which the reset's final save keeps.
 *
 * @returns the sentence for the reset's result, or undefined when there was nothing to say
 */
export async function putBackCatalogMenu(
    params: EdsResetParams,
    site: CatalogMenuSite,
    logger: Logger,
    report: Report,
): Promise<string | undefined> {
    const summary = await applyCatalogMenuStep(params.project, site);
    say(summary, 11, logger, report);
    return summary;
}
