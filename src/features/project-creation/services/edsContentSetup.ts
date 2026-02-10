/**
 * EDS Content Setup Service
 *
 * Ensures DA.live content (placeholders, enrichment, pages) exists and is
 * published to the CDN after project creation or import.
 *
 * During import, the StorefrontSetupStep is skipped (preflightComplete=true
 * from the export file), so DA.live content may not exist. This service
 * verifies content availability and copies from the template source if missing.
 *
 * Reuses the same services and helpers as StorefrontSetupStep and EDS Reset:
 * - DaLiveContentOperations for content copy and block library
 * - HelixService for cache purge and CDN publishing
 * - configureDaLivePermissions / applyDaLiveOrgConfigSettings from edsHelpers
 */

import { parseGitHubUrl } from '@/core/utils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

interface EdsContentConfig {
    repoUrl: string;
    daLiveOrg: string;
    daLiveSite: string;
    contentSource: {
        org: string;
        site: string;
        indexPath?: string;
    };
    contentPatches?: string[];
    contentPatchSource?: {
        owner: string;
        repo: string;
        path: string;
    };
    templateOwner?: string;
    templateRepo?: string;
}

interface EdsContentDeps {
    logger: Logger;
    secrets: import('vscode').SecretStorage;
    authManager?: { getTokenManager(): { getAccessToken(): Promise<string | undefined> } } | null;
    extensionContext: import('vscode').ExtensionContext;
}

/**
 * Verify that DA.live content exists and is published to the CDN.
 * Populates from the template source if missing.
 *
 * Checks the DA.live source API directly (not the CDN) because:
 * - The preview CDN returns 404 for recently-published content due to edge caching
 * - HelixService excludes placeholders from publishing, so CDN checks for
 *   common resources like /placeholders.json always fail
 *
 * @returns true if content was copied, false if it already existed
 */
