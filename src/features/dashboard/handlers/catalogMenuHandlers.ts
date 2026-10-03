/**
 * The catalog menu — the dashboard's two messages and the agent's two tools, on ONE
 * path (EDS-24). Pattern B: each answers by returning.
 *
 * - `buildCatalogMenu` reads the Commerce categories marked "Include in Menu" from
 *   Catalog Service (with the same request `run_commerce_query` sends), writes one page
 *   per category, adds the menu line and the `catalog-menu` block to the nav, and keeps
 *   the record of what it wrote on the project.
 * - `removeCatalogMenu` is the undo: it removes only what that record proves Demo Builder
 *   wrote and the SC has not edited since, and takes the switch back out of the nav.
 *
 * The block must be in the storefront first. A nav that names a block the site does not
 * have shows nothing where the menu should be, so the build checks the repository for it
 * and, when it is missing, says how to add it and changes nothing.
 *
 * Headless-safe: no panel, no modal.
 *
 * @module features/dashboard/handlers/catalogMenuHandlers
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { buildCommerceEndpoints } from '@/features/ai/server/commerceEndpointsTool';
import { resolveCommerceRequest } from '@/features/ai/server/commerceQueryTool';
import {
    storefrontPagesFor,
    storefrontTarget,
    type StorefrontTarget,
} from '@/features/ai/server/storefrontPages';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { readCatalogMenuRecord, writeCatalogMenuRecord } from '@/features/eds/services/catalogMenu/catalogMenuRecord';
import {
    NO_MENU_CATEGORIES,
    applyCatalogMenu,
    removeCatalogMenu,
    type CatalogMenuRecord,
} from '@/features/eds/services/catalogMenu/catalogMenuService';
import { describeBuild, describeRemoval } from '@/features/eds/services/catalogMenu/catalogMenuSummary';
import { planCategoryPages, type CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPages';
import {
    readMenuCategories,
    rootCategoryIdFor,
    type CatalogQuery,
} from '@/features/eds/services/catalogMenu/categoryReader';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import { isEdsProject } from '@/types/typeGuards';
import type { BuildCatalogMenuResult, RemoveCatalogMenuResult } from '@/types/webviewRequests';

/** The file whose presence proves the storefront has the block. */
export const CATALOG_MENU_BLOCK_FILE = 'blocks/catalog-menu/catalog-menu.js';

export const LIBRARY_MISSING =
    "This storefront doesn't have the catalog menu block yet, so the nav would have nothing " +
    'to draw the menu with. Add the Demo Builder Blocks library to the storefront (it is in ' +
    'the block library list, off by default), then run this again. Nothing was changed.';

const EDS_ONLY = 'The catalog menu is for Edge Delivery storefronts only.';
const NO_TARGET = "This project's storefront repository is missing or malformed, so there is nowhere to write.";
const NEEDS_DALIVE = 'Sign in to DA.live first: the menu pages are written there.';
const NEEDS_GITHUB = 'Sign in to GitHub first: publishing the pages needs it.';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const refuse = (error: string, code: ErrorCode): HandlerResponse => ({ success: false, error, code });

type Ready = { project: Project; target: StorefrontTarget } | { response: HandlerResponse };

async function signedIn(context: HandlerContext): Promise<HandlerResponse | undefined> {
    if (!(await getDaLiveAuthService(context.context).isAuthenticated())) {
        return refuse(NEEDS_DALIVE, ErrorCode.AUTH_REQUIRED);
    }
    const github = await getGitHubServices(context.context.secrets)
        .tokenService.validateToken()
        .catch(() => ({ valid: false }));
    return github.valid ? undefined : refuse(NEEDS_GITHUB, ErrorCode.AUTH_REQUIRED);
}

/** The project, its storefront, and both sign-ins — or the refusal. */
async function prepare(context: HandlerContext): Promise<Ready> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return { response: refuse('No project found', ErrorCode.PROJECT_NOT_FOUND) };
    if (!isEdsProject(project)) return { response: refuse(EDS_ONLY, ErrorCode.INVALID_OPERATION) };
    const target = storefrontTarget(project);
    if (!target) return { response: refuse(NO_TARGET, ErrorCode.INVALID_OPERATION) };
    const auth = await signedIn(context);
    return auth ? { response: auth } : { project, target };
}

