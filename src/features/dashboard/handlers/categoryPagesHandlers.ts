/**
 * Category pages (EDS-24): `generateCategoryPages` writes one storefront page per
 * Commerce category, `removeCategoryPages` takes back exactly what it wrote.
 * Pattern B (answers are RETURNED) and headless-safe — no panel, no modal — so the
 * agent tools `generate_category_pages` / `remove_category_pages` sit on these same
 * handlers.
 *
 * The work lives in `features/eds/services/categoryPages`; this file binds it to
 * the open project: the store view's Commerce endpoints (through the same request
 * `run_commerce_query` sends) and the storefront's DA.live + Helix services
 * (through the same write and removal `write_page` / `delete_page` use). The
 * authorship record is saved on the project after every page, so a run that dies
 * half way can still be undone.
 *
 * @module features/dashboard/handlers/categoryPagesHandlers
 */

import { buildCommerceEndpoints } from '@/features/ai/server/commerceEndpointsTool';
import { postCommerceGraphQl } from '@/features/ai/server/commerceGraphQlClient';
import { requireDaLive, requireGitHub } from '@/features/ai/server/edsToolGuards';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import {
    generateCategoryPages,
    pageStoreFor,
    planCategoryPages,
    removeCategoryPages,
    type CategoryPageStore,
} from '@/features/eds/services/categoryPages/categoryPages';
import { readCategoryTree, type CategoryQueryRunner } from '@/features/eds/services/categoryPages/categoryTree';
import {
    DaLiveContentOperations,
    createDaLiveServiceTokenProvider,
} from '@/features/eds/services/daLive/daLiveContentOperations';
import { storefrontTarget, type StorefrontTarget } from '@/features/eds/services/daLive/storefrontPages';
import { HelixService } from '@/features/eds/services/helix/helixService';
import type { GeneratedCategoryPages, Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import { isEdsProject } from '@/types/typeGuards';

/**
 * The one caveat that decides whether a correct page shows anything. Measured
 * 2026-10-01 (EDS-24): on a B2B website a category no shared catalog grants is
 * invisible to Live Search, so its page renders and lists nothing for that group.
 */
export const VISIBILITY_CAVEAT =
    'A category page lists products only once Live Search shows them to the shopper. On a B2B ' +
    'website that means the category must be granted to the shared catalog the shopper\'s group ' +
    'uses — guests and General use the public one — or the page is correct and empty.';

/** What the handlers need from outside, so a test can hand in fakes. */
export interface CategoryPagesDeps {
    /** A refusal when the sign-ins a publish needs are missing, else undefined. */
    checkSignIns(context: HandlerContext): Promise<HandlerResponse | undefined>;
    /** Runs one GraphQL query against the project's Commerce backend. */
    queryRunner(project: Project): CategoryQueryRunner;
    /** The storefront's pages. */
    pageStore(context: HandlerContext, target: StorefrontTarget): CategoryPageStore;
}

/** The payload `generateCategoryPages` takes. */
export interface GenerateCategoryPagesRequest {
    /** Start from this category instead of the store view's root (numeric id). */
    rootCategoryId?: string;
}

/**
 * DA.live writes the pages and GitHub signs the publish. The same two checks the
 * storefront tools run (`edsToolGuards`), answered as a handler refusal.
 */
async function signInRefusal(context: HandlerContext): Promise<HandlerResponse | undefined> {
    const missing =
        (await requireDaLive(context, ' to write the pages')) ?? (await requireGitHub(context, ' to publish the pages'));
    if (!missing) return undefined;
    return { success: false, error: String(missing.message), code: ErrorCode.AUTH_REQUIRED, needsAuth: missing.needsAuth };
}

/** Bind `postCommerceGraphQl` to the project: answer `data`, or throw the reason. */
export function commerceQueryRunner(project: Project, fetchImpl: typeof fetch): CategoryQueryRunner {
    return async (query, variables, endpoint) => {
        const answer = await postCommerceGraphQl(project, { query, variables, endpoint }, fetchImpl);
        if ('error' in answer) throw new Error(answer.error.replace(/^Error: /, ''));
        if (!answer.ok) throw new Error(`${answer.chosen} returned HTTP ${answer.status}. ${answer.body.slice(0, 300)}`);
        const parsed = JSON.parse(answer.body) as { data?: unknown; errors?: Array<{ message?: string }> };
        if (parsed.errors?.length) {
            throw new Error(`${answer.chosen} refused the query: ${parsed.errors.map((e) => e.message).join('; ')}`);
        }
        return parsed.data;
    };
}

function livePageStore(context: HandlerContext, target: StorefrontTarget): CategoryPageStore {
    const tokens = createDaLiveServiceTokenProvider(getDaLiveAuthService(context.context));
    return pageStoreFor({
        ops: new DaLiveContentOperations(tokens, context.logger),
        helix: new HelixService(context.logger, getGitHubServices(context.context.secrets).tokenService, tokens),
        target,
    });
}

const LIVE_DEPS: CategoryPagesDeps = {
    checkSignIns: signInRefusal,
    queryRunner: (project) => commerceQueryRunner(project, fetch),
    pageStore: livePageStore,
};

/** The open EDS project and its storefront coordinates, or the refusal. */
async function openStorefront(
    context: HandlerContext,
): Promise<{ project: Project; target: StorefrontTarget } | { response: HandlerResponse }> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { response: { success: false, error: 'No project loaded', code: ErrorCode.PROJECT_NOT_FOUND } };
    }
    if (!isEdsProject(project)) {
        return {
            response: {
                success: false,
                error: 'Category pages are written into an Edge Delivery storefront; this project has none.',
                code: ErrorCode.INVALID_OPERATION,
            },
        };
    }
    const target = storefrontTarget(project);
    if (!target) {
        return {
            response: { success: false, error: 'The project is missing its storefront repository.', code: ErrorCode.INVALID_OPERATION },
        };
    }
    return { project, target };
}

