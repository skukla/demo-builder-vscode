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
     * Result of checking GitHub App installation status
     *
     * code.status values:
     * - 200: App installed and code sync working
     * - 400: App installed, sync initializing or config issues (still counts as installed)
     * - 404: App not installed
     */
    public static readonly STATUS_MEANINGS: Record<number, string> = {
        200: 'App installed and working',
        400: 'App installed, sync initializing',
        404: 'App not installed',
    };

    /**
     * Check if the AEM Code Sync GitHub app is installed on a repository.
     *
     * Uses the Helix admin status endpoint to check if code sync is working.
     * The HTTP response may be 200, but the internal code.status field indicates
     * whether the app is actually syncing code (200 = working, 400 = initializing, 404 = not installed).
     *
     * Two modes:
     * - Strict (default): Accepts 200 or 400 (app installed, possibly still initializing)
     * - Lenient: Accepts any status except 404 (for post-install verification)
     *
     * @param owner - Repository owner (user or organization)
     * @param repo - Repository name
     * @param options - Optional configuration
     * @param options.lenient - If true, accept non-404 status as installed (for post-install check)
     * @returns Object with isInstalled boolean and the actual codeStatus for debugging
     */
    async isAppInstalled(
        owner: string,
        repo: string,
        options?: { lenient?: boolean },
    ): Promise<{ isInstalled: boolean; codeStatus?: number }> {
        const lenient = options?.lenient ?? false;
        this.logger.debug(`[GitHub App] Checking if app is installed on ${owner}/${repo} (lenient: ${lenient})`);

        const token = await this.tokenService.getToken();
        if (!token) {
            this.logger.warn('[GitHub App] No token available for app installation check');
            return { isInstalled: false };
        }

        try {
            // Use the status endpoint to check if code sync is working
            // The status endpoint returns detailed information including internal code status
            const statusUrl = `${HELIX_ADMIN_BASE_URL}/status/${owner}/${repo}/main?editUrl=auto`;

            const response = await fetch(statusUrl, {
                method: 'GET',
                headers: {
                    'x-auth-token': token.token,
                },
                signal: AbortSignal.timeout(TIMEOUTS.POLL.INTERVAL),
            });

            if (!response.ok) {
                this.logger.debug(`[GitHub App] Status endpoint returned HTTP ${response.status}`);
                return { isInstalled: false };
            }

            // Parse the JSON response to check the internal code status
            const data = await response.json();

            // The code.status field indicates whether code sync is actually working:
            // - 200: Code sync is working (app installed and syncing)
            // - 400: App may be installed but sync initializing or has config issues
            // - 404: Code not found (app definitely not installed)
            // - undefined: Unknown state (can't confirm installation)
            const codeStatus = data?.code?.status;

            this.logger.debug(`[GitHub App] Code status for ${owner}/${repo}: ${codeStatus}`);

            // Handle undefined - unknown state, can't confirm installation
            if (codeStatus === undefined) {
                this.logger.info(`[GitHub App] Unable to determine app status for ${owner}/${repo} (no code.status in response)`);
                return { isInstalled: false };
            }

            // Determine if installed based on mode
            let isInstalled: boolean;
            if (lenient) {
                // Lenient mode: Accept any status except 404
                // Used after user explicitly installs the app
                isInstalled = codeStatus !== 404;
            } else {
                // Strict mode: Accept 200 (working) or 400 (initializing)
                // Both indicate the app is installed; 400 just means sync is still starting
                isInstalled = codeStatus === 200 || codeStatus === 400;
            }

            this.logger.debug(`[GitHub App] Code status for ${owner}/${repo}: ${codeStatus}, installed: ${isInstalled}`);

            if (codeStatus === 404) {
                this.logger.info(`[GitHub App] AEM Code Sync app not installed for ${owner}/${repo} (code.status: 404)`);
            } else if (codeStatus === 200) {
                this.logger.info(`[GitHub App] AEM Code Sync app installed and working for ${owner}/${repo}`);
            } else {
                this.logger.info(`[GitHub App] AEM Code Sync app status unclear for ${owner}/${repo} (code.status: ${codeStatus})${lenient ? ' - accepting in lenient mode' : ''}`);
            }

            return { isInstalled, codeStatus };
        } catch (error) {
            this.logger.debug(`[GitHub App] Failed to check app installation: ${(error as Error).message}`);
            return { isInstalled: false };
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
