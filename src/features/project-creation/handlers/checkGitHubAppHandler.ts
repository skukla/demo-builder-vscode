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
 */

import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';

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
    /** Index signature for HandlerResponse compatibility */
    [key: string]: unknown;
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
        const result = await githubAppService.isAppInstalled(request.owner, request.repo, { lenient });

        const response: CheckGitHubAppResponse = {
            success: true,
            isInstalled: result.isInstalled,
            codeStatus: result.codeStatus,
        };

        if (!result.isInstalled) {
            response.installUrl = githubAppService.getInstallUrl(request.owner, request.repo);
        }

        context.logger.debug(`[GitHub App Check] ${request.owner}/${request.repo}: installed=${result.isInstalled}, codeStatus=${result.codeStatus}`);

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
