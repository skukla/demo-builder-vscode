/**
 * Reset's touch on the product pages the overlay published (EDS-26), on reset's own
 * clients.
 *
 * Product pages (`/products/{urlKey}/{sku}`) are not in DA.live, so re-copying the
 * content never cleared them: after a reset, every product of the OLD catalog still
 * had a live page. Reset now removes them before the content pipeline runs. The
 * pipeline's last step pre-warms the current catalog, so a reset ends with product
 * pages for the current catalog only (`edsResetService.ts`).
 *
 * The rules — which paths, the shared-repository refusal, the live-only fallback — are
 * `storefront/productPageRemoval.ts`. This module supplies reset's side of them:
 *
 * - the Helix site is `repoOwner/repoName`;
 * - the authored pages under `/products` are read from the project's DA.live site,
 *   folder by folder, and a listing that fails stops the removal;
 * - "another project" is any other local project on the same repository.
 *
 * Never throws; the sentence goes on the progress line, in the log and on the result.
 *
 * @module features/eds/services/reset/edsResetProductPages
 */

import type { DaLiveContentOperations } from '../daLive/daLiveContentOperations';
import type { TokenProvider } from '../daLive/daLiveOrgOperations';
import { listDaLivePages } from '../daLive/daLivePageWalk';
import type { GitHubTokenService } from '../github/githubTokenService';
import { HelixService } from '../helix/helixService';
import type { LeftoverPagesResult } from '../storefront/leftoverPages';
import { removeProductPages, type ProductPageHelix } from '../storefront/productPageRemoval';
import { otherProjectsPublishingTo } from '../storefront/sharedRepoProjects';
import type { EdsResetParams } from './edsResetParams';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

const PRODUCTS_FOLDER = '/products';

/** The clients reset already holds, narrowed to what this step uses. */
interface ResetClients {
    daLiveContentOps: Pick<DaLiveContentOperations, 'listDirectory'>;
    githubTokenService?: GitHubTokenService;
    tokenProvider?: TokenProvider;
}

/**
 * Before the content is re-copied and the catalog pre-warmed: remove the product pages
 * the overlay published on this storefront.
 *
 * @param params - the reset's parameters: the project and its storefront coordinates
 * @param context - the reset's logger and state manager
 * @param clients - the DA.live and token clients reset built
 * @param report - the reset's progress reporter
 * @param helixSeam - Helix seam; production builds it from reset's clients
 * @returns the sentence for the reset's result, or undefined when there were none to remove
 */
export async function takeOutProductPages(
    params: EdsResetParams,
    context: { logger: Logger; stateManager: StateManager },
    clients: ResetClients,
    report: (step: number, message: string) => void,
    helixSeam?: ProductPageHelix,
): Promise<string | undefined> {
    const { logger, stateManager } = context;
    const { repoOwner, repoName, daLiveOrg, daLiveSite, project } = params;
    report(8, 'Removing the old product pages');
    const result = await removeProductPages(
        { repoOwner, repoName },
        {
            helix: helixSeam ?? new HelixService(logger, clients.githubTokenService, clients.tokenProvider),
            // The DA.live documents under /products, sub-folders included.
            listAuthoredProductPages: () =>
                listDaLivePages(clients.daLiveContentOps, daLiveOrg, daLiveSite, PRODUCTS_FOLDER),
            otherProjectsOnRepo: () =>
                otherProjectsPublishingTo(stateManager, `${repoOwner}/${repoName}`, project.path),
            logger,
        },
    );
    if (result.status === 'nothing') return undefined;
    logger.info(`[EdsReset] Product pages: ${result.summary}`);
    report(8, result.summary);
    return result.summary;
}

/**
 * Put the page sentences reset collected on its result — only the ones there are.
 *
 * @param result - the reset's result
 * @param sentences - what happened to the category pages and to the product pages
 * @returns the result with `catalogMenu` and `productPages` when they have something to say
 */
export function withPageSentences<T extends object>(
    result: T,
    sentences: { catalogMenu: string | undefined; productPages: string | undefined },
): T & { catalogMenu?: string; productPages?: string } {
    // The same object when there is nothing to add: callers compare the result they got.
    if (sentences.catalogMenu === undefined && sentences.productPages === undefined) return result;
    return {
        ...result,
        ...(sentences.catalogMenu === undefined ? {} : { catalogMenu: sentences.catalogMenu }),
        ...(sentences.productPages === undefined ? {} : { productPages: sentences.productPages }),
    };
}

/**
 * Put what happened to the pages left over from before the reset (EDS-33) on its
 * result, when there is something to say: removed, some left, or could not tell.
 *
 * @param result - the reset's result
 * @param leftoverPages - the pipeline's answer; absent when the content was kept
 * @returns the result with `leftoverPages` unless there were none to remove
 */
export function withLeftoverPages<T extends object>(
    result: T,
    leftoverPages: LeftoverPagesResult | undefined,
): T & { leftoverPages?: LeftoverPagesResult } {
    if (!leftoverPages || leftoverPages.status === 'none') return result;
    return { ...result, leftoverPages };
}
