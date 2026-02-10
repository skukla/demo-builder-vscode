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
 * Reuses the same services as StorefrontSetupStep and EDS Reset:
 * - DaLiveContentOperations for content copy
 * - HelixService for CDN publishing
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

    // Publish content to CDN (preview + live)
    onProgress?.('Publishing storefront content...', 'Making content available on CDN');

    const { GitHubTokenService } = await import('@/features/eds/services/githubTokenService');
    const { DaLiveAuthService } = await import('@/features/eds/services/daLiveAuthService');
    const { HelixService } = await import('@/features/eds/services/helixService');

    const githubTokenService = new GitHubTokenService(deps.secrets, logger);
    const daLiveAuthService = new DaLiveAuthService(deps.extensionContext);
    const daLiveTokenProvider = {
        getAccessToken: async () => await daLiveAuthService.getAccessToken(),
    };
    const helixService = new HelixService(logger, githubTokenService, daLiveTokenProvider);

    await helixService.publishAllSiteContent(
        `${repoInfo.owner}/${repoInfo.repo}`,
        'main',
        config.daLiveOrg,
        config.daLiveSite,
    );

    logger.info('[EDS Content] Content published to CDN');
    return true;
}
