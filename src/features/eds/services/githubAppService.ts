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

/** Helix admin base URL for GitHub app installation */
const HELIX_ADMIN_BASE_URL = 'https://admin.hlx.page';

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
     * Uses the GitHub API to check for app installation. The API returns 200 if
     * an app is installed, 404 if not.
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
     * This URL takes the user to the Helix admin page where they can
     * install the app on their repository.
     *
     * @param owner - Repository owner (user or organization)
     * @param repo - Repository name
     * @returns Installation URL
     */
    getInstallUrl(owner: string, repo: string): string {
        return `${HELIX_ADMIN_BASE_URL}/github/install/${owner}/${repo}`;
    }
}
