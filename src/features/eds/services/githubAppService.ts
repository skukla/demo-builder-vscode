/**
 * GitHub App Service
 *
 * Handles detection and installation URL generation for the AEM Code Sync GitHub App.
 * This app is required for Edge Delivery Services to sync code from GitHub repositories.
 *
 * Pattern: Uses same dependency injection as GitHubRepoOperations (takes GitHubTokenService).
 */

import type { GitHubTokenService } from './githubTokenService';
import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** Helix admin base URL for code sync checks */
const HELIX_ADMIN_BASE_URL = 'https://admin.hlx.page';

/** GitHub App installation URL - direct to GitHub's app installation flow */
const GITHUB_APP_INSTALL_URL = 'https://github.com/apps/aem-code-sync/installations/select_target';

/**
 * Describe a GitHub credential by its type prefix, never its value.
 *
 * GitHub credentials are self-identifying: `gho_` (OAuth app token, what
 * VS Code's GitHub provider normally issues), `ghu_` (GitHub App user token),
 * `ghp_` (classic PAT), `github_pat_` (fine-grained PAT). These are NOT
 * interchangeable against the AEM admin API's write-access check, so knowing
 * which kind we hold narrows a 401 considerably.
 *
 * Only the prefix is ever returned — the secret must not reach a log file that
 * users paste into tickets.
 */
export function describeTokenType(token: string): string {
    const match = /^(github_pat|gh[pousr])_/.exec(token);
    return match ? `${match[1]}_` : 'unrecognized';
}

/**
 * GitHub App Service for AEM Code Sync app detection and installation
 */
export class GitHubAppService {
    private logger: Logger;

    constructor(
        private tokenService: GitHubTokenService,
        logger?: Logger,
        /**
         * DA.live IMS token source. Optional so the headless and signed-out paths
         * keep working; see {@link GitHubAppService.tryAdminBearer}.
         */
        private daLiveTokenProvider?: { getAccessToken(): Promise<string | null | undefined> },
    ) {
        this.logger = logger ?? getLogger();
    }

    /**
     * The DA.live IMS Bearer as an `Authorization` header, or `{}` when there is
     * no DA.live session.
     *
     * Needed because writing ANY `access.admin` role on a site makes the
     * Configuration Service set `requireAuth: "auto"`, which closes the whole
     * admin API — `/status` included — to callers without an accepted admin
     * identity. The GitHub token is not one. Since storefront setup now pins an
     * admin at registration, every project the extension creates is protected,
     * and this check 401s on the next edit: "installed=false, codeStatus=none",
     * which the wizard shows as a permanent "Registering..." and the pipeline
     * turns into an aborted setup.
     *
     * Measured 2026-08-14 against `GET /status/skukla/demo-builder-test/main`:
     * 401 with the GitHub token alone, 200 with this Bearer attached, while an
     * unprotected site answered 200 either way.
     *
     * Deliberately swallows every failure. An unprotected site never needed the
     * Bearer, so a missing or broken DA.live session must not turn a working
     * check into a hard one — it degrades to exactly today's behaviour.
     */
    private async tryAdminBearer(): Promise<Record<string, string>> {
        try {
            const token = await this.daLiveTokenProvider?.getAccessToken();
            return token ? { Authorization: `Bearer ${token}` } : {};
        } catch {
            return {};
        }
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
    ): Promise<{
        isInstalled: boolean;
        codeStatus?: number;
        transient?: boolean;
        httpNotFound?: boolean;
        httpStatus?: number;
        helixError?: string;
        noCredential?: boolean;
    }> {
        const lenient = options?.lenient ?? false;
        this.logger.debug(
            `[GitHub App] Checking if app is installed on ${owner}/${repo} (lenient: ${lenient})`,
        );

        const token = await this.tokenService.getToken();
        if (!token) {
            this.logger.warn('[GitHub App] No token available for app installation check');
            // NOT "not installed" — we never asked. Holding no credential is not
            // evidence about the App, and the install flow cannot supply one.
            return { isInstalled: false, transient: true, noCredential: true };
        }

        this.logger.debug(
            `[GitHub App] Using ${describeTokenType(token.token)} credential for ${owner}/${repo}`,
        );

        try {
            const result = await this.checkHelixStatus(owner, repo, token.token, lenient);
            // Forward the FULL classification. `httpNotFound` is the only signal
            // meaning "Helix has never heard of this repo"; callers must not
            // re-derive it from `codeStatus === undefined`, which is equally true
            // of a 401/403/5xx and would report a rejected credential as a
            // missing GitHub App install.
            return {
                isInstalled: result.isInstalled,
                codeStatus: result.codeStatus,
                transient: result.transient,
                httpNotFound: result.httpNotFound,
                httpStatus: result.httpStatus,
                helixError: result.helixError,
            };
        } catch (error) {
            // Network errors, fetch aborts, JSON parse failures, and the like are
            // transient — the caller can decide whether to retry before treating
            // this as a definitive "App not installed" signal.
            this.logger.debug(
                `[GitHub App] Failed to check app installation: ${(error as Error).message}`,
            );
            return { isInstalled: false, transient: true };
        }
    }

