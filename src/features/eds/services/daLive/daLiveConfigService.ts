/**
 * DA.live Config Service
 *
 * Client for the DA.live Config API (admin.da.live/config/) that manages
 * site permissions and configuration using the multi-sheet format.
 *
 * This is the correct API for configuring EDS site permissions, replacing
 * the broken admin.hlx.page/config/ approach. The DA.live Config API uses:
 * - Endpoint: PUT https://admin.da.live/config/{org}/{site}/
 * - Auth: Bearer ${daLiveToken} (DA.live IMS token)
 * - Format: FormData with multi-sheet JSON config
 *
 * Key differences from the old approach:
 * - Uses DA.live IMS token (not GitHub token)
 * - Uses multi-sheet config format with permissions sheet
 * - Proper permission row structure (path, groups, actions)
 *
 * @see https://github.com/adobe/storefront-tools for reference implementation
 * @module features/eds/services/daLive/daLiveConfigService
 */

import { DaLiveApiClient, type TokenProvider } from './daLiveApiClient';
import type {
    ContentReader,
    GrantAccessResult,
    HasAccessResult,
    MultiSheetConfig,
} from './daLiveConfigTypes';
import { DA_LIVE_BASE_URL } from './daLiveConstants';
import { DaLiveContentReaders } from './daLiveContentReaders';
import { DaLiveSiteAccess } from './daLiveSiteAccess';
import type { Logger } from '@/types/logger';

export type {
    ContentReader,
    GrantAccessResult,
    HasAccessResult,
    MultiSheetConfig,
    PermissionRow,
    SheetData,
} from './daLiveConfigTypes';

// ==========================================================
// DA.live Config Service
// ==========================================================

/**
 * DA.live Config Service: reads and writes the org and site config sheets.
 *
 * Uses the correct admin.da.live/config/ API endpoint with proper
 * DA.live IMS authentication and multi-sheet config format. Who may write or
 * read a site is decided in `DaLiveSiteAccess` and `DaLiveContentReaders`,
 * which are handed this service as their store.
 */
export class DaLiveConfigService {
    /** Shared DA.live transport (retry/timeout/429) — 2026-08-22 consolidation. */
    private readonly apiClient: DaLiveApiClient;
    private readonly siteAccess: DaLiveSiteAccess;
    private readonly contentReaders: DaLiveContentReaders;

    constructor(
        private tokenProvider: TokenProvider,
        private logger: Logger,
    ) {
        this.apiClient = new DaLiveApiClient(tokenProvider, logger);
        this.siteAccess = new DaLiveSiteAccess(this, logger);
        this.contentReaders = new DaLiveContentReaders(this, logger);
    }

    /**
     * Get IMS token from TokenProvider
     * @throws Error if not authenticated
     */
    private async getDaLiveToken(): Promise<string> {
        const token = await this.tokenProvider.getAccessToken();

        if (!token) {
            throw new Error('DA.live authentication required. Please sign in to DA.live.');
        }

        return token;
    }

    /**
     * Read current org config from DA.live
     *
     * Permissions are stored at the ORG level, not site level.
     * See: https://da.live/docs/administration/permissions
     *
     * @param org - DA.live organization name
     * @returns Org config or null if not found
     */
    async getOrgConfig(org: string): Promise<MultiSheetConfig | null> {
        const token = await this.getDaLiveToken();
        const url = `${DA_LIVE_BASE_URL}/config/${org}/`;

        this.logger.debug(`[DaLiveConfig] Getting org config for ${org}`);

        try {
            const response = await this.apiClient.fetchWithRetry(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.status === 404) {
                this.logger.debug(`[DaLiveConfig] No config exists for org ${org}`);
                return null;
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(
                    `Failed to read org config: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
                );
            }

            return await response.json();
        } catch (error) {
            if ((error as Error).message.includes('Failed to read')) {
                throw error;
            }
            throw new Error(`Config API error: ${(error as Error).message}`);
        }
    }

    /**
     * Update org config (merges with existing)
     *
     * Permissions are stored at the ORG level, not site level.
     *
     * @param org - DA.live organization name
     * @param config - Config to update
     */
    async updateOrgConfig(org: string, config: MultiSheetConfig): Promise<void> {
        const token = await this.getDaLiveToken();
        const url = `${DA_LIVE_BASE_URL}/config/${org}/`;

        this.logger.debug(`[DaLiveConfig] Updating org config for ${org}`);

        try {
            // Factory: FormData bodies are one-shot, so each retry attempt gets
            // a fresh one (shared-client contract, 2026-08-22).
            const response = await this.apiClient.fetchWithRetry(url, () => {
                const formData = new FormData();
                formData.set('config', JSON.stringify(config));
                return {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    body: formData,
                };
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(
                    `Failed to update org config: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
                );
            }

            this.logger.debug(`[DaLiveConfig] Org config updated for ${org}`);
        } catch (error) {
            if ((error as Error).message.includes('Failed to update')) {
                throw error;
            }
            throw new Error(`Config API error: ${(error as Error).message}`);
        }
    }

