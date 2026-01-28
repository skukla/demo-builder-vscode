/**
 * GitHub App Check Handler
 *
 * Checks if the AEM Code Sync GitHub app is installed on a repository.
 *
 * Two modes:
 * - Strict (default): Accepts code.status 200 or 400 (app installed, possibly initializing)
 *   Used for initial detection when selecting a repository.
 * - Lenient: Accepts any status except 404 (for post-install verification)
 *   Used when user clicks "Check Again" after installing the app.
 *
 * Automatic Code Sync:
 * When Helix returns HTTP 404 (repo not indexed yet), the handler automatically:
 * 1. Triggers code sync via POST /code/{owner}/{repo}/main/*
 * 2. Polls for sync completion (up to 50 seconds)
 * 3. Retries the status check
 * This handles the case where the GitHub app is installed but Helix hasn't indexed yet.
 */

import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { HelixService } from '@/features/eds/services/helixService';
import { PollingService } from '@/core/shell/pollingService';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

interface CheckGitHubAppRequest {
    owner: string;
    repo: string;
    /** If true, use lenient mode (accept non-404). Default: false (strict mode). */
    lenient?: boolean;
}

interface CheckGitHubAppResponse {
    success: boolean;
    isInstalled: boolean;
    /** The actual code.status from the Helix admin endpoint (200, 400, 404, etc.) */
    codeStatus?: number;
    installUrl?: string;
    error?: string;
    /** Whether automatic code sync was triggered */
    codeSyncTriggered?: boolean;
    /** Index signature for HandlerResponse compatibility */
    [key: string]: unknown;
}

/**
 * Trigger Helix code sync and wait for completion.
 *
 * When Helix returns HTTP 404, it means the repo hasn't been indexed yet.
 * This function triggers the indexing by POSTing to the code endpoint,
 * then polls to verify the sync completed using PollingService.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param tokenService - GitHub token service for authentication
 * @param logger - Logger instance
 * @returns True if code sync completed successfully
 */
async function triggerAndWaitForCodeSync(
    owner: string,
    repo: string,
    tokenService: import('@/features/eds/services/githubTokenService').GitHubTokenService,
    logger: import('@/types/logger').Logger,
): Promise<boolean> {
    logger.info(`[GitHub App Check] Triggering code sync for ${owner}/${repo}`);

    // Create HelixService with only GitHub token (no DA.live token needed for code sync)
    const helixService = new HelixService(logger, tokenService);

    try {
        // Trigger code sync: POST /code/{owner}/{repo}/main/*
        await helixService.previewCode(owner, repo, '/*');
        logger.debug(`[GitHub App Check] Code sync triggered, polling for completion...`);
    } catch (error) {
        logger.warn(`[GitHub App Check] Failed to trigger code sync: ${(error as Error).message}`);
        return false;
    }

    // Poll for sync completion using existing PollingService
    // Verifies scripts/aem.js is accessible (exists in all EDS repos)
    const verifyUrl = `https://main--${repo}--${owner}.aem.page/scripts/aem.js`;
    const pollingService = new PollingService();

    try {
        await pollingService.pollUntilCondition(
            async () => {
                const response = await fetch(verifyUrl, {
                    method: 'HEAD',
                    signal: AbortSignal.timeout(TIMEOUTS.QUICK),
                });
                return response.ok;
            },
            {
                name: 'code-sync',
                initialDelay: TIMEOUTS.EDS_CODE_SYNC_POLL,
                maxDelay: TIMEOUTS.EDS_CODE_SYNC_POLL,
                backoffFactor: 1, // No backoff - consistent interval for code sync
                timeout: TIMEOUTS.LONG, // 3 minutes max
                maxAttempts: 30,
            },
        );
        logger.info(`[GitHub App Check] Code sync completed`);
        return true;
    } catch (error) {
        logger.warn(`[GitHub App Check] Code sync polling failed: ${(error as Error).message}`);
        return false;
    }
}

export async function checkGitHubApp(
    context: HandlerContext,
    data: unknown,
): Promise<HandlerResponse> {
    const request = data as CheckGitHubAppRequest;
    
    context.logger.info(`[GitHub App Check] Checking ${request.owner}/${request.repo}`);

    try {
        // Get properly initialized GitHub services
        const { tokenService } = getGitHubServices(context);

        // Lazy-load GitHubAppService
        const { GitHubAppService } = await import('@/features/eds/services/githubAppService');
        const githubAppService = new GitHubAppService(tokenService);

        // Check if app is installed
        // - Strict mode (default): Requires code.status === 200
        // - Lenient mode: Accepts any status except 404 (for post-install verification)
        const lenient = request.lenient ?? false;
        let result = await githubAppService.isAppInstalled(request.owner, request.repo, { lenient });

        let codeSyncTriggered = false;

        // Detect HTTP 404 (repo not indexed by Helix yet)
        // This is indicated by isInstalled=false with undefined codeStatus
        // (When code.status 404 is in the response body, codeStatus would be defined as 404)
        const isHttpNotFound = !result.isInstalled && result.codeStatus === undefined;

        if (isHttpNotFound) {
            context.logger.info(`[GitHub App Check] HTTP 404 detected - repo not indexed yet, triggering code sync`);

            // Trigger code sync and wait for it to complete
            const syncSucceeded = await triggerAndWaitForCodeSync(
                request.owner,
                request.repo,
                tokenService,
                context.logger,
            );
            codeSyncTriggered = true;

            if (syncSucceeded) {
                // Retry the status check after successful code sync
                context.logger.debug(`[GitHub App Check] Retrying status check after code sync`);
                result = await githubAppService.isAppInstalled(request.owner, request.repo, { lenient });
            }
        }

        const response: CheckGitHubAppResponse = {
            success: true,
            isInstalled: result.isInstalled,
            codeStatus: result.codeStatus,
            codeSyncTriggered,
        };

        if (!result.isInstalled) {
            response.installUrl = githubAppService.getInstallUrl(request.owner, request.repo);
        }

        context.logger.debug(`[GitHub App Check] ${request.owner}/${request.repo}: installed=${result.isInstalled}, codeStatus=${result.codeStatus}, codeSyncTriggered=${codeSyncTriggered}`);

        // Return response directly (not wrapped in { data }) so UI can access fields directly
        return response;
    } catch (error) {
        context.logger.error('[GitHub App Check] Failed', error as Error);

        // Return error response directly
        return {
            success: false,
            isInstalled: false,
            error: (error as Error).message,
        };
    }
}