    /**
     * Perform a single Helix admin status check.
     *
     * Classifies the result so the caller can distinguish a *definitive*
     * "App not installed" answer (HTTP 200 + code.status 404, or HTTP 404)
     * from a *transient* one (other HTTP errors, missing code.status field,
     * thrown fetch errors). Definitive answers should drive the install
     * dialog immediately; transient ones deserve a short retry — a flake on
     * the very first check shouldn't fail storefront setup with a misleading
     * "GitHub App installation required" prompt.
     */
    private async checkHelixStatus(
        owner: string,
        repo: string,
        token: string,
        lenient: boolean,
    ): Promise<{
        isInstalled: boolean;
        codeStatus?: number;
        httpNotFound?: boolean;
        transient?: boolean;
        httpStatus?: number;
        helixError?: string;
    }> {
        const statusUrl = `${HELIX_ADMIN_BASE_URL}/status/${owner}/${repo}/main?editUrl=auto`;

        const response = await fetch(statusUrl, {
            method: 'GET',
            headers: { ...(await this.tryAdminBearer()), 'x-auth-token': token },
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });

        if (!response.ok) {
            // Observed responses from admin.hlx.page (verified 2026-07-28):
            //   404 + `x-error: [admin] no such site` → Helix has never heard of
            //         the repo. Definitive; retrying won't change it.
            //   401 + `x-error: [admin] not authenticated` → Helix refused the
            //         credential. Says NOTHING about whether the App is installed.
            //   403 / 429 / 5xx / timeouts → transport failures.
            // Everything except the 404 is "undetermined", not "not installed".
            // The body is empty on 401/403; `x-error` carries the only stated
            // reason. helixService already reads this header for the same
            // purpose (see its 401/403 diagnostics).
            const helixError = response.headers?.get?.('x-error') ?? undefined;

            if (response.status === 404) {
                this.logger.debug(
                    `[GitHub App] Status endpoint returned HTTP 404 (Helix does not know this repo)` +
                        `${helixError ? ` — ${helixError}` : ''}`,
                );
                return { isInstalled: false, httpNotFound: true, httpStatus: 404, helixError };
            }
            this.logger.debug(
                `[GitHub App] Status endpoint returned transient HTTP ${response.status}` +
                    `${helixError ? ` — ${helixError}` : ''}`,
            );
            return { isInstalled: false, transient: true, httpStatus: response.status, helixError };
        }

        const data = await response.json();
        const codeStatus = data?.code?.status;

        this.logger.debug(`[GitHub App] Code status for ${owner}/${repo}: ${codeStatus}`);

        if (codeStatus === undefined) {
            // Response shape was unrecognized — don't conclude "not installed"
            // from an answer Helix didn't give. Flag transient so the caller retries.
            this.logger.info(
                `[GitHub App] Unable to determine app status for ${owner}/${repo} (no code.status in response)`,
            );
            return { isInstalled: false, transient: true };
        }

        let isInstalled: boolean;
        if (lenient) {
            isInstalled = codeStatus !== 404;
        } else {
            isInstalled = codeStatus === 200 || codeStatus === 400;
        }

        this.logger.debug(
            `[GitHub App] Code status for ${owner}/${repo}: ${codeStatus}, installed: ${isInstalled}`,
        );

        if (codeStatus === 404) {
            this.logger.info(
                `[GitHub App] AEM Code Sync app not installed for ${owner}/${repo} (code.status: 404)`,
            );
        } else if (codeStatus === 200) {
            this.logger.info(
                `[GitHub App] AEM Code Sync app installed and working for ${owner}/${repo}`,
            );
        } else if (codeStatus === 400) {
            // 400 is expected for repos where sync is initializing - log at trace level to reduce noise
            this.logger.trace(
                `[GitHub App] AEM Code Sync app sync initializing for ${owner}/${repo} (code.status: 400)`,
            );
        } else {
            // Truly unexpected status codes - keep at info level
            this.logger.info(
                `[GitHub App] AEM Code Sync app status unclear for ${owner}/${repo} (code.status: ${codeStatus})${lenient ? ' - accepting in lenient mode' : ''}`,
            );
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