async function hasBlock(context: HandlerContext, target: StorefrontTarget): Promise<boolean> {
    const { fileOperations } = getGitHubServices(context.context.secrets);
    const file = await fileOperations.getFileContent(target.repoOwner, target.repoName, CATALOG_MENU_BLOCK_FILE);
    return file !== null;
}

/** Catalog Service, asked the way `run_commerce_query` asks it on this project. */
function catalogQuery(project: Project): CatalogQuery {
    const request = resolveCommerceRequest(buildCommerceEndpoints(project), 'catalogService', undefined);
    return async (query, variables) => {
        if (typeof request === 'string') throw new Error(request.replace(/^Error: /, ''));
        const response = await fetch(request.url, {
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

/** Keep the record on the project as it is NOW on disk, not as it was read minutes ago. */
async function keepRecord(context: HandlerContext, record: CatalogMenuRecord): Promise<void> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) throw new Error('The project closed before the catalog menu record could be kept');
    writeCatalogMenuRecord(project, record);
    await context.stateManager.saveProject(project);
}

/** The project's menu categories, read the one way both the preview and the build read them. */
function categoriesFor(project: Project): () => Promise<CatalogCategory[]> {
    const query = catalogQuery(project);
    const root = rootCategoryIdFor(project.commerceStoreStructure, buildCommerceEndpoints(project).scope.storeCode);
    return () => readMenuCategories(query, root);
}

/**
 * What a build WOULD write, for the consent the agent's tool asks first (property 5):
 * the site and how many category pages go live. A read; writes nothing.
 *
 * @param context - the handler context
 * @returns `{ site, pages }`, or the refusal / read failure
 */
export async function previewCatalogMenu(context: HandlerContext): Promise<HandlerResponse> {
    const ready = await prepare(context);
    if ('response' in ready) return ready.response;
    const { project, target } = ready;
    try {
        const categories = await categoriesFor(project)();
        if (categories.length === 0) return { success: false, error: NO_MENU_CATEGORIES };
        const pages = planCategoryPages(categories).pages.length;
        return { success: true, data: { site: `${target.repoOwner}/${target.repoName}`, pages } };
    } catch (error) {
        return { success: false, error: messageOf(error) };
    }
}

export const handleBuildCatalogMenu: MessageHandler = async (context) => {
    const ready = await prepare(context);
    if ('response' in ready) return ready.response;
    const { project, target } = ready;

    try {
        if (!(await hasBlock(context, target))) {
            return refuse(LIBRARY_MISSING, ErrorCode.COMPONENT_DEPENDENCY_MISSING);
        }
    } catch (error) {
        return refuse(`Couldn't check the storefront repository for the block: ${messageOf(error)}`, ErrorCode.NETWORK);
    }

    let report;
    try {
        report = await applyCatalogMenu(
            { pages: storefrontPagesFor(context, target), readCategories: categoriesFor(project) },
            readCatalogMenuRecord(project),
        );
    } catch (error) {
        // `applyCatalogMenu` throws only while reading the tree, before any write.
        return { success: false, error: `Nothing was changed. ${messageOf(error)}` };
    }

    const { record, ...facts } = report;
    await keepRecord(context, record);
    context.logger.info(`[Catalog menu] ${project.name}: ${facts.written.length} pages written, nav ${facts.nav}`);
    const data: BuildCatalogMenuResult = { summary: describeBuild(facts), ...facts };
    return { success: true, data };
};

export const handleRemoveCatalogMenu: MessageHandler = async (context) => {
    const ready = await prepare(context);
    if ('response' in ready) return ready.response;
    const { project, target } = ready;

    const report = await removeCatalogMenu({ pages: storefrontPagesFor(context, target) }, readCatalogMenuRecord(project));
    const { record, ...facts } = report;
    await keepRecord(context, record);
    context.logger.info(`[Catalog menu] ${project.name}: ${facts.removed.length} pages removed, nav ${facts.nav}`);
    const data: RemoveCatalogMenuResult = { summary: describeRemoval(facts), ...facts };
    return { success: true, data };
};
