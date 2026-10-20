/**
 * EDS Content Pipeline
 *
 * Shared pipeline that orchestrates the content/publish sequence used by both
 * the setup flow (storefrontSetupHandlers) and the reset flow (edsResetContentStep).
 *
 * Operations executed in order:
 * 0. Clear existing DA.live content (gated by clearExistingContent). Nothing is
 *    unpublished here: the site stays up while the content is replaced (EDS-33)
 * 0.5. Read the storefront's code from the SC's repository, for the paths it loads
 *    (gated by skipContent; EDS-40). Failing, the copy uses the fixed lists
 * 1. Copy DA.live content from source (gated by skipContent)
 * 2. Create block library from component-definition.json
 * 3. Apply EDS settings (AEM Assets, Universal Editor config)
 * 4. Purge CDN cache (conditional)
 * 5. Publish content to CDN
 * 5.5. Publish the sheets step 1 copied, by path (step 5 publishes pages only)
 * 6. Publish block library paths
 * 7. Unpublish the pages Helix still has published that steps 5-6 did not publish,
 *    product pages excepted (gated by clearExistingContent; EDS-33)
 * 7.5. Ask the live storefront for every code path the source had, and report what
 *    is missing (EDS-40). Never fails the pipeline
 * 8. Pre-warm the catalog's product pages (conditional)
 *
 * @module features/eds/services/edsPipeline
 */

