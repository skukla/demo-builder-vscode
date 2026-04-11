/**
 * Storefront Setup Phase Helpers
 *
 * Shared helper functions used across storefront setup phases.
 * Functions land here when they are needed by multiple phase files
 * and placing them in any single phase would create a reverse or
 * circular import (e.g., Phase 2 importing from Phase 3).
 *
 * @module features/eds/handlers/storefrontSetupPhaseHelpers
 */

import type { HandlerContext } from '@/types/handlers';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';

/**
 * Check GitHub App installation for existing repos. Returns early result if not installed.
 */
export async function checkGitHubAppForExistingRepo(
    context: HandlerContext,
    services: SetupServices,
    repoInfo: RepoInfo,
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    const { githubAppService } = services;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'storefront-code', message: 'Verifying GitHub App installation...', progress: 28,
    });

    logger.info(`[Storefront Setup] Checking GitHub App for existing repo: ${repoInfo.repoOwner}/${repoInfo.repoName}`);
    const { isInstalled, codeStatus } = await githubAppService.isAppInstalled(repoInfo.repoOwner, repoInfo.repoName);

    if (!isInstalled) {
        const installUrl = githubAppService.getInstallUrl(repoInfo.repoOwner, repoInfo.repoName);
        logger.info(`[Storefront Setup] GitHub App not installed. Install URL: ${installUrl}`);

        await context.sendMessage('storefront-setup-github-app-required', {
            owner: repoInfo.repoOwner, repo: repoInfo.repoName, installUrl,
            message: 'The AEM Code Sync GitHub App must be installed to continue.',
        });

        return { success: false, error: 'GitHub App installation required', ...repoInfo };
    }

    logger.info(`[Storefront Setup] GitHub App verified for existing repo (code.status: ${codeStatus})`);
    return null;
}
