/**
 * Configuration Service Client
 *
 * Wraps the AEM Configuration Service API (admin.hlx.page/config/) for
 * site registration, update, and deletion. Supports optional BYOM content
 * overlay registration alongside the DA.live content source.
 *
 * The Configuration Service manages server-side site configuration in Helix 5.
 *
 * Authentication: Uses Adobe IMS token via Authorization Bearer header.
 * The IMS token is obtained from the DA.live auth flow (same token used
 * for DA.live content operations). The user must have admin role on the
 * org, which is auto-assigned when they install the AEM Code Sync GitHub App.
 *
 * Note: folder mapping (`POST /folders.json`) is deprecated by Adobe
 * (see aem.live/developer/byom) and removed from this client in audit A2
 * (2026-05-18). CitiSignal storefronts route /products/{sku} via client-side
 * routing; future SEO-sensitive PDPs should use the BYOM overlay pattern.
 *
 * @module features/eds/services/configurationService
 */

import type { TokenProvider } from './daLiveContentOperations';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

// ==========================================================
// Constants
// ==========================================================

/** AEM Admin API base URL (same host as preview/publish) */
const ADMIN_API_URL = 'https://admin.hlx.page';

// ==========================================================
// Types
// ==========================================================

/**
 * Parameters for site registration with the Configuration Service
 */
export interface SiteRegistrationParams {
    /** DA.live org name — used as the Configuration Service lookup key (URL path) */
    org: string;
    /** Site name in the Configuration Service */
    site: string;
    /** GitHub repository owner */
    codeOwner: string;
    /** GitHub repository name */
    codeRepo: string;
    /** DA.live content source URL (e.g., https://content.da.live/org/site/) */
    contentSourceUrl: string;
    /** Content source type (default: 'markup') */
    contentSourceType?: string;
    /** Optional BYOM content overlay URL. When set, the registration body
     *  includes a `content.overlay` block alongside `content.source`. */
    contentOverlayUrl?: string;
}

/**
 * Strip query string and fragment from a URL before logging.
 *
 * The BYOM overlay URL is user-supplied via the `demoBuilder.byom.overlayUrl`
 * setting; pasted values may include a secret in the query string (e.g., a
 * tokenized URL). Logging the bare scheme + host + path keeps debug output
 * useful for ops without echoing potential secrets to the Debug channel.
 */
function stripUrlQueryAndFragment(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
        return '[unparseable URL]';
    }
}

/** Build the DA.live content source URL for a given org and site */
function buildContentSourceUrl(daLiveOrg: string, daLiveSite: string): string {
    return `https://content.da.live/${daLiveOrg}/${daLiveSite}/`;
}

/** Build site config params from repo and DA.live identifiers */
export function buildSiteConfigParams(
    repoOwner: string, repoName: string, daLiveOrg: string, daLiveSite: string,
    overlayUrl?: string,
): SiteRegistrationParams {
    // The Config Service lookup key must use the GitHub owner/repo, not the
    // DA.live org/site. Helix's preview/publish/live operations issue requests
    // to /preview/{owner}/{repo}/main/... and look up the site config at
    // /config/{owner}/sites/{repo}.json. Registering under the DA.live name
    // (e.g. /sites/b2b-boilerplate-content.json when the repo is
    // skukla/b2b-boilerplate) leaves the config invisible to those operations
    // — every preview/publish silently fails because Helix has no content
    // source mapping for the lookup key it actually checks.
    //
    // contentSourceUrl still points at DA.live — that's where content lives.
    // The DA.live editor reads its own config from DA.live's service, not
    // from Helix's site config, so this rename does not affect the editor.
    return {
        org: repoOwner, site: repoName,
        codeOwner: repoOwner, codeRepo: repoName,
        contentSourceUrl: buildContentSourceUrl(daLiveOrg, daLiveSite),
        ...(overlayUrl && { contentOverlayUrl: overlayUrl }),
    };
}

