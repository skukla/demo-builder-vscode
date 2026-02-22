/**
 * EDS Content Pipeline
 *
 * Shared pipeline that orchestrates the content/publish sequence used by both
 * the setup flow (storefrontSetupHandlers) and the reset flow (edsResetService).
 *
 * Operations executed in order:
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
 */
async function pipelineClearContent(
    daLiveContentOps: DaLiveContentOperations,
    helixService: HelixService,
    daLiveOrg: string,
    daLiveSite: string,
    repoOwner: string,
    repoName: string,
    logger: Logger,
    onProgress?: EdsPipelineProgressCallback,
): Promise<void> {
    onProgress?.({
        operation: 'content-clear',
        message: 'Clearing existing DA.live content...',
    });

    logger.info(`[EdsPipeline] Clearing all DA.live content for ${daLiveOrg}/${daLiveSite}`);

    const clearResult = await daLiveContentOps.deleteAllSiteContent(
        daLiveOrg,
        daLiveSite,
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
            await helixService.unpublishPages(repoOwner, repoName, 'main', webPaths);
        } catch (unpublishError) {
            // Non-fatal -- source content is cleared, CDN will eventually sync
            logger.warn(`[EdsPipeline] Bulk unpublish failed: ${(unpublishError as Error).message}`);
        }
    }

    onProgress?.({
        operation: 'content-clear',
        message: `Cleared ${clearResult.deletedCount} files`,
    });
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
    const { daLiveContentOps, githubFileOps, helixService, logger } = services;
    const {
        repoOwner,
        repoName,
        daLiveOrg,
        daLiveSite,
        templateOwner,
        templateRepo,
        clearExistingContent = false,
        skipContent = false,
        skipPublish = skipContent,
        contentSource,
        contentPatches,
        contentPatchSource,
        includeBlockLibrary = false,
        blockCollectionIds,
        purgeCache = false,
    } = params;

    let contentFilesCopied = 0;
    let libraryPaths: string[] = [];

    try {
        // Step 0: Clear Existing Content (if requested)
        if (clearExistingContent) {
            await pipelineClearContent(
                daLiveContentOps, helixService, daLiveOrg, daLiveSite,
                repoOwner, repoName, logger, onProgress,
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
            onProgress?.({
                operation: 'block-library',
                message: 'Configuring block library...',
            });

            const compDefOwner = blockCollectionIds ? repoOwner : templateOwner;
            const compDefRepo = blockCollectionIds ? repoName : templateRepo;

            const libResult = await daLiveContentOps.createBlockLibraryFromTemplate(
                daLiveOrg, daLiveSite, compDefOwner, compDefRepo,
                (owner, repo, path) => githubFileOps.getFileContent(owner, repo, path),
                blockCollectionIds,
            );

            libraryPaths = libResult.paths;

            if (libResult.blocksCount > 0) {
                logger.info(`[EdsPipeline] Block library: ${libResult.blocksCount} blocks configured`);
                onProgress?.({
                    operation: 'block-library',
                    message: `Block library configured (${libResult.blocksCount} blocks)`,
                });
            }
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

            await helixService.purgeCacheAll(repoOwner, repoName, 'main');
            logger.info('[EdsPipeline] Stale cache purged');
        }

        // Step 5: Content Publish
        if (!skipPublish) {
            await pipelinePublishContent(
                helixService, repoOwner, repoName, daLiveOrg, daLiveSite, logger, onProgress,
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
                await bulkPreviewAndPublish(helixService, repoOwner, repoName, libraryPaths, logger);
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
