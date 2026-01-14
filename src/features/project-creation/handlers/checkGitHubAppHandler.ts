/**
 * GitHub App Check Handler
 *
 * Checks if the AEM Code Sync GitHub app is installed on a repository.
 * Used when user clicks "Check Installation" after installing the app.
 *
 * Uses lenient mode since this is a post-install verification - we trust
 * the user completed the installation and just need to confirm it's not 404.
 */

import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';

interface CheckGitHubAppRequest {
    owner: string;
    repo: string;
}

interface CheckGitHubAppResponse {
    success: boolean;
    isInstalled: boolean;
    installUrl?: string;
    error?: string;
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

        // Check if app is installed (lenient mode for post-install verification)
        // Lenient mode accepts any status except 404, since the user just completed installation
        const isInstalled = await githubAppService.isAppInstalled(request.owner, request.repo, { lenient: true });

        const response: CheckGitHubAppResponse = {
            success: true,
            isInstalled,
        };

        if (!isInstalled) {
            response.installUrl = githubAppService.getInstallUrl(request.owner, request.repo);
        }

        context.logger.debug(`[GitHub App Check] ${request.owner}/${request.repo}: installed=${isInstalled}`);

        return { success: true, data: response };
    } catch (error) {
        context.logger.error('[GitHub App Check] Failed', error as Error);
        
        const response: CheckGitHubAppResponse = {
            success: false,
            isInstalled: false,
            error: (error as Error).message,
        };

        return { success: true, data: response };
    }
}