export async function ensureEdsContent(
    config: EdsContentConfig,
    deps: EdsContentDeps,
    onProgress?: (message: string, subMessage?: string) => void,
): Promise<boolean> {
    const { logger } = deps;

    const repoInfo = parseGitHubUrl(config.repoUrl);
    if (!repoInfo) {
        logger.warn('[EDS Content] Could not parse repo URL, skipping content verification');
        return false;
    }

    // Quick check: does content already exist in DA.live?
    // Check DA.live source API directly — it's the source of truth and avoids CDN caching issues.
    const token = await deps.authManager?.getTokenManager().getAccessToken();
    const checkUrl = `https://admin.da.live/source/${config.daLiveOrg}/${config.daLiveSite}/index.html`;
    logger.debug(`[EDS Content] Checking DA.live: ${checkUrl}`);

    try {
        const response = await fetch(checkUrl, {
            method: 'HEAD',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: AbortSignal.timeout(TIMEOUTS.QUICK),
        });
        logger.debug(`[EDS Content] DA.live check response: ${response.status}`);
        if (response.ok) {
            logger.debug('[EDS Content] Content already exists in DA.live, skipping copy');
            return false;
        }
    } catch (error) {
        logger.debug(`[EDS Content] DA.live check failed: ${(error as Error).message}`);
    }

    logger.info('[EDS Content] Content not found in DA.live, copying from template source...');
    onProgress?.('Setting up storefront content...', 'Copying content from template');

    // Copy content from template source
    const { DaLiveContentOperations, createDaLiveTokenProvider } = await import(
        '@/features/eds/services/daLiveContentOperations'
    );
    const tokenProvider = createDaLiveTokenProvider(deps.authManager);
    const daLiveContentOps = new DaLiveContentOperations(tokenProvider, logger);

    const contentSource = config.contentSource;
    const indexPath = contentSource.indexPath || '/full-index.json';

    const contentResult = await daLiveContentOps.copyContentFromSource(
        {
            org: contentSource.org,
            site: contentSource.site,
            indexUrl: `https://main--${contentSource.site}--${contentSource.org}.aem.live${indexPath}`,
        },
        config.daLiveOrg,
        config.daLiveSite,
        (progress) => {
            const msg = progress.message || `Copying content (${progress.processed}/${progress.total})`;
            onProgress?.('Setting up storefront content...', msg);
        },
        config.contentPatches,
        config.contentPatchSource,
    );

    if (!contentResult.success) {
        logger.warn(`[EDS Content] Content copy had failures: ${contentResult.failedFiles.length} files failed`);
    } else {
        logger.info(`[EDS Content] Content copied: ${contentResult.totalFiles} files`);
    }

    // Service dependencies shared by remaining operations
    const { GitHubTokenService } = await import('@/features/eds/services/githubTokenService');
    const { DaLiveAuthService } = await import('@/features/eds/services/daLiveAuthService');
    const { HelixService } = await import('@/features/eds/services/helixService');
    const { configureDaLivePermissions, applyDaLiveOrgConfigSettings, bulkPreviewAndPublish } =
        await import('@/features/eds/handlers/edsHelpers');

    const githubTokenService = new GitHubTokenService(deps.secrets, logger);
    const daLiveAuthService = new DaLiveAuthService(deps.extensionContext);
    const daLiveTokenProvider = {
        getAccessToken: async () => await daLiveAuthService.getAccessToken(),
    };
    const helixService = new HelixService(logger, githubTokenService, daLiveTokenProvider);

    // DA.live permissions (non-fatal)
    onProgress?.('Configuring site permissions...', 'Granting DA.live access');
    try {
        const userEmail = await daLiveAuthService.getUserEmail();
        if (userEmail) {
            await configureDaLivePermissions(tokenProvider, config.daLiveOrg, config.daLiveSite, userEmail, logger);
        } else {
            logger.warn('[EDS Content] No user email available for permissions');
        }
    } catch (error) {
        logger.warn(`[EDS Content] Permissions setup failed: ${(error as Error).message}`);
    }

    // Block library from template (non-fatal, skip if no template info)
    let libraryPaths: string[] = [];
    if (config.templateOwner && config.templateRepo) {
        onProgress?.('Configuring block library...', 'Setting up block library from template');
        try {
            const { GitHubFileOperations } = await import('@/features/eds/services/githubFileOperations');
            const githubFileOps = new GitHubFileOperations(githubTokenService, logger);
            const libResult = await daLiveContentOps.createBlockLibraryFromTemplate(
                config.daLiveOrg,
                config.daLiveSite,
                config.templateOwner,
                config.templateRepo,
                (owner, repo, path) => githubFileOps.getFileContent(owner, repo, path),
            );
            if (libResult.blocksCount > 0) {
                logger.info(`[EDS Content] Block library: ${libResult.blocksCount} blocks configured`);
                libraryPaths = libResult.paths;
            }
        } catch (error) {
            logger.warn(`[EDS Content] Block library setup failed: ${(error as Error).message}`);
        }
    }

    // EDS settings — AEM Assets / Universal Editor (non-fatal)
    onProgress?.('Applying EDS settings...', 'Configuring AEM Assets and Universal Editor');
    try {
        await applyDaLiveOrgConfigSettings(daLiveContentOps, config.daLiveOrg, config.daLiveSite, logger);
    } catch (error) {
        logger.warn(`[EDS Content] EDS settings failed: ${(error as Error).message}`);
    }

    // Cache purge before publishing (non-fatal)
    onProgress?.('Publishing storefront content...', 'Purging stale cache');
    try {
        await helixService.purgeCacheAll(repoInfo.owner, repoInfo.repo, 'main');
    } catch (error) {
        logger.warn(`[EDS Content] Cache purge failed: ${(error as Error).message}`);
    }

    // Publish content to CDN (preview + live)
    onProgress?.('Publishing storefront content...', 'Making content available on CDN');

    await helixService.publishAllSiteContent(
        `${repoInfo.owner}/${repoInfo.repo}`,
        'main',
        config.daLiveOrg,
        config.daLiveSite,
    );

    // Publish block library paths (non-fatal, may be missed by publishAllSiteContent)
    if (libraryPaths.length > 0) {
        try {
            await bulkPreviewAndPublish(helixService, repoInfo.owner, repoInfo.repo, libraryPaths, logger);
        } catch (error) {
            logger.warn(`[EDS Content] Block library publish failed: ${(error as Error).message}`);
        }
    }

    logger.info('[EDS Content] Content published to CDN');
    return true;
}
