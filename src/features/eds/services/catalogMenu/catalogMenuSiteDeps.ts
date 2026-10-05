/**
 * Builds the {@link CatalogMenuSite} the catalog menu step runs against (EDS-24).
 *
 * One builder for the three callers — project creation, reset and republish — so they
 * read the same categories the same way, check for the block the same way, and write
 * pages through the same calls. Each hands in the DA.live and Helix clients and the
 * GitHub file reader it already has.
 *
 * - Categories: Catalog Service, asked with the request `run_commerce_query` sends on
 *   this project (`resolveCommerceRequest`), so the pages Demo Builder writes and the
 *   menu the block draws come from the same store view.
 * - The block: `blocks/catalog-menu/catalog-menu.js` in the storefront's own repository.
 *
 * @module features/eds/services/catalogMenu/catalogMenuSiteDeps
 */

import type { CatalogMenuSite } from './catalogMenuStep';
import { readMenuCategories, rootCategoryIdFor, type CatalogQuery } from './categoryReader';
import { createStorefrontPages, type PageTransport } from './storefrontPageAdapter';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { buildCommerceEndpoints } from '@/features/ai/server/commerceEndpointsTool';
import { resolveCommerceRequest } from '@/features/ai/server/commerceQueryTool';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { Project } from '@/types/base';

/** The file whose presence proves the storefront has the block. */
export const CATALOG_MENU_BLOCK_FILE = 'blocks/catalog-menu/catalog-menu.js';

/** Where the storefront's pages and code live. */
export interface CatalogMenuTarget {
    daLiveOrg: string;
    daLiveSite: string;
    repoOwner: string;
    repoName: string;
}

interface CatalogMenuSiteInput extends PageTransport {
    project: Project;
    target: CatalogMenuTarget;
    github: Pick<GitHubFileOperations, 'getFileContent'>;
    /** Network seam; production uses the global `fetch`. */
    fetchImpl?: typeof fetch;
}

/** Catalog Service, asked the way `run_commerce_query` asks it on this project. */
function catalogQuery(project: Project, fetchImpl: typeof fetch): CatalogQuery {
    return async (query, variables) => {
        const request = resolveCommerceRequest(buildCommerceEndpoints(project), 'catalogService', undefined);
        if (typeof request === 'string') throw new Error(request.replace(/^Error: /, ''));
        const response = await fetchImpl(request.url, {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });
        if (!response.ok) throw new Error(`Catalog Service returned HTTP ${response.status}`);
        const body = (await response.json()) as { data?: unknown; errors?: Array<{ message?: string }> };
        if (body.errors?.length) {
            throw new Error(`Catalog Service: ${body.errors.map((e) => e.message).join('; ')}`);
        }
        return body.data;
    };
}

/**
 * @param input - the project, its storefront, and the clients the caller already holds
 * @returns the storefront as the catalog menu step sees it
 */
export function createCatalogMenuSite(input: CatalogMenuSiteInput): CatalogMenuSite {
    const { project, target, github } = input;
    const query = catalogQuery(project, input.fetchImpl ?? fetch);
    return {
        pages: createStorefrontPages({ daLive: input.daLive, helix: input.helix }, target),
        hasBlock: async () =>
            (await github.getFileContent(target.repoOwner, target.repoName, CATALOG_MENU_BLOCK_FILE)) !== null,
        readCategories: () =>
            readMenuCategories(
                query,
                rootCategoryIdFor(project.commerceStoreStructure, buildCommerceEndpoints(project).scope.storeCode),
            ),
    };
}