import { failedTargets, publishBrandAssets } from './brandAssetPublisher';
import { prewarmCatalog } from './catalogPrewarmService';
import { contentIndexUrl } from './contentIndex';
import type { DaLiveContentOperations } from './daLive/daLiveContentOperations';
import type { GitHubFileOperations } from './github/githubFileOperations';
import type { HelixService } from './helix/helixService';
import { applyBlockCodePatches } from './patches/codePatchPipelineHelpers';
import { createPatchReport, addCodeResult, type PatchReport } from './patches/patchReportHelper';
import {
    LEFTOVERS_MAY_REMAIN,
    pageInSource,
    unpublishLeftoverPages,
    type LeftoverPagesResult,
} from './storefront/leftoverPages';
import { carriedWebPaths, findMissingPages } from './storefront/missingPages';
import { readStorefrontCodePaths } from './storefrontCodeReader';
import { DaLiveAuthError, DaLiveError, type EdsPipelineProgressCallback } from './types';
import { STOREFRONT_JOBS, countLine, itemCount, jobLine } from '@/core/utils/storefrontJobs';
import type { Project } from '@/types/base';
import type { BrandAssetsConfig, ContentPatchSource, CodePatchSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

// ==========================================================
// Types
// ==========================================================

// EdsPipelineProgressCallback now lives in ./types (breaks the edsPipeline ↔
// catalogPrewarmService import cycle); re-exported here for existing consumers.
export type { EdsPipelineProgressCallback };

/**
 * Path prefix the account-chrome overlay supplies, so references under it are
 * not gaps during the brand-content copy that runs first.
 *
 * Verified rather than assumed: `overlayAccountChrome`
 * (`daLiveAccountChrome.ts`) seeds its entry points from
 * `RUNTIME_SURFACES.authPages` (`runtimeSurfaceInventory.ts`), every one of
 * which is under `/customer/`, then follows references out from those pages.
 *
 * Deliberately one-directional: anything the overlay supplies OUTSIDE this
 * prefix is still audited, so a narrow prefix only ever keeps the channel
 * louder than necessary — never quieter.
 */
const ACCOUNT_CHROME_PATH_PREFIX = '/customer/';

/** Pipeline parameters — encompasses both setup and reset use cases */
export interface EdsPipelineParams {
    repoOwner: string;
    repoName: string;
    daLiveOrg: string;
    daLiveSite: string;
    templateOwner: string;
    templateRepo: string;

    // Content management
    /**
     * Delete all existing DA.live content before populating (true = clean slate). Also
     * turns on step 7: after the republish, unpublish what was not republished.
     */
    clearExistingContent?: boolean;
    skipContent?: boolean;
    contentSource?: { org: string; site: string; indexPath: string };
    /** Optional second content source for the customer account chrome
     *  (`/customer/*` + the `/customer/nav` fragment), overlaid after the main
     *  copy. Used by hybrid packages (B2B base + brand overlay). */
    accountContentSource?: { org: string; site: string };
    contentPatches?: string[];
    contentPatchSource?: ContentPatchSource;

    /** Code patch IDs to apply post-block-install (block-targeting subset of the ledger).
     *  Canonical-file patches are applied earlier by `resetRepoToTemplate` against the
     *  same ledger. Both phases route results into the pipeline's patchReport. */
    codePatches?: string[];
    /** External code-patch source. Sibling of `contentPatchSource`. */
    codePatchSource?: CodePatchSource;

    /** Additive brand files + optional marker-bounded head.html snippet, vendored
     *  after block install (so brand files can safely reference installed blocks).
     *  Non-fatal per ADR-006 D1 — the publisher reports and logs, never throws. */
    brandAssets?: BrandAssetsConfig;

    /** Optional preexisting patch report. When provided, the pipeline appends to it
     *  (so canonical-phase results from `resetRepoToTemplate` survive into the final
     *  pipeline result). When absent, the pipeline creates a fresh report. */
    patchReport?: PatchReport;

    // Block library
    includeBlockLibrary?: boolean;
    blockCollectionIds?: string[];
    /** DA.live content sources for block library doc pages (.da/library/blocks/) */
    libraryContentSources?: Array<{ org: string; site: string }>;
    /**
     * Publish only these blocks' doc pages, and the block list itself. For a caller
     * that knows which blocks it just added (Configure's block libraries): the other
     * doc pages are already live, and publishing ~50 of them one at a time is the
     * slow half of the step. Absent publishes them all — the full rebuild.
     */
    publishLibraryBlocksOnly?: string[];

    // Publish
    purgeCache?: boolean;
    skipPublish?: boolean;

    /**
     * BYOM overlay URL stamped onto the storefront's Configuration Service
     * registration. When set AND `skipPublish` is false, the pipeline also
     * publishes a smart `/404.html` page that handles PDP routing.
     * See `pdp404HandlerPublisher.ts` and `docs/architecture/eds-byom-pdp-routing.md`.
     */
    byomOverlayUrl?: string;

    /**
     * Project reference used by the catalog pre-warming step (v1 ACCS only).
     * When provided AND `byomOverlayUrl` is set AND `skipPublish` is false,
     * the pipeline enumerates the storefront's Commerce catalog and
     * pre-publishes every product's PDP path so first-visit cold paths
     * never fire during demos. When absent, pre-warming is skipped silently
     * (the smart-404 fallback still handles cold paths at runtime).
     * See `catalogPrewarmService.ts`.
     */
    project?: Project;
}

/** Service dependencies — callers construct and pass these in */
export interface EdsPipelineServices {
    daLiveContentOps: DaLiveContentOperations;
    githubFileOps: GitHubFileOperations;
    helixService: HelixService;
    logger: Logger;
}

/** Pipeline result */
export interface EdsPipelineResult {
    success: boolean;
    contentFilesCopied: number;
    libraryPaths: string[];
    error?: string;
    /** Aggregated patch report (content + code). Callers pass it to
     *  `reportUnapplied(report, logger, vscode.window.showWarningMessage)`
     *  to surface unapplied patches via a single toast (one per create/reset,
     *  not one per patch domain). Always present even when the report is empty. */
    patchReport?: PatchReport;
    /** What step 7 did with the pages left over from before (EDS-33). Absent when it did not run. */
    leftoverPages?: LeftoverPagesResult;
    /**
     * Every sentence a step had for the SC, in the order the steps ran (EDS-55): pages the
     * source has that the storefront does not serve (EDS-40), old pages that may still be
     * live (EDS-33), a block palette that will be empty (EDS-38). Creation's completion
     * card, the reset's warnings and the agent's caveats all read this one list, so a new
     * warning is one `warnTheSc` call in its step. Empty when there is nothing to say.
     */
    warnings: string[];
}

// ==========================================================
// Pipeline Helpers
// ==========================================================

/**
 * Block-phase code-patch application slot. No-op when there are no patches
 * configured. `applyBlockCodePatches` is internally non-fatal except for
 * `critical: true` patches, where the engine throws `CodePatchCriticalError`
 * — that propagates naturally to the pipeline's outer try/catch so callers
 * see the failed result on `error.result` rather than a partially-applied
 * state.
 */
async function pipelineApplyBlockCodePatches(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    codePatches: string[] | undefined,
    codePatchSource: CodePatchSource | undefined,
    patchReport: PatchReport,
    logger: Logger,
): Promise<void> {
    if (!codePatches || codePatches.length === 0 || !codePatchSource) return;
    const blockResults = await applyBlockCodePatches(
        githubFileOps,
        repoOwner,
        repoName,
        codePatches,
        codePatchSource,
        logger,
    );
    for (const r of blockResults) addCodeResult(patchReport, r);
}

/**
 * Brand-assets slot. No-op when the package storefront declares none.
 * `publishBrandAssets` is internally non-fatal (never throws for fetch or
 * write failures); an incomplete result degrades to an unbranded storefront,
 * so it is summarized as a warning rather than failing the pipeline —
 * matching how block code patches report (proceed-and-warn, ADR-006 D1).
 */
async function pipelineApplyBrandAssets(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    brandAssets: BrandAssetsConfig | undefined,
    logger: Logger,
): Promise<void> {
    if (!brandAssets) return;
    const result = await publishBrandAssets(
        brandAssets,
        githubFileOps,
        repoOwner,
        repoName,
        logger,
    );
    if (!result.success) {
        const failed = failedTargets(result).map((r) => `${r.path} (${r.reason ?? 'unknown'})`);
        logger.warn(
            `[EdsPipeline] Brand assets incomplete — storefront may be unbranded: ${failed.join(', ')}`,
        );
    }
}

/**
 * Step 0: Clear all existing DA.live content.
 *
 * Uses DA.live Bearer token auth for DELETE operations, which bypasses
 * the Helix Admin API's "source exists" restriction. No fstab.yaml
 * manipulation or Configuration Service config changes needed.
 *
 * Nothing is unpublished here (EDS-33, owner decision 2026-10-09). It used to
 * unpublish every deleted page, which took the storefront offline until step 5
 * republished, and missed every page live on Helix but already gone from DA.live.
 * The republish overwrites the pages that still exist; step 7 takes off the rest.
 */
async function pipelineClearContent(
    services: EdsPipelineServices,
    context: { daLiveOrg: string; daLiveSite: string },
    onProgress?: EdsPipelineProgressCallback,
): Promise<void> {
    const { daLiveContentOps, logger } = services;
    const { daLiveOrg, daLiveSite } = context;

    onProgress?.({
        operation: 'content-clear',
        message: STOREFRONT_JOBS.clearingContent,
        subMessage: `${daLiveOrg}/${daLiveSite}`,
    });
    logger.info(`[EdsPipeline] Clearing all DA.live content for ${daLiveOrg}/${daLiveSite}`);

    const clearResult = await daLiveContentOps.sourceOps.deleteAllSiteContent(
        daLiveOrg,
        daLiveSite,
        (info) => {
            onProgress?.({
                operation: 'content-clear',
                message: jobLine(STOREFRONT_JOBS.clearingContent, `${info.deleted} files removed`),
                subMessage: info.current,
            });
        },
    );

    if (!clearResult.success) {
        throw new Error(`Content clear failed: ${clearResult.error}`);
    }

    logger.info(`[EdsPipeline] Cleared ${clearResult.deletedCount} files`);
    onProgress?.({
        operation: 'content-clear',
        message: jobLine(STOREFRONT_JOBS.clearingContent, `${clearResult.deletedCount} files removed`),
    });
}

/**
 * Step 1: Copy content from source to DA.live.
 * @returns the number of files copied, the sheets among them to publish by path,
 *   and the code paths the source had, to look for once published
 */
async function pipelineCopyContent(
    daLiveContentOps: DaLiveContentOperations,
    contentSource: { org: string; site: string; indexPath: string },
    daLiveOrg: string,
    daLiveSite: string,
    contentPatches: string[] | undefined,
    contentPatchSource: ContentPatchSource | undefined,
    patchReport: PatchReport,
    logger: Logger,
    onProgress?: EdsPipelineProgressCallback,
    accountContentSource?: { org: string; site: string },
    runtimeSurfaceSource?: CodePatchSource,
    codePaths?: readonly string[],
): Promise<{ filesCopied: number; sheetPaths: string[]; codePathsOnSource: string[]; carriedPaths: string[] }> {
    onProgress?.({
        operation: 'content-copy',
        message: STOREFRONT_JOBS.copyingContent,
        subMessage: `From ${contentSource.org}/${contentSource.site}`,
    });

    // The brand source has no /customer/* pages by design when an account
    // overlay is configured — the overlay below supplies them. Tell the
    // completeness audit so it does not report a gap this run then fills.
    if (accountContentSource) {
        patchReport.deferredReferencePrefixes = [
            ...(patchReport.deferredReferencePrefixes ?? []),
            ACCOUNT_CHROME_PATH_PREFIX,
        ];
    }

    const fullContentSource = {
        org: contentSource.org,
        site: contentSource.site,
        indexUrl: contentIndexUrl(contentSource),
    };

    logger.info(
        `[EdsPipeline] Copying content from ${contentSource.org}/${contentSource.site} to ${daLiveOrg}/${daLiveSite}`,
    );

    const contentResult = await daLiveContentOps.copyOps.copyContentFromSource(
        fullContentSource,
        daLiveOrg,
        daLiveSite,
        (progress) => {
            const statusMessage =
                progress.message ||
                jobLine(STOREFRONT_JOBS.copyingContent, countLine(progress.processed, progress.total, 'file'));
            onProgress?.({
                operation: 'content-copy',
                message: statusMessage,
                subMessage: progress.currentFile,
                current: progress.processed,
                total: progress.total,
                percentage: progress.percentage,
            });
        },
        contentPatches,
        contentPatchSource,
        patchReport,
        runtimeSurfaceSource,
        codePaths,
    );

    if (!contentResult.success) {
        throw new Error(`Content copy failed: ${contentResult.failedFiles.length} files failed`);
    }

    logger.info(`[EdsPipeline] Content populated: ${contentResult.totalFiles} files`);

    // Hybrid packages: overlay the B2B account chrome (/customer/* + /customer/nav)
    // from the canonical B2B content site on top of the brand content.
    let overlaidFiles = 0;
    const copiedFiles = [...contentResult.copiedFiles];
    if (accountContentSource) {
        const overlay = await daLiveContentOps.copyOps.overlayAccountChrome(
            accountContentSource,
            daLiveOrg,
            daLiveSite,
            patchReport,
        );
        overlaidFiles = overlay.totalFiles;
        copiedFiles.push(...overlay.copiedFiles);
        logger.info(
            `[EdsPipeline] Account-chrome overlay: ${overlaidFiles} file(s) from ${accountContentSource.org}/${accountContentSource.site}`,
        );
    }

    const filesCopied = contentResult.totalFiles + overlaidFiles;
    onProgress?.({
        operation: 'content-copy',
        message: jobLine(STOREFRONT_JOBS.copyingContent, `${itemCount(filesCopied, 'file')} copied`),
    });

    return {
        filesCopied,
        sheetPaths: contentResult.sheetPaths,
        codePathsOnSource: contentResult.codePathsOnSource,
        carriedPaths: carriedWebPaths(copiedFiles, contentResult.sheetPaths),
    };
}

/**
 * Step 5: Publish content to CDN.
 * Treats "No publishable pages" as non-fatal: nothing was published.
 * @returns the pages published, or undefined when the publish did not say
 */
async function pipelinePublishContent(
    helixService: HelixService,
    repoOwner: string,
    repoName: string,
    daLiveOrg: string,
    daLiveSite: string,
    logger: Logger,
    onProgress?: EdsPipelineProgressCallback,
): Promise<string[] | undefined> {
    onProgress?.({
        operation: 'content-publish',
        message: STOREFRONT_JOBS.publishingPages,
        subMessage: `${repoOwner}/${repoName}`,
    });

    logger.info(`[EdsPipeline] Publishing content to CDN for ${repoOwner}/${repoName}`);

    try {
        const published = await helixService.publishAllSiteContent(
            `${repoOwner}/${repoName}`,
            'main',
            daLiveOrg,
            daLiveSite,
            (info) => {
                onProgress?.({
                    operation: 'content-publish',
                    message: info.message,
                    // The bulk job reports counts but never the page it is on —
                    // fall back to the site so the detail row is never blank
                    // while the title counts up.
                    subMessage: info.currentPath ?? `${repoOwner}/${repoName}`,
                    current: info.current,
                    total: info.total,
                });
            },
        );
        logger.info('[EdsPipeline] Content published to CDN');
        return Array.isArray(published) ? published : undefined;
    } catch (publishError) {
        // No publishable pages is non-fatal (e.g. Custom package with no content source)
        const msg = (publishError as Error).message;
        if (msg.includes('No publishable pages')) {
            logger.info(
                '[EdsPipeline] No content pages to publish (site has no publishable content)',
            );
            return [];
        }
        throw publishError;
    }
}

/**
 * Step 2: configure the block library.
 *
 * Copies block doc pages from library content sources (DA.live API, 403-tolerant),
 * then builds the authoring library from the template (or the user's repo, per the
 * load-bearing `blockCollectionIds` routing). Returns the resulting library paths.
 */
async function pipelineConfigureBlockLibrary(
    services: EdsPipelineServices,
    params: EdsPipelineParams,
    onProgress?: EdsPipelineProgressCallback,
): Promise<{ paths: string[]; emptyPalette?: string }> {
    const { daLiveContentOps, githubFileOps, logger } = services;
    const {
        repoOwner,
        repoName,
        daLiveOrg,
        daLiveSite,
        templateOwner,
        templateRepo,
        blockCollectionIds,
        libraryContentSources,
    } = params;

    onProgress?.({
        operation: 'block-library',
        message: STOREFRONT_JOBS.buildingBlockLibrary,
        // Which storefront it is building the library into — the same slot, and
        // the same org/site shape, the other DA.live steps fill.
        subMessage: `${daLiveOrg}/${daLiveSite}`,
    });

    // Copy block doc pages from library content sources via DA.live API.
    // This works for orgs the user owns (has DA.live auth on). For
    // third-party orgs (403), we log a warning and fall back to CDN-based
    // copy inside createBlockLibraryFromTemplate.
    if (libraryContentSources?.length) {
        await copyLibraryDocPages(
            daLiveContentOps,
            libraryContentSources,
            daLiveOrg,
            daLiveSite,
            logger,
        );
    }

    // Load-bearing: truthy `blockCollectionIds` (including the empty
    // array `[]`) routes the comp-def read to the USER's repo so any
    // MCP-promoted blocks survive a destructive rebuild. `undefined`
    // falls back to the template repo (initial setup / template-only
    // refresh). Do NOT change this to `blockCollectionIds?.length`
    // — RefreshBlockLibraryCommand passes `[]` deliberately as the
    // "rebuild from user repo" signal. See src/commands/refreshBlockLibrary.ts.
    const compDefOwner = blockCollectionIds ? repoOwner : templateOwner;
    const compDefRepo = blockCollectionIds ? repoName : templateRepo;

    const libResult = await daLiveContentOps.blockLibOps.createBlockLibraryFromTemplate(
        daLiveOrg,
        daLiveSite,
        compDefOwner,
        compDefRepo,
        (owner, repo, path) => githubFileOps.getFileContent(owner, repo, path),
        libraryContentSources,
        blockCollectionIds,
    );

    if (libResult.blocksCount > 0) {
        logger.info(`[EdsPipeline] Block library: ${libResult.blocksCount} blocks configured`);
        onProgress?.({
            operation: 'block-library',
            message: jobLine(STOREFRONT_JOBS.buildingBlockLibrary, itemCount(libResult.blocksCount, 'block')),
        });
    }
    // The palette will be empty (EDS-38): the step warns the SC with it.
    if (!libResult.success && libResult.error) {
        logger.warn(`[EdsPipeline] ${libResult.error}`);
        return { paths: libResult.paths, emptyPalette: libResult.error };
    }

    return { paths: libResult.paths };
}

/**
 * Copy block doc pages from library content sources via the DA.live API.
 *
 * Works for orgs the user owns (has DA.live auth on). For third-party orgs the
 * API returns 403 — that's tolerated and logged, since the CDN-based fallback
 * inside createBlockLibraryFromTemplate handles those sources. Any other error
 * is propagated.
 */
async function copyLibraryDocPages(
    daLiveContentOps: DaLiveContentOperations,
    libraryContentSources: Array<{ org: string; site: string }>,
    daLiveOrg: string,
    daLiveSite: string,
    logger: Logger,
): Promise<void> {
    for (const libSource of libraryContentSources) {
        try {
            logger.info(
                `[EdsPipeline] Copying block doc pages from ${libSource.org}/${libSource.site}`,
            );
            await daLiveContentOps.copyOps.copyContent(
                { org: libSource.org, site: libSource.site, path: '.da/library/blocks' },
                { org: daLiveOrg, site: daLiveSite, path: '.da/library/blocks' },
                { recursive: true },
            );
        } catch (error) {
            // 403 = no auth on source org — CDN fallback will handle it
            if (error instanceof DaLiveError && error.statusCode === 403) {
                logger.info(
                    `[EdsPipeline] No DA.live access to ${libSource.org}/${libSource.site}, will use CDN fallback`,
                );
            } else {
                throw error; // Unexpected error — propagate
            }
        }
    }
}

// ==========================================================
// Pipeline
// ==========================================================

/**
 * The mutable state the steps share — the result in progress. Steps write the
 * fields later steps (and the final result) read; making it an explicit object
 * rather than closure locals is what lets the orchestrator be a loop.
 */
interface PipelineContext {
    contentFilesCopied: number;
    /** The sheets step 1 wrote, as web paths (`/metadata.json`); step 5.5 publishes them. */
    sheetPaths: string[];
    /** The site paths the storefront's code loads (step 0.5); undefined when it was not read. */
    codePaths?: string[];
    /** The code paths the source had, which step 1 copied; step 7.5 looks for them. */
    codePathsOnSource: string[];
    /** Everything else step 1 copied, as web paths; step 7.5 looks for these too. */
    carriedPaths: string[];
    /** The sentences for the SC so far (EDS-55); see {@link EdsPipelineResult.warnings}. */
    warnings: string[];
    libraryPaths: string[];
    patchReport: PatchReport;
    /** What step 5 published; undefined when it did not run or did not say. */
    republishedPages?: string[];
    leftoverPages?: LeftoverPagesResult;
}

/** Params with every gating flag resolved to a concrete boolean. */
type ResolvedPipelineParams = EdsPipelineParams & {
    clearExistingContent: boolean;
    skipContent: boolean;
    skipPublish: boolean;
    includeBlockLibrary: boolean;
    purgeCache: boolean;
};

/** Everything a step can see. */
interface PipelineStepEnv {
    params: ResolvedPipelineParams;
    services: EdsPipelineServices;
    ctx: PipelineContext;
    onProgress?: EdsPipelineProgressCallback;
}

/**
 * One pipeline step, declaratively.
 *
 * - `when` gates the step; absent means always. Gating lives HERE, in data —
 *   this is what collapsed `executeEdsPipeline` from complexity 27 to a loop.
 * - `onError: 'continue'` marks a deliberately non-fatal step (the loop warns
 *   with `failureLog` and moves on). The default is abort: the throw reaches
 *   the orchestrator's single catch, which keeps the one special case —
 *   `DaLiveAuthError` re-thrown so callers can offer re-authentication.
 * - `skipLog` preserves the exact "skipped" log lines the old orchestrator
 *   printed for the two steps that had them.
 */
interface PipelineStep {
    name: string;
    when?: (env: PipelineStepEnv) => boolean;
    skipLog?: string;
    onError?: 'continue';
    failureLog?: string;
    run: (env: PipelineStepEnv) => Promise<void>;
}

const PIPELINE_STEPS: PipelineStep[] = [
    // Step 0: Clear Existing Content (if requested)
    {
        name: 'clear-content',
        when: ({ params }) => params.clearExistingContent,
        run: ({ params, services, onProgress }) =>
            pipelineClearContent(
                services,
                { daLiveOrg: params.daLiveOrg, daLiveSite: params.daLiveSite },
                onProgress,
            ),
    },
    // Step 0.5: the storefront's code, read from the SC's own repository, which
    // holds the final code before the copy in every flow (EDS-40). The paths that
    // code loads tell the copy what to ask the source for. Non-fatal: unread, the
    // copy falls back to the fixed lists.
    {
        name: 'storefront-code',
        when: ({ params }) => !params.skipContent,
        onError: 'continue',
        failureLog: 'Storefront code read failed',
        run: pipelineReadStorefrontCode,
    },
    // Step 1: Content Copy
    {
        name: 'copy-content',
        when: ({ params }) => !params.skipContent,
        skipLog: 'Skipping content copy (skipContent=true)',
        run: async ({ params, services, ctx, onProgress }) => {
            if (!params.contentSource) {
                throw new Error('Content source is required when skipContent is false');
            }
            const copied = await pipelineCopyContent(
                services.daLiveContentOps,
                params.contentSource,
                params.daLiveOrg,
                params.daLiveSite,
                params.contentPatches,
                params.contentPatchSource,
                ctx.patchReport,
                services.logger,
                onProgress,
                params.accountContentSource,
                // ADR-008 consumer: locate this ledger's generated runtime-surfaces.json
                // (codePatchSource carries owner/repo/path = the patches-repo ledger).
                params.codePatchSource,
                ctx.codePaths,
            );
            ctx.contentFilesCopied = copied.filesCopied;
            ctx.sheetPaths = copied.sheetPaths;
            ctx.codePathsOnSource = copied.codePathsOnSource;
            ctx.carriedPaths = copied.carriedPaths;
        },
    },
    // Step 2: Block Library
    {
        name: 'block-library',
        when: ({ params }) => params.includeBlockLibrary,
        run: async (env) => {
            const library = await pipelineConfigureBlockLibrary(env.services, env.params, env.onProgress);
            env.ctx.libraryPaths = library.paths;
            if (library.emptyPalette) warnTheSc(env, 'block-library', library.emptyPalette);
        },
    },
    // Step 2.5: Block-targeting code patches (post-install).
    // Canonical-file patches were applied earlier in `resetRepoToTemplate` via
    // `applyCanonicalCodePatches`. The block-targeting subset of the same ledger
    // runs here, AFTER block install, so installed library blocks are present in
    // the repo to be patched. Phase routing is by target prefix (`blocks/...` →
    // here; everything else → canonical). Non-fatal per ADR-006 D1: results go
    // to `patchReport`; the caller surfaces unapplied patches via the one-toast
    // helper.
    {
        name: 'block-code-patches',
        run: ({ params, services, ctx }) =>
            pipelineApplyBlockCodePatches(
                services.githubFileOps,
                params.repoOwner,
                params.repoName,
                params.codePatches,
                params.codePatchSource,
                ctx.patchReport,
                services.logger,
            ),
    },
    // Step 2.6: Brand assets (additive brand files + head.html snippet).
    // After block install for the same reason as block-targeting patches:
    // installed blocks are present to be referenced. Both create and reset reach
    // this point through the shared pipeline, so the two paths stay
    // behavior-identical. Skipped silently when the package declares none.
    {
        name: 'brand-assets',
        run: ({ params, services }) =>
            pipelineApplyBrandAssets(
                services.githubFileOps,
                params.repoOwner,
                params.repoName,
                params.brandAssets,
                services.logger,
            ),
    },
    // Step 3: EDS Settings
    {
        name: 'eds-settings',
        run: async ({ params, services, onProgress }) => {
            onProgress?.({
                operation: 'eds-settings',
                message: STOREFRONT_JOBS.applyingDaLiveSettings,
            });
            const { applyDaLiveOrgConfigSettings } = await import('../handlers/edsHelpers');
            await applyDaLiveOrgConfigSettings(
                services.daLiveContentOps,
                params.daLiveOrg,
                params.daLiveSite,
                services.logger,
            );
        },
    },
    // Step 4: Cache Purge
    {
        name: 'cache-purge',
        when: ({ params }) => params.purgeCache,
        run: async ({ params, services, onProgress }) => {
            onProgress?.({
                operation: 'cache-purge',
                message: STOREFRONT_JOBS.clearingCache,
            });
            await services.helixService.purgeCacheAll(params.repoOwner, params.repoName, 'main');
            services.logger.info('[EdsPipeline] Stale cache purged');
        },
    },
    // Step 5: Content Publish
    {
        name: 'content-publish',
        when: ({ params }) => !params.skipPublish,
        skipLog: 'Skipping content publish (skipPublish=true)',
        run: async ({ params, services, ctx, onProgress }) => {
            ctx.republishedPages = await pipelinePublishContent(
                services.helixService,
                params.repoOwner,
                params.repoName,
                params.daLiveOrg,
                params.daLiveSite,
                services.logger,
                onProgress,
            );
        },
    },
    // Step 5.5: Sheet Publish — the sheets step 1 copied. Step 5 publishes .html
    // documents only and skips metadata, redirects and placeholders by name, so a
    // copied sheet is served only if it is published here, by path. Non-fatal: the
    // sheets are in DA.live and publishing can be retried.
    {
        name: 'sheet-publish',
        when: ({ params, ctx }) => !params.skipPublish && ctx.sheetPaths.length > 0,
        onError: 'continue',
        failureLog: 'Sheet publish failed',
        run: pipelinePublishSheets,
    },
    // Step 6: Library Publish — non-fatal: library config was created,
    // publishing can be retried.
    {
        name: 'library-publish',
        when: ({ ctx }) => ctx.libraryPaths.length > 0,
        onError: 'continue',
        failureLog: 'Block library publish failed',
        run: pipelinePublishLibrary,
    },
    // Step 7: the pages left over from before the content was replaced (EDS-33).
    // After the republish, so the storefront stayed up throughout; before the
    // pre-warm, whose product pages are never on the list anyway. Never throws.
    {
        name: 'leftover-pages',
        when: ({ params }) => params.clearExistingContent && !params.skipPublish,
        run: pipelineUnpublishLeftovers,
    },
    // Step 7.5: is everything the source had on the storefront now (EDS-40)? After
    // every publish and unpublish above, so it reads the finished site. Never throws.
    {
        name: 'page-check',
        when: ({ params, ctx }) =>
            !params.skipPublish &&
            (ctx.codePathsOnSource.length > 0 || ctx.carriedPaths.length > 0),
        onError: 'continue',
        failureLog: 'Page check failed',
        run: pipelineCheckMissingPages,
    },
    // (Smart 404 plumbing lives entirely in storefront code now:
    //  - scripts/delayed.js — cold-path action call + Loading state
    //  - head.html — eager mixed-case → lowercase redirect on 200s
    //  - 404.html — same eager redirect for Helix-served 404s
    //  All three are installed by installSmart404Handler from
    //  storefrontSetupPhase2 (create/edit) and edsResetRepoHelper (reset). The
    //  DA.live /404 page publish path that briefly lived here didn't help —
    //  Helix uses the static 404.html file, not authored content, on 404s.)
    //
    // Step 8: Catalog pre-warming (v1 ACCS only). Enumerate the storefront's
    // Commerce catalog and pre-publish every product path so first-visit cold
    // paths never fire during demos. Non-fatal: failures fall through to the
    // smart-404 fallback, which still handles unknown SKUs at runtime. Gated on:
    //  - params.project — caller opts in by passing the project
    //  - params.byomOverlayUrl — same gate as smart-404 install
    //  - !skipPublish — refresh-block-library and similar narrow paths skip it
    {
        name: 'catalog-prewarm',
        when: ({ params }) => !params.skipPublish && !!params.byomOverlayUrl && !!params.project,
        onError: 'continue',
        // Defense in depth — prewarmCatalog is already non-fatal internally, but
        // a thrown exception must not abort the pipeline.
        failureLog: 'Catalog pre-warming threw unexpectedly',
        run: pipelinePrewarmCatalog,
    },
];

/**
 * Step 5.5 body: preview and publish each copied sheet at its `.json` web path,
 * through the same single-page route the block library's sheet takes.
 */
async function pipelinePublishSheets({ params, services, ctx, onProgress }: PipelineStepEnv) {
    const { helixService, logger } = services;
    const count = ctx.sheetPaths.length;
    onProgress?.({
        operation: 'sheet-publish',
        message: jobLine(STOREFRONT_JOBS.publishingSheets, itemCount(count, 'sheet')),
        subMessage: `${params.repoOwner}/${params.repoName}`,
    });

    const { publishSheetPaths } = await import('../handlers/edsHelpers');
    const { published, failed } = await publishSheetPaths(
        helixService,
        params.repoOwner,
        params.repoName,
        ctx.sheetPaths,
        logger,
    );
    const log = failed > 0 ? logger.warn : logger.info;
    log.call(logger, `[EdsPipeline] Sheets published: ${published} of ${count}`);
}

/**
 * The library paths to publish: all of them, or the block list and the named blocks'
 * doc pages (`publishLibraryBlocksOnly`).
 */
function libraryPathsToPublish(paths: string[], onlyBlocks: string[] | undefined): string[] {
    if (!onlyBlocks) return paths;
    const wanted = new Set(onlyBlocks.map((id) => `/.da/library/blocks/${id}`));
    return paths.filter((path) => path === '/.da/library/blocks.json' || wanted.has(path));
}

/**
 * Step 6 body: publish the installed library paths, then verify they actually
 * previewed. Say it landed only if it landed — the bulk job reports success for
 * paths that matched nothing, which is how a library that could not preview a
 * single block logged "published".
 */
async function pipelinePublishLibrary({ params, services, ctx, onProgress }: PipelineStepEnv) {
    const { helixService, daLiveContentOps, logger } = services;
    const toPublish = libraryPathsToPublish(ctx.libraryPaths, params.publishLibraryBlocksOnly);
    // A 2-minute spinner with a static hint was the complaint (user-asked
    // 2026-08-23). Say what is actually happening: how much, then which half;
    // the line under it names the site, as the other steps do.
    const site = `${params.repoOwner}/${params.repoName}`;
    onProgress?.({
        operation: 'library-publish',
        message: jobLine(STOREFRONT_JOBS.publishingBlockList, itemCount(toPublish.length, 'page')),
        subMessage: site,
    });

    const { publishLibraryPaths, verifyLibraryPreviewed } = await import('../handlers/edsHelpers');
    await publishLibraryPaths(
        helixService,
        params.repoOwner,
        params.repoName,
        toPublish,
        logger,
    );
    onProgress?.({
        operation: 'library-publish',
        message: jobLine(STOREFRONT_JOBS.publishingBlockList, 'Checking the block list is live'),
        subMessage: site,
    });
    const previewed = await verifyLibraryPreviewed(
        params.repoOwner,
        params.repoName,
        logger,
        helixService,
    );
    if (previewed) {
        logger.info('[EdsPipeline] Block library published');
    } else {
        logger.info('[EdsPipeline] Block library published, but it is not previewable');
        // The site config is the state nobody can inspect after the fact, and it
        // is the leading suspect when publishing reports success and the CDN
        // still 404s. Print it here, once, where the user is already being told
        // something is wrong.
        const siteConfig = await daLiveContentOps.configOps.readSiteConfigForDiagnostics(
            params.daLiveOrg,
            params.daLiveSite,
        );
        logger.warn(
            `[EdsPipeline] Site config for ${params.daLiveOrg}/${params.daLiveSite}: ` +
                (siteConfig ? JSON.stringify(siteConfig) : '(could not be read)'),
        );
    }
}

/**
 * Step 7 body: unpublish what Helix still has published that steps 5-6 did not
 * publish. A result that may leave old pages live goes on the progress line as a
 * warning, and on the pipeline result for the caller to show.
 */
async function pipelineUnpublishLeftovers({ params, services, ctx, onProgress }: PipelineStepEnv) {
    onProgress?.({
        operation: 'leftover-pages',
        message: STOREFRONT_JOBS.removingOldPages,
        subMessage: `${params.repoOwner}/${params.repoName}`,
    });
    const site = { owner: params.repoOwner, repo: params.repoName };
    const result = await unpublishLeftoverPages(
        site,
        { republished: ctx.republishedPages, alsoPublished: ctx.libraryPaths },
        {
            helix: services.helixService,
            logger: services.logger,
            inSource: pageInSource(services.daLiveContentOps.sourceOps, params.daLiveOrg, params.daLiveSite),
        },
    );
    if (result.kept) await publishMissedPages(site, result.kept, services);
    ctx.leftoverPages = result;
    if (LEFTOVERS_MAY_REMAIN.has(result.status)) warnTheSc({ ctx, onProgress }, 'leftover-pages', result.summary);
    else onProgress?.({ operation: 'leftover-pages', message: result.summary });
}

/**
 * Tell the SC something a step could not do (EDS-55): on the progress line now, with the
 * warning sign, and on the result's `warnings`, which every surface that ends a create
 * or a reset reads. The one way a step warns.
 */
function warnTheSc(
    env: Pick<PipelineStepEnv, 'ctx' | 'onProgress'>,
    operation: string,
    sentence: string,
): void {
    env.ctx.warnings.push(sentence);
    env.onProgress?.({ operation, message: `⚠️ ${sentence}` });
}

/**
 * Pages the leftover check listed that DA.live still has: published one at a time
 * rather than removed, so the page check after this reads them as served. Never
 * throws; a page that fails stays for the page check to name.
 */
async function publishMissedPages(
    site: { owner: string; repo: string },
    paths: string[],
    { helixService, logger }: EdsPipelineServices,
): Promise<void> {
    logger.warn(`[EdsPipeline] DA.live still has ${paths.length} page(s) the leftover check listed; publishing, not removing: ${paths.join(' ')}`);
    for (const path of paths) {
        try {
            await helixService.previewAndPublishPage(site.owner, site.repo, path);
        } catch (error) {
            logger.warn(`[EdsPipeline] Could not publish ${path}: ${(error as Error).message}`);
        }
    }
}

/**
 * Step 0.5 body: read the storefront's code for the site paths it loads. One
 * download, a second or two; it reports no progress line of its own.
 */
async function pipelineReadStorefrontCode({ params, services, ctx }: PipelineStepEnv) {
    ctx.codePaths = await readStorefrontCodePaths(
        services.githubFileOps.repoArchive,
        { owner: params.repoOwner, repo: params.repoName },
        services.logger,
    );
}

/**
 * Step 7.5 body: ask the live storefront for what the source had. A gap goes on the
 * progress line as a warning, and on the pipeline result for the caller to show.
 */
async function pipelineCheckMissingPages({ params, services, ctx, onProgress }: PipelineStepEnv) {
    const source = params.contentSource;
    if (!source) return;
    onProgress?.({ operation: 'page-check', message: STOREFRONT_JOBS.checkingCopiedPages });
    const result = await findMissingPages(
        { owner: params.repoOwner, repo: params.repoName },
        source,
        { fromCode: ctx.codePathsOnSource, carried: ctx.carriedPaths },
        services.logger,
    );
    if (result.summary) warnTheSc({ ctx, onProgress }, 'page-check', result.summary);
}

/** Step 8 body: pre-warm the catalog; reporting only, all gating is in the descriptor. */
async function pipelinePrewarmCatalog({ params, services, onProgress }: PipelineStepEnv) {
    const result = await prewarmCatalog(
        params.project as Project,
        params.byomOverlayUrl as string,
        params.daLiveOrg,
        params.daLiveSite,
        services.helixService,
        services.logger,
        onProgress,
    );
    if (!result.skipped) {
        services.logger.info(
            `[EdsPipeline] Catalog pre-warming: ${result.succeeded}/${result.attempted} SKUs pre-published`,
        );
    }
}

/**
 * Execute the shared EDS content pipeline.
 *
 * The spine of create, reset AND refresh-block-library: orchestrates content
 * copy, block library creation, EDS settings, cache purge, and content
 * publishing. All step gating and error semantics live in
 * {@link PIPELINE_STEPS}; this function is the loop that runs them.
 *
 * @param params - Pipeline parameters
 * @param services - Pre-built service instances
 * @param onProgress - Optional progress callback for UI updates
 * @returns Pipeline result with counts and library paths
 */
export async function executeEdsPipeline(
    params: EdsPipelineParams,
    services: EdsPipelineServices,
    onProgress?: EdsPipelineProgressCallback,
): Promise<EdsPipelineResult> {
    const resolved: ResolvedPipelineParams = {
        ...params,
        clearExistingContent: params.clearExistingContent ?? false,
        skipContent: params.skipContent ?? false,
        skipPublish: params.skipPublish ?? params.skipContent ?? false,
        includeBlockLibrary: params.includeBlockLibrary ?? false,
        purgeCache: params.purgeCache ?? false,
    };

    const ctx: PipelineContext = {
        contentFilesCopied: 0,
        sheetPaths: [],
        codePathsOnSource: [],
        carriedPaths: [],
        warnings: [],
        libraryPaths: [],
        // Reuse the caller's report when threaded through (so canonical-phase
        // results from `resetRepoToTemplate` survive into the final result),
        // else start fresh. Both `addContentResult` and `addCodeResult` mutate
        // through the same reference, so the final pipeline result always
        // carries the full report.
        patchReport: params.patchReport ?? createPatchReport(),
    };
    const env: PipelineStepEnv = { params: resolved, services, ctx, onProgress };
    const { logger } = services;

    try {
        for (const step of PIPELINE_STEPS) {
            if (step.when && !step.when(env)) {
                if (step.skipLog) logger.info(`[EdsPipeline] ${step.skipLog}`);
                continue;
            }
            try {
                await step.run(env);
            } catch (error) {
                if (step.onError !== 'continue') throw error;
                logger.warn(
                    `[EdsPipeline] ${step.failureLog ?? `${step.name} failed`}: ${(error as Error).message}`,
                );
            }
        }

        return {
            success: true,
            contentFilesCopied: ctx.contentFilesCopied,
            libraryPaths: ctx.libraryPaths,
            patchReport: ctx.patchReport,
            ...(ctx.leftoverPages ? { leftoverPages: ctx.leftoverPages } : {}),
            warnings: ctx.warnings,
        };
    } catch (error) {
        // Re-throw auth errors so callers can offer re-authentication
        if (error instanceof DaLiveAuthError) throw error;

        const errorMessage = (error as Error).message;
        logger.error(`[EdsPipeline] Failed: ${errorMessage}`);
        return {
            success: false,
            contentFilesCopied: ctx.contentFilesCopied,
            libraryPaths: ctx.libraryPaths,
            patchReport: ctx.patchReport,
            error: errorMessage,
            warnings: ctx.warnings,
        };
    }
}