/** Save the record on the project — or drop it once it holds no pages. */
function persistOn(context: HandlerContext, project: Project): (record: GeneratedCategoryPages) => Promise<void> {
    return async (record) => {
        if (Object.keys(record.pages).length > 0) project.categoryPages = record;
        else delete project.categoryPages;
        await context.stateManager.saveProject(project);
    };
}

/** Build the generate handler over `deps`. */
export function makeGenerateCategoryPages(deps: CategoryPagesDeps): MessageHandler<GenerateCategoryPagesRequest> {
    return async (context, payload) => {
        const ready = await openStorefront(context);
        if ('response' in ready) return ready.response;
        const { project, target } = ready;
        const refusal = await deps.checkSignIns(context);
        if (refusal) return refusal;

        let tree;
        try {
            tree = await readCategoryTree(deps.queryRunner(project), { rootCategoryId: payload?.rootCategoryId });
        } catch (error) {
            return { success: false, error: `Could not read the category tree: ${(error as Error).message}` };
        }
        const plan = planCategoryPages(tree.categories, tree.rootId);
        const run = await generateCategoryPages(
            deps.pageStore(context, target),
            plan,
            project.categoryPages,
            persistOn(context, project),
        );
        const { record: _record, ...outcome } = run;
        context.logger.info(
            `[Category pages] ${project.name}: ${run.written.length} written, ${run.handEdited.length} hand-edited, ` +
                `${run.notOurs.length} not ours, ${run.failed.length} failed`,
        );
        return {
            success: true,
            data: {
                storeView: buildCommerceEndpoints(project).headers.all?.Store,
                rootCategoryId: tree.rootId,
                categoriesRead: tree.categories.length,
                ...(tree.truncated ? { truncated: true } : {}),
                ...outcome,
                skipped: plan.skipped,
                caveat: VISIBILITY_CAVEAT,
            },
        };
    };
}

/** Build the remove handler over `deps`. */
export function makeRemoveCategoryPages(deps: CategoryPagesDeps): MessageHandler {
    return async (context) => {
        const ready = await openStorefront(context);
        if ('response' in ready) return ready.response;
        const { project, target } = ready;
        if (!project.categoryPages || Object.keys(project.categoryPages.pages).length === 0) {
            return { success: true, data: { removed: [], handEdited: [], alreadyGone: [], failed: [], note: 'No category pages were generated for this project.' } };
        }
        const refusal = await deps.checkSignIns(context);
        if (refusal) return refusal;

        const run = await removeCategoryPages(deps.pageStore(context, target), project.categoryPages, persistOn(context, project));
        const { record, ...outcome } = run;
        context.logger.info(
            `[Category pages] ${project.name}: ${run.removed.length} removed, ${run.handEdited.length} left as hand-edited, ` +
                `${run.failed.length} failed`,
        );
        return { success: true, data: { ...outcome, stillRecorded: Object.keys(record.pages) } };
    };
}

export const handleGenerateCategoryPages = makeGenerateCategoryPages(LIVE_DEPS);
export const handleRemoveCategoryPages = makeRemoveCategoryPages(LIVE_DEPS);
