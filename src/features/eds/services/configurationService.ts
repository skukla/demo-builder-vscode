/**
 * Configuration Service Client
 *
 * Wraps the AEM Configuration Service API (admin.hlx.page/config/) for
 * site registration, folder mapping, and site deletion.
 *
 * The Configuration Service manages server-side site configuration in Helix 5.
 * Folder mapping (e.g., /products/ -> /products/default) MUST be set via this
 * API — the fstab.yaml folders section is not processed by the pipeline.
 *
 * Authentication: Uses Adobe IMS token via Authorization Bearer header.
 * The IMS token is obtained from the DA.live auth flow (same token used
 * for DA.live content operations). The user must have admin role on the
 * org, which is auto-assigned when they install the AEM Code Sync GitHub App.
 *
 * @module features/eds/services/configurationService
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import type { TokenProvider } from './daLiveContentOperations';

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
    /** GitHub org or user that owns the config (used in URL path) */
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
}

/**
 * Folder mapping entry: maps a URL prefix to a template page
 */
export type FolderMapping = Record<string, string>;

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
        const { org, site, codeOwner, codeRepo, contentSourceUrl, contentSourceType } = params;
        const url = `${ADMIN_API_URL}/config/${org}/sites/${site}.json`;

        this.logger.info(`[ConfigService] Registering site: ${org}/${site}`);
        this.logger.debug(`[ConfigService] Code: ${codeOwner}/${codeRepo}, Content: ${contentSourceUrl}`);

        const body = {
            version: 1,
            code: {
                owner: codeOwner,
                repo: codeRepo,
            },
            content: {
                source: {
                    url: contentSourceUrl,
                    type: contentSourceType || 'markup',
                },
            },
        };

        return this.makeRequest('PUT', url, body);
    }

    // ==========================================================
    // Folder Mapping
    // ==========================================================

    /**
     * Set folder mapping for a site.
     *
     * Configures URL prefix routing (e.g., /products/ -> /products/default)
     * via the Configuration Service. This replaces the fstab.yaml folders section.
     *
     * @param org - GitHub org or user
     * @param site - Site name
     * @param folders - Folder mapping (e.g., { "/products/": "/products/default" })
     * @returns Result with success/error status
     */
    async setFolderMapping(
        org: string,
        site: string,
        folders: FolderMapping,
    ): Promise<ConfigServiceResult> {
        const url = `${ADMIN_API_URL}/config/${org}/sites/${site}/folders.json`;

        this.logger.info(`[ConfigService] Setting folder mapping for ${org}/${site}`);
        this.logger.debug(`[ConfigService] Folders: ${JSON.stringify(folders)}`);

        return this.makeRequest('POST', url, folders);
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
     * @param org - GitHub org or user
     * @param site - Site name
     * @returns Result with success/error status
     */
    async deleteSiteConfig(org: string, site: string): Promise<ConfigServiceResult> {
        const url = `${ADMIN_API_URL}/config/${org}/sites/${site}.json`;

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

            // Debug: log token prefix to diagnose auth type
            this.logger.debug(`[ConfigService] Token prefix: ${token.substring(0, 10)}...`);

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

            // Extract error details
            let errorBody = '';
            try {
                errorBody = await response.text();
            } catch {
                // Ignore parse errors
            }

            // Debug: log raw response body for auth failures to diagnose token type issues
            if (response.status === 401 || response.status === 403) {
                this.logger.debug(`[ConfigService] Auth failure raw response: ${errorBody}`);
            }

            const errorMessage = this.formatError(response.status, errorBody);
            this.logger.error(`[ConfigService] ${method} ${url} -> ${response.status}: ${errorMessage}`);

            return {
                success: false,
                error: errorMessage,
                statusCode: response.status,
            };
        } catch (error) {
            const message = (error as Error).message;
            this.logger.error(`[ConfigService] Request failed: ${message}`);
            return { success: false, error: message };
        }
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
