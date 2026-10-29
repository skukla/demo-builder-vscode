/**
 * Builds the {@link CatalogMenuSite} the catalog menu step runs against (EDS-24, EDS-61).
 *
 * One builder for every caller — project creation, reset, republish and the store change
 * — so they read the same categories the same way, check for the block the same way, and
 * publish and remove category pages through the same calls. Each hands in the DA.live
 * and Helix clients and the GitHub file reader it already has.
 *
 * - Categories: Catalog Service, asked with the request `run_commerce_query` sends on
 *   this project (`resolveCommerceRequest`), so the pages Demo Builder publishes and the
 *   menu the block draws come from the same store view.
 * - The block: `blocks/catalog-menu/catalog-menu.js` in the storefront's own repository.
 * - The overlay: on when the BYOM settings register one (`resolveByomOverlayConfig`, the
 *   same answer storefront setup registers the site with).
 * - Category pages: at each category's own address, published through the extension's
 *   authenticated Helix path, on the backend product pages are published for at setup
 *   (ACCS, `catalogPrewarmService.ts`); taken down with `removeCategoryPages` and its
 *   shared-repository refusal.
 * - The authored-pages sheet: written to DA.live as a JSON sheet at
 *   `authored-category-pages.json`, then previewed and published at that `.json` path —
 *   the way every sheet is served (`eds-publish-and-config`, "a sheet is not a page").
 *
 * @module features/eds/services/catalogMenu/catalogMenuSiteDeps
 */

import { AUTHORED_SHEET_PATH, authoredSheetSource } from './authoredCategoryPages';
import type { CategoryPageHost } from './catalogMenuService';
import type { CatalogMenuSite } from './catalogMenuStep';
import { readStoreCategories, type CatalogQuery } from './categoryReader';
import type { MenuLine } from './navSwitch';
import { createStorefrontPages, type PageTransport } from './storefrontPageAdapter';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { buildCommerceEndpoints } from '@/features/ai/server/commerceEndpointsTool';
import { resolveCommerceRequest } from '@/features/ai/server/commerceQueryTool';
import { resolveByomOverlayConfig } from '@/features/eds/handlers/byomOverlay';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import { removeCategoryPages, type ProductPageHelix } from '@/features/eds/services/storefront/productPageRemoval';
import { categoryPageRemovalDepsFor } from '@/features/eds/services/storefront/projectProductPages';
import { extractConfigParams } from '@/features/eds/services/storefrontConfigParams';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

/** The file whose presence proves the storefront has the block. */
export const CATALOG_MENU_BLOCK_FILE = 'blocks/catalog-menu/catalog-menu.js';
/** The block's line rule lives here: "Commerce:" since 2026-10-25, "Shop the catalog" before. */
export const CATALOG_MENU_CORE_FILE = 'blocks/catalog-menu/catalog-menu-core.js';

/** Which line a copy of the block's code reads. Anything not the new rule is the old block. */
export function menuLineOf(coreSource: string | null): MenuLine {
    return coreSource && /\^commerce\b/.test(coreSource) ? 'commerce' : 'shop';
}

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
    /** Publishes and lists category pages too. `HelixService` satisfies it. */
    helix: PageTransport['helix'] & ProductPageHelix;
    github: Pick<GitHubFileOperations, 'getFileContent'>;
    /** Which other local projects publish to the same repository (the removal's refusal). */
    stateManager: StateManager;
    logger: Logger;
    /** Seam: whether the overlay is on. Production reads the BYOM settings. */
    overlay?: boolean;
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

/** The overlay's category pages on this storefront's Helix site. */
function categoryPagesOf(input: CatalogMenuSiteInput): CategoryPageHost {
    const { project, target, helix, daLive } = input;
    const { daLiveOrg: org, daLiveSite: site } = target;
    const removalDeps = categoryPageRemovalDepsFor({
        projectPath: project.path,
        target,
        daLive,
        helix,
        stateManager: input.stateManager,
        logger: input.logger,
    });
    // The DA.live source of the sheet: written at its `.json` path, never as a page.
    const sheetSource = AUTHORED_SHEET_PATH.slice(1);
    return {
        // Product pages are published at setup on ACCS only (`catalogPrewarmService.ts`);
        // elsewhere a shopper's first visit publishes, for products and categories alike.
        publishAtSetup: extractConfigParams(project).environmentType === 'accs',
        async publishAuthoredSheet(paths) {
            const written = await daLive.createSource(org, site, sheetSource, authoredSheetSource(paths), {
                overwrite: true,
                contentType: 'application/json',
            });
            if (!written.success) throw new Error(written.error ?? `Could not write ${AUTHORED_SHEET_PATH}`);
            await helix.previewAndPublishPage(org, site, AUTHORED_SHEET_PATH);
        },
        async removeAuthoredSheet() {
            if (!(await helix.unpublishPage(org, site, AUTHORED_SHEET_PATH))) {
                throw new Error(`Could not unpublish ${AUTHORED_SHEET_PATH}; its source was left in place`);
            }
            const deleted = await daLive.deleteSource(org, site, sheetSource);
            if (!deleted.success) throw new Error(deleted.error ?? `Could not delete ${AUTHORED_SHEET_PATH}`);
        },
        publish: (path) => helix.previewAndPublishPage(org, site, path),
        remove: (paths) =>
            removeCategoryPages({ repoOwner: target.repoOwner, repoName: target.repoName }, removalDeps, paths),
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
        readCategories: () => readStoreCategories(query),
        menuLine: async () =>
            menuLineOf((await github.getFileContent(target.repoOwner, target.repoName, CATALOG_MENU_CORE_FILE))?.content ?? null),
        overlay: input.overlay ?? resolveByomOverlayConfig(undefined, target.daLiveOrg, target.daLiveSite) !== undefined,
        categoryPages: categoryPagesOf(input),
    };
}