    /**
     * Read current site config from DA.live
     *
     * @param org - DA.live organization name
     * @param site - DA.live site name
     * @returns Site config or null if not found
     */
    async getConfig(org: string, site: string): Promise<MultiSheetConfig | null> {
        const token = await this.getDaLiveToken();
        const url = `${DA_LIVE_BASE_URL}/config/${org}/${site}/`;

        this.logger.debug(`[DaLiveConfig] Getting config for ${org}/${site}`);

        try {
            const response = await this.apiClient.fetchWithRetry(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.status === 404) {
                this.logger.debug(`[DaLiveConfig] No config exists for ${org}/${site}`);
                return null;
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(
                    `Failed to read config: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
                );
            }

            return await response.json();
        } catch (error) {
            if ((error as Error).message.includes('Failed to read')) {
                throw error;
            }
            throw new Error(`Config API error: ${(error as Error).message}`);
        }
    }

    /**
     * Update site config (merges with existing)
     *
     * Uses FormData format as expected by DA.live Config API.
     *
     * @param org - DA.live organization name
     * @param site - DA.live site name
     * @param config - Config to update
     */
    async updateConfig(org: string, site: string, config: MultiSheetConfig): Promise<void> {
        const token = await this.getDaLiveToken();
        const url = `${DA_LIVE_BASE_URL}/config/${org}/${site}/`;

        this.logger.debug(`[DaLiveConfig] Updating config for ${org}/${site}`);

        try {
            // Factory: FormData bodies are one-shot, so each retry attempt gets
            // a fresh one (shared-client contract, 2026-08-22).
            const response = await this.apiClient.fetchWithRetry(url, () => {
                const formData = new FormData();
                formData.set('config', JSON.stringify(config));
                return {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    body: formData,
                };
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(
                    `Failed to update config: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
                );
            }

            this.logger.debug(`[DaLiveConfig] Config updated for ${org}/${site}`);
        } catch (error) {
            if ((error as Error).message.includes('Failed to update')) {
                throw error;
            }
            throw new Error(`Config API error: ${(error as Error).message}`);
        }
    }

    /**
     * Delete site-level config entry (best-effort)
     *
     * During site setup, `updateSiteConfig()` writes block library config to
     * `/config/{org}/{site}`. This method attempts to remove it during deletion.
     *
     * The DA.live Config API does not officially support DELETE. This sends a
     * DELETE request and treats both success and 404 as "cleaned up". Any other
     * response (405, 500, etc.) is logged but not thrown — the config entry
     * will simply be orphaned, which has no functional impact since `/list/`
     * only shows source entries.
     *
     * @param org - DA.live organization name
     * @param site - DA.live site name
     * @returns Result indicating success or failure
     */
    async deleteSiteConfig(
        org: string,
        site: string,
    ): Promise<GrantAccessResult> {
        try {
            const token = await this.getDaLiveToken();
            const url = `${DA_LIVE_BASE_URL}/config/${org}/${site}/`;

            this.logger.debug(`[DaLiveConfig] Deleting site config for ${org}/${site}`);

            const response = await this.apiClient.fetchWithRetry(url, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.ok || response.status === 404) {
                this.logger.debug(
                    `[DaLiveConfig] Site config deleted for ${org}/${site} (status=${response.status})`,
                );
                return { success: true };
            }

            // DELETE not supported (405) or other error — log and continue
            this.logger.debug(
                `[DaLiveConfig] Site config deletion returned ${response.status} for ${org}/${site} (API may not support DELETE)`,
            );
            return { success: false, error: `Config DELETE returned ${response.status}` };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.debug(
                `[DaLiveConfig] Site config deletion failed for ${org}/${site}: ${message}`,
            );
            return { success: false, error: message };
        }
    }

    // ======================================================================
    // Access — the work lives in DaLiveSiteAccess and DaLiveContentReaders;
    // these keep the methods every caller already names.
    // ======================================================================

    /** Grant a user write access to a site (`DaLiveSiteAccess.grantUserAccess`). */
    grantUserAccess(org: string, site: string, userEmail: string): Promise<GrantAccessResult> {
        return this.siteAccess.grantUserAccess(org, site, userEmail);
    }

    /** Whether a user has access to a site (`DaLiveSiteAccess.hasUserAccess`). */
    hasUserAccess(org: string, site: string, userEmail: string): Promise<HasAccessResult> {
        return this.siteAccess.hasUserAccess(org, site, userEmail);
    }

    /** A summary of a site's permissions (`DaLiveSiteAccess.getPermissionsStatus`). */
    getPermissionsStatus(
        org: string,
        site: string,
    ): Promise<{ configured: boolean; userCount: number; users: string[] }> {
        return this.siteAccess.getPermissionsStatus(org, site);
    }

    /** Drop a deleted site's permission rows (`DaLiveSiteAccess.removeSitePermissions`). */
    removeSitePermissions(org: string, site: string): Promise<GrantAccessResult> {
        return this.siteAccess.removeSitePermissions(org, site);
    }

    /** Remove a user's access to a site (`DaLiveSiteAccess.revokeUserAccess`). */
    revokeUserAccess(org: string, site: string, userEmail: string): Promise<GrantAccessResult> {
        return this.siteAccess.revokeUserAccess(org, site, userEmail);
    }

    /** Everyone with a row on a site's content (`DaLiveContentReaders.listContentReaders`). */
    listContentReaders(org: string, site: string): Promise<ContentReader[]> {
        return this.contentReaders.listContentReaders(org, site);
    }

    /** Let a user read a site's content (`DaLiveContentReaders.grantContentRead`). */
    grantContentRead(
        org: string,
        site: string,
        userEmail: string,
        ownerEmail?: string,
    ): Promise<GrantAccessResult> {
        return this.contentReaders.grantContentRead(org, site, userEmail, ownerEmail);
    }

    /** Stop a user reading a site's content (`DaLiveContentReaders.revokeContentRead`). */
    revokeContentRead(org: string, site: string, userEmail: string): Promise<GrantAccessResult> {
        return this.contentReaders.revokeContentRead(org, site, userEmail);
    }
}
