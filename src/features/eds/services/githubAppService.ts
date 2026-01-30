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
            const result = await this.checkHelixStatus(owner, repo, token.token, lenient);
            return { isInstalled: result.isInstalled, codeStatus: result.codeStatus };
        } catch (error) {
            this.logger.debug(`[GitHub App] Failed to check app installation: ${(error as Error).message}`);
            return { isInstalled: false };
        }
    }

    /**
     * Perform a single Helix admin status check.
     * Returns httpNotFound=true when the HTTP response itself is 404
     * (distinct from code.status 404 inside a 200 response).
     */
    private async checkHelixStatus(
        owner: string,
        repo: string,
        token: string,
        lenient: boolean,
    ): Promise<{ isInstalled: boolean; codeStatus?: number; httpNotFound?: boolean }> {
        const statusUrl = `${HELIX_ADMIN_BASE_URL}/status/${owner}/${repo}/main?editUrl=auto`;

        const response = await fetch(statusUrl, {
            method: 'GET',
            headers: { 'x-auth-token': token },
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });

        if (!response.ok) {
            this.logger.debug(`[GitHub App] Status endpoint returned HTTP ${response.status}`);
            return { isInstalled: false, httpNotFound: response.status === 404 };
        }

        const data = await response.json();
        const codeStatus = data?.code?.status;

        this.logger.debug(`[GitHub App] Code status for ${owner}/${repo}: ${codeStatus}`);

        if (codeStatus === undefined) {
            this.logger.info(`[GitHub App] Unable to determine app status for ${owner}/${repo} (no code.status in response)`);
            return { isInstalled: false };
        }

        let isInstalled: boolean;
        if (lenient) {
            isInstalled = codeStatus !== 404;
        } else {
            isInstalled = codeStatus === 200 || codeStatus === 400;
        }

        this.logger.debug(`[GitHub App] Code status for ${owner}/${repo}: ${codeStatus}, installed: ${isInstalled}`);

        if (codeStatus === 404) {
            this.logger.info(`[GitHub App] AEM Code Sync app not installed for ${owner}/${repo} (code.status: 404)`);
        } else if (codeStatus === 200) {
            this.logger.info(`[GitHub App] AEM Code Sync app installed and working for ${owner}/${repo}`);
        } else if (codeStatus === 400) {
            // 400 is expected for repos where sync is initializing - log at trace level to reduce noise
            this.logger.trace(`[GitHub App] AEM Code Sync app sync initializing for ${owner}/${repo} (code.status: 400)`);
        } else {
            // Truly unexpected status codes - keep at info level
            this.logger.info(`[GitHub App] AEM Code Sync app status unclear for ${owner}/${repo} (code.status: ${codeStatus})${lenient ? ' - accepting in lenient mode' : ''}`);
        }

        return { isInstalled, codeStatus };
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