/**
 * Result of a Configuration Service operation
 */
export interface ConfigServiceResult {
    success: boolean;
    error?: string;
    /** HTTP status code from the API */
    statusCode?: number;
}

// ==========================================================
// Service
// ==========================================================

/**
 * Client for the AEM Configuration Service API
 *
 * Manages site configuration through REST calls to admin.hlx.page/config/.
 * Uses Adobe IMS Bearer token authentication (same token as DA.live operations).
 */
export class ConfigurationService {
    private logger: Logger;
    private tokenProvider: TokenProvider;

    constructor(tokenProvider: TokenProvider, logger: Logger) {
        this.tokenProvider = tokenProvider;
        this.logger = logger;
    }

    // ==========================================================
    // Site Registration
    // ==========================================================

    /**
     * Register a site with the Configuration Service.
     *
     * Creates the site config entry at /config/{org}/sites/{site}.json
     * with code source (GitHub repo) and content source (DA.live).
     *
     * This must be called AFTER the AEM Code Sync GitHub App is installed,
     * because the installing user gets auto-assigned the admin role.
     *
     * @param params - Site registration parameters
     * @returns Result with success/error status
     */
    async registerSite(params: SiteRegistrationParams): Promise<ConfigServiceResult> {
        const { org, site, codeOwner, codeRepo, contentSourceUrl, contentSourceType, contentOverlayUrl } = params;
        const url = `${ADMIN_API_URL}/config/${encodeURIComponent(org)}/sites/${encodeURIComponent(site)}.json`;

        this.logger.info(`[ConfigService] Registering site: ${org}/${site}`);
        this.logger.debug(`[ConfigService] Code: ${codeOwner}/${codeRepo}, Content: ${contentSourceUrl}`);
        if (contentOverlayUrl) {
            // Strip query/fragment from the overlay URL before logging — the
            // overlay URL is user-supplied via VS Code settings and may include
            // a secret in its query string (e.g., a paste with a token).
            this.logger.debug(`[ConfigService] Content overlay: ${stripUrlQueryAndFragment(contentOverlayUrl)}`);
        }

        const source = { url: contentSourceUrl, type: contentSourceType || 'markup' };
        const body = {
            version: 1,
            code: { owner: codeOwner, repo: codeRepo },
            content: contentOverlayUrl
                ? { source, overlay: { url: contentOverlayUrl, type: 'markup' } }
                : { source },
        };

        return this.makeRequest('PUT', url, body);
    }

    // ==========================================================
    // Site Update
    // ==========================================================

    /**
     * Update an existing site's configuration.
     *
     * Deletes the current config and re-registers with the provided values.
     * Handles the case where the config was auto-created by the GitHub App
     * with stale content source (e.g., from the template's fstab.yaml).
     *
     * @param params - Site registration parameters with correct values
     * @returns Result with success/error status
     */
    async updateSiteConfig(params: SiteRegistrationParams): Promise<ConfigServiceResult> {
        const { org, site } = params;
        this.logger.info(`[ConfigService] Updating site config: ${org}/${site}`);

        const deleteResult = await this.deleteSiteConfig(org, site);
        if (!deleteResult.success && deleteResult.statusCode !== 404) {
            this.logger.error(`[ConfigService] Failed to clear existing config: ${deleteResult.error}`);
            return { success: false, error: `Failed to clear existing config: ${deleteResult.error}` };
        }
        if (deleteResult.statusCode === 404) {
            this.logger.warn(`[ConfigService] Site config already absent during update (404) — re-registering`);
        }

        return this.registerSite(params);
    }

    // ==========================================================
    // Site Deletion
    // ==========================================================

