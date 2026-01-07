/**
 * GitHub App Service
 *
 * Handles detection and installation URL generation for the AEM Code Sync GitHub App.
 * This app is required for Edge Delivery Services to sync code from GitHub repositories.
 *
 * Pattern: Uses same dependency injection as GitHubRepoOperations (takes GitHubTokenService).
 */

import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import type { GitHubTokenService } from './githubTokenService';

/** Helix admin base URL for code sync checks */
const HELIX_ADMIN_BASE_URL = 'https://admin.hlx.page';

/** GitHub App installation URL - direct to GitHub's app installation flow */
const GITHUB_APP_INSTALL_URL = 'https://github.com/apps/aem-code-sync/installations/select_target';

/**
 * GitHub App Service for AEM Code Sync app detection and installation
 */
export class GitHubAppService {
    private logger: Logger;

    constructor(
        private tokenService: GitHubTokenService,
        logger?: Logger,
    ) {
        this.logger = logger ?? getLogger();
    }

    /**
     * Check if the AEM Code Sync GitHub app is installed on a repository.
     *
     * Uses the Helix admin code endpoint to check if code sync is working.
     * If the endpoint is accessible, the app is installed.
     *
     * @param owner - Repository owner (user or organization)
     * @param repo - Repository name
     * @returns True if app is installed, false otherwise
     */
    async isAppInstalled(owner: string, repo: string): Promise<boolean> {
        this.logger.debug(`[GitHub App] Checking if app is installed on ${owner}/${repo}`);

        const token = await this.tokenService.getToken();
        if (!token) {
            this.logger.warn('[GitHub App] No token available for app installation check');
            return false;
        }

        try {
            // Check if code sync is working by hitting the Helix admin code endpoint
            // If code sync is working, the app is installed
            const codeUrl = `${HELIX_ADMIN_BASE_URL}/code/${owner}/${repo}/main/scripts/aem.js`;

            const response = await fetch(codeUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(TIMEOUTS.POLL.INTERVAL),
            });

            const isInstalled = response.ok;
            this.logger.debug(`[GitHub App] App installed on ${owner}/${repo}: ${isInstalled}`);
            return isInstalled;
        } catch (error) {
            this.logger.debug(`[GitHub App] Failed to check app installation: ${(error as Error).message}`);
            return false;
        }
    }

    /**
     * Generate the installation URL for the AEM Code Sync GitHub app.
     *
     * Returns the GitHub app installation page where users can select
     * which repositories to grant the app access to. This uses GitHub's
     * native app installation flow (same as storefront-tools).
     *
     * @param _owner - Repository owner (not used, kept for API compatibility)
     * @param _repo - Repository name (not used, kept for API compatibility)
     * @returns Installation URL
     */
    getInstallUrl(_owner: string, _repo: string): string {
        // Use GitHub's native app installation flow
        // Users will select the target repository on GitHub's UI
        return GITHUB_APP_INSTALL_URL;
    }
}
