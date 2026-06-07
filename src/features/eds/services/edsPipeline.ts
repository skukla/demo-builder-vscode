/**
 * EDS Content Pipeline
 *
 * Shared pipeline that orchestrates the content/publish sequence used by both
 * the setup flow (storefrontSetupHandlers) and the reset flow (edsResetService).
 *
 * Operations executed in order:
 * 0. Clear existing DA.live content and unpublish CDN pages (gated by clearExistingContent)
 *    - Uses DA.live Bearer token auth which bypasses "source exists" restriction
 * 1. Copy DA.live content from source (gated by skipContent)
 * 2. Create block library from component-definition.json
 * 3. Apply EDS settings (AEM Assets, Universal Editor config)
 * 4. Purge CDN cache (conditional)
 * 5. Publish content to CDN
 * 6. Publish block library paths
 *
 * @module features/eds/services/edsPipeline
 */

import type { DaLiveContentOperations } from './daLiveContentOperations';
import type { GitHubFileOperations } from './githubFileOperations';
import type { HelixService } from './helixService';
import { DaLiveAuthError, DaLiveError } from './types';
import type { ContentPatchSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

// ==========================================================
// Types
// ==========================================================

/** Progress callback — callers map operations to their own phase/step scheme */
export type EdsPipelineProgressCallback = (info: {
    operation: string;
    message: string;
    subMessage?: string;
    current?: number;
    total?: number;
    percentage?: number;
}) => void;

/** Pipeline parameters — encompasses both setup and reset use cases */
export interface EdsPipelineParams {
    repoOwner: string;
    repoName: string;
    daLiveOrg: string;
    daLiveSite: string;
    templateOwner: string;
    templateRepo: string;

    /**
     * The aem.live SITE identity for Helix operations (preview/publish/purge/unpublish),
     * decoupled from the code source. Defaults to `repoOwner`/`repoName` (the canonical
     * case, where site == code). A **repoless satellite** sets these to its own
     * `daLiveOrg`/`daLiveSite` while `repoOwner`/`repoName` point at the upstream code.
     * See ADR-003 (site-vs-code identity) + step-04.
     */
    siteOrg?: string;
    siteName?: string;

    // Content management
    /** Delete all existing DA.live content before populating (true = clean slate) */
    clearExistingContent?: boolean;
    skipContent?: boolean;
    contentSource?: { org: string; site: string; indexPath?: string };
    contentPatches?: string[];
    contentPatchSource?: ContentPatchSource;

    // Block library
    includeBlockLibrary?: boolean;
    blockCollectionIds?: string[];
    /** DA.live content sources for block library doc pages (.da/library/blocks/) */
    libraryContentSources?: Array<{ org: string; site: string }>;

    // Publish
    purgeCache?: boolean;
    skipPublish?: boolean;
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
}

// ==========================================================
// Pipeline Helpers
// ==========================================================

/**
 * Convert DA.live paths to web paths for Admin API.
 * HTML: /accessories.html -> /accessories, /products/index.html -> /products
 * Non-HTML: kept as-is (e.g. /media_abc.png, /config.json)
 */
function toWebPaths(daLivePaths: string[]): string[] {
    return daLivePaths.map(p => {
        if (!p.endsWith('.html')) {
            return p;
        }
        let web = p.replace(/\.html$/i, '');
        if (web === '/index' || web.endsWith('/index')) {
            web = web.slice(0, -6) || '/';
        }
        return web || '/';
    });
}

/**
 * Step 0: Clear all existing DA.live content and unpublish from CDN.
 *
 * Uses DA.live Bearer token auth for DELETE operations, which bypasses
 * the Helix Admin API's "source exists" restriction. No fstab.yaml
 * manipulation or Configuration Service config changes needed.
 */
async function pipelineClearContent(
    services: EdsPipelineServices,
    context: {
        daLiveOrg: string;
        daLiveSite: string;
        siteOrg: string;
        siteName: string;
    },
    onProgress?: EdsPipelineProgressCallback,
): Promise<void> {
    const { daLiveContentOps, helixService, logger } = services;
    const { daLiveOrg, daLiveSite, siteOrg, siteName } = context;

    onProgress?.({ operation: 'content-clear', message: 'Clearing existing DA.live content...' });
    logger.info(`[EdsPipeline] Clearing all DA.live content for ${daLiveOrg}/${daLiveSite}`);

    const clearResult = await daLiveContentOps.deleteAllSiteContent(
        daLiveOrg, daLiveSite,
        (info) => {
            onProgress?.({
                operation: 'content-clear',
                message: `Clearing content (${info.deleted} files removed)`,
                subMessage: info.current,
            });
        },
    );

    if (!clearResult.success) {
        throw new Error(`Content clear failed: ${clearResult.error}`);
    }

    logger.info(`[EdsPipeline] Cleared ${clearResult.deletedCount} files`);

    // Unpublish deleted content from CDN (Helix retains previously-published resources)
    if (clearResult.deletedPaths.length > 0) {
        const webPaths = toWebPaths(clearResult.deletedPaths);

        onProgress?.({
            operation: 'content-clear',
            message: `Unpublishing ${webPaths.length} CDN pages...`,
        });

        try {
            await helixService.unpublishPages(siteOrg, siteName, 'main', webPaths);
        } catch (error) {
            logger.warn(`[EdsPipeline] CDN unpublish failed (non-fatal): ${(error as Error).message}`);
        }
    }

    onProgress?.({ operation: 'content-clear', message: `Cleared ${clearResult.deletedCount} files` });
}

/**
 * Step 1: Copy content from source to DA.live.
 * @returns Number of files copied.
 */
async function pipelineCopyContent(
    daLiveContentOps: DaLiveContentOperations,
    contentSource: { org: string; site: string; indexPath?: string },
    daLiveOrg: string,
    daLiveSite: string,
    contentPatches: string[] | undefined,
    contentPatchSource: ContentPatchSource | undefined,
    logger: Logger,
    onProgress?: EdsPipelineProgressCallback,
): Promise<number> {
    onProgress?.({
        operation: 'content-copy',
        message: 'Populating DA.live content...',
    });

    const indexPath = contentSource.indexPath || '/full-index.json';
    const fullContentSource = {
        org: contentSource.org,
        site: contentSource.site,
        indexUrl: `https://main--${contentSource.site}--${contentSource.org}.aem.live${indexPath}`,
    };

    logger.info(`[EdsPipeline] Copying content from ${contentSource.org}/${contentSource.site} to ${daLiveOrg}/${daLiveSite}`);

    const contentResult = await daLiveContentOps.copyContentFromSource(
        fullContentSource,
        daLiveOrg,
        daLiveSite,
        (progress) => {
            const statusMessage = progress.message || `Copying content (${progress.processed}/${progress.total})`;
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
    );

    if (!contentResult.success) {
        throw new Error(`Content copy failed: ${contentResult.failedFiles.length} files failed`);
    }

    logger.info(`[EdsPipeline] Content populated: ${contentResult.totalFiles} files`);

    onProgress?.({
        operation: 'content-copy',
        message: 'Content populated',
    });

    return contentResult.totalFiles;
}

/**
 * Step 5: Publish content to CDN.
 * Treats "No publishable pages" as non-fatal.
 */
async function pipelinePublishContent(
    helixService: HelixService,
    repoOwner: string,
    repoName: string,
    daLiveOrg: string,
    daLiveSite: string,
    logger: Logger,
    onProgress?: EdsPipelineProgressCallback,
): Promise<void> {
    onProgress?.({
        operation: 'content-publish',
        message: 'Publishing content to CDN...',
    });

    logger.info(`[EdsPipeline] Publishing content to CDN for ${repoOwner}/${repoName}`);

    try {
        await helixService.publishAllSiteContent(
            `${repoOwner}/${repoName}`,
            'main',
            daLiveOrg,
            daLiveSite,
            (info) => {
                onProgress?.({
                    operation: 'content-publish',
                    message: info.message,
                    subMessage: info.currentPath,
                    current: info.current,
                    total: info.total,
                });
            },
        );
        logger.info('[EdsPipeline] Content published to CDN');
    } catch (publishError) {
        // No publishable pages is non-fatal (e.g. Custom package with no content source)
        const msg = (publishError as Error).message;
        if (msg.includes('No publishable pages')) {
            logger.info('[EdsPipeline] No content pages to publish (site has no publishable content)');
        } else {
            throw publishError;
        }
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
): Promise<string[]> {
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
        message: 'Configuring block library...',
    });

    // Copy block doc pages from library content sources via DA.live API.
    // This works for orgs the user owns (has DA.live auth on). For
    // third-party orgs (403), we log a warning and fall back to CDN-based
    // copy inside createBlockLibraryFromTemplate.
    if (libraryContentSources?.length) {
        await copyLibraryDocPages(
            daLiveContentOps, libraryContentSources, daLiveOrg, daLiveSite, logger,
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

    const libResult = await daLiveContentOps.createBlockLibraryFromTemplate(
        daLiveOrg, daLiveSite, compDefOwner, compDefRepo,
        (owner, repo, path) => githubFileOps.getFileContent(owner, repo, path),
        libraryContentSources,
        blockCollectionIds,
    );

    if (libResult.blocksCount > 0) {
        logger.info(`[EdsPipeline] Block library: ${libResult.blocksCount} blocks configured`);
        onProgress?.({
            operation: 'block-library',
            message: `Block library configured (${libResult.blocksCount} blocks)`,
        });
    }

    return libResult.paths;
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
            logger.info(`[EdsPipeline] Copying block doc pages from ${libSource.org}/${libSource.site}`);
            await daLiveContentOps.copyContent(
                { org: libSource.org, site: libSource.site, path: '.da/library/blocks' },
                { org: daLiveOrg, site: daLiveSite, path: '.da/library/blocks' },
                { recursive: true },
            );
        } catch (error) {
            // 403 = no auth on source org — CDN fallback will handle it
            if (error instanceof DaLiveError && error.statusCode === 403) {
                logger.info(`[EdsPipeline] No DA.live access to ${libSource.org}/${libSource.site}, will use CDN fallback`);
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
 * Execute the shared EDS content pipeline.
 *
 * Orchestrates content copy, block library creation, EDS settings,
 * cache purge, and content publishing. Both setup and reset flows
 * call this after their own setup-specific work.
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
    const { daLiveContentOps, helixService, logger } = services;
    const {
        repoOwner,
        repoName,
        daLiveOrg,
        daLiveSite,
        clearExistingContent = false,
        skipContent = false,
        skipPublish = skipContent,
        contentSource,
        contentPatches,
        contentPatchSource,
        includeBlockLibrary = false,
        purgeCache = false,
    } = params;

    // Helix targets the aem.live SITE; code reads target repoOwner/repoName.
    // Canonical: site == code (defaults). Satellite: site = own daLiveOrg/daLiveSite.
    const siteOrg = params.siteOrg ?? repoOwner;
    const siteName = params.siteName ?? repoName;

    let contentFilesCopied = 0;
    let libraryPaths: string[] = [];

    try {
        // Step 0: Clear Existing Content (if requested)
        if (clearExistingContent) {
            await pipelineClearContent(
                services,
                { daLiveOrg, daLiveSite, siteOrg, siteName },
                onProgress,
            );
        }

        // Step 1: Content Copy
        if (!skipContent) {
            if (!contentSource) {
                throw new Error('Content source is required when skipContent is false');
            }
            contentFilesCopied = await pipelineCopyContent(
                daLiveContentOps, contentSource, daLiveOrg, daLiveSite,
                contentPatches, contentPatchSource, logger, onProgress,
            );
        } else {
            logger.info('[EdsPipeline] Skipping content copy (skipContent=true)');
        }

        // Step 2: Block Library
        if (includeBlockLibrary) {
            libraryPaths = await pipelineConfigureBlockLibrary(services, params, onProgress);
        }

        // Step 3: EDS Settings
        onProgress?.({
            operation: 'eds-settings',
            message: 'Applying EDS configuration...',
        });

        const { applyDaLiveOrgConfigSettings } = await import('../handlers/edsHelpers');
        await applyDaLiveOrgConfigSettings(daLiveContentOps, daLiveOrg, daLiveSite, logger);

        // Step 4: Cache Purge
        if (purgeCache) {
            onProgress?.({
                operation: 'cache-purge',
                message: 'Purging stale cache...',
            });

            await helixService.purgeCacheAll(siteOrg, siteName, 'main');
            logger.info('[EdsPipeline] Stale cache purged');
        }

        // Step 5: Content Publish
        if (!skipPublish) {
            await pipelinePublishContent(
                helixService, siteOrg, siteName, daLiveOrg, daLiveSite, logger, onProgress,
            );
        } else {
            logger.info('[EdsPipeline] Skipping content publish (skipPublish=true)');
        }

        // Step 6: Library Publish
        if (libraryPaths.length > 0) {
            onProgress?.({
                operation: 'library-publish',
                message: 'Publishing block library...',
            });

            try {
                const { bulkPreviewAndPublish } = await import('../handlers/edsHelpers');
                await bulkPreviewAndPublish(helixService, siteOrg, siteName, libraryPaths, logger);
                logger.info('[EdsPipeline] Block library published');
            } catch (libPublishError) {
                // Non-fatal -- library config was created, publishing can be retried
                logger.warn(`[EdsPipeline] Block library publish failed: ${(libPublishError as Error).message}`);
            }
        }

        return {
            success: true,
            contentFilesCopied,
            libraryPaths,
        };
    } catch (error) {
        // Re-throw auth errors so callers can offer re-authentication
        if (error instanceof DaLiveAuthError) throw error;

        const errorMessage = (error as Error).message;
        logger.error(`[EdsPipeline] Failed: ${errorMessage}`);
        return {
            success: false,
            contentFilesCopied,
            libraryPaths,
            error: errorMessage,
        };
    }
}