    /**
     * Delete a site's configuration from the Configuration Service.
     *
     * Removes the entire site config entry. Should be called during
     * project cleanup, before deleting the GitHub repo.
     *
     * @param org - DA.live org name (Configuration Service lookup key)
     * @param site - DA.live site name
     * @returns Result with success/error status
     */
    async deleteSiteConfig(org: string, site: string): Promise<ConfigServiceResult> {
        const url = `${ADMIN_API_URL}/config/${encodeURIComponent(org)}/sites/${encodeURIComponent(site)}.json`;

        this.logger.info(`[ConfigService] Deleting site config: ${org}/${site}`);

        return this.makeRequest('DELETE', url);
    }

    // ==========================================================
    // Private Helpers
    // ==========================================================

    /**
     * Make an authenticated request to the Configuration Service API
     */
    private async makeRequest(
        method: string,
        url: string,
        body?: Record<string, unknown>,
    ): Promise<ConfigServiceResult> {
        try {
            const token = await this.getImsToken();

            const headers: Record<string, string> = {
                Authorization: `Bearer ${token}`,
            };

            const fetchOptions: RequestInit = {
                method,
                headers,
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            };

            if (body) {
                headers['content-type'] = 'application/json';
                fetchOptions.body = JSON.stringify(body);
            }

            const response = await fetch(url, fetchOptions);

            if (response.ok) {
                this.logger.debug(`[ConfigService] ${method} ${url} -> ${response.status} OK`);
                return { success: true, statusCode: response.status };
            }

            // 404 on DELETE means already gone — treat as success
            if (method === 'DELETE' && response.status === 404) {
                this.logger.debug(`[ConfigService] Site config already deleted (404)`);
                return { success: true, statusCode: 404 };
            }

            return await this.handleErrorResponse(method, url, response);
        } catch (error) {
            const message = (error as Error).message;
            this.logger.error(`[ConfigService] Request failed: ${message}`);
            // A missing/expired DA.live token throws before the request is sent.
            // Tag it as a 401 so registration callers trigger DA.live re-auth + retry
            // instead of swallowing it as a generic, non-recoverable warning.
            const statusCode = /authentication required/i.test(message) ? 401 : undefined;
            return { success: false, error: message, statusCode };
        }
    }

    /** Handle a non-OK, non-404-DELETE response from the Configuration Service API. */
    private async handleErrorResponse(method: string, url: string, response: Response): Promise<ConfigServiceResult> {
        let errorBody = '';
        try {
            errorBody = await response.text();
        } catch {
            // Ignore parse errors
        }

        // Debug: log raw response body for auth failures to diagnose token type issues
        if (response.status === 401 || response.status === 403) {
            const safeBody = errorBody.replace(/[\r\n]/g, ' ').substring(0, 200);
            this.logger.debug(`[ConfigService] Auth failure raw response: ${safeBody}`);
        }

        const errorMessage = this.formatError(response.status, errorBody);
        // 409 (conflict) is handled by callers (delete + re-create) — log at info, not error
        const logLevel = response.status === 409 ? 'info' : 'error';
        this.logger[logLevel](`[ConfigService] ${method} ${url} -> ${response.status}: ${errorMessage}`);
        return { success: false, error: errorMessage, statusCode: response.status };
    }

    /**
     * Get IMS token for Configuration Service authentication
     */
    private async getImsToken(): Promise<string> {
        const token = await this.tokenProvider.getAccessToken();
        if (!token) {
            throw new Error('DA.live authentication required. Please sign in to DA.live first.');
        }
        return token;
    }

    /**
     * Format error message based on HTTP status
     */
    private formatError(status: number, body: string): string {
        switch (status) {
            case 401:
                return 'Configuration Service auth failed. Your DA.live token may have expired — try re-authenticating with DA.live.';
            case 403:
                return 'Not authorized for Configuration Service. You may need org-level admin access — install AEM Code Sync via aem.live/developer/tutorial or ask an Adobe admin to grant access.';
            case 409:
                return 'Site configuration already exists. It may have been created by another process.';
            default:
                return `Configuration Service error (${status}): ${body || 'Unknown error'}`;
        }
    }
}
