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
 * @module features/eds/services/daLiveConfigService
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import type { TokenProvider } from './daLiveContentOperations';

// ==========================================================
// Constants
// ==========================================================

/** DA.live Admin API base URL */
const DA_ADMIN_URL = 'https://admin.da.live';

// ==========================================================
// Types
// ==========================================================

/**
 * Permission row in the permissions sheet
 *
 * From storefront-tools permissions.js:
 * - path: 'CONFIG' for admin, '/**' for recursive access to all content
 * - groups: User email or org ID (comma-separated for multiple)
 * - actions: 'write' or 'read'
 * - comments: Optional description
 */
export interface PermissionRow {
    /** Content path pattern */
    path: string;
    /** User email(s) or group ID(s), comma-separated */
    groups: string;
    /** Permission level */
    actions: 'write' | 'read';
    /** Optional description */
    comments?: string;
}

/**
 * Sheet data structure within multi-sheet config
 */
export interface SheetData<T> {
    total: number;
    limit: number;
    offset: number;
    data: T[];
    ':colWidths'?: number[];
}

/**
 * Multi-sheet config format used by DA.live Config API
 */
export interface MultiSheetConfig {
    ':names': string[];
    ':version': number;
    ':type': 'multi-sheet';
    /** Data sheet (general key-value settings) */
    data?: SheetData<Record<string, string>>;
    /** Permissions sheet */
    permissions?: SheetData<PermissionRow>;
    /** Library sheet (block library configuration) */
    library?: SheetData<{ title: string; path: string }>;
    /** Allow other sheets */
    [key: string]: unknown;
}

/**
 * Result of granting user access
 */
export interface GrantAccessResult {
    success: boolean;
    error?: string;
}

/**
 * Result of checking user access
 */
export interface HasAccessResult {
    hasAccess: boolean;
    permissionLevel?: 'write' | 'read';
}

// ==========================================================
// DA.live Config Service
// ==========================================================

/**
 * DA.live Config Service for managing site permissions
 *
 * Uses the correct admin.da.live/config/ API endpoint with proper
 * DA.live IMS authentication and multi-sheet config format.
 */
export class DaLiveConfigService {
    constructor(
        private tokenProvider: TokenProvider,
        private logger: Logger,
    ) {}

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
        const url = `${DA_ADMIN_URL}/config/${org}/`;

        this.logger.debug(`[DaLiveConfig] Getting org config for ${org}`);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
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
        const url = `${DA_ADMIN_URL}/config/${org}/`;

        this.logger.debug(`[DaLiveConfig] Updating org config for ${org}`);

        const formData = new FormData();
        formData.set('config', JSON.stringify(config));

        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
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
        const url = `${DA_ADMIN_URL}/config/${org}/${site}/`;

        this.logger.debug(`[DaLiveConfig] Getting config for ${org}/${site}`);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
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
        const url = `${DA_ADMIN_URL}/config/${org}/${site}/`;

        this.logger.debug(`[DaLiveConfig] Updating config for ${org}/${site}`);

        const formData = new FormData();
        formData.set('config', JSON.stringify(config));

        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
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
     * Grant user write access to a site
     *
     * This is the main entry point for configuring permissions.
     * IMPORTANT: Permissions are stored at the ORG level, not site level.
     * See: https://da.live/docs/administration/permissions
     *
     * Follows the pattern:
     * 1. Read existing ORG config (preserve other settings)
     * 2. Merge user into permissions sheet with site-specific path
     * 3. Update ORG config
     *
     * @param org - DA.live organization name
     * @param site - DA.live site name
     * @param userEmail - User's email address to grant access
     * @returns Result indicating success or failure
     */
    async grantUserAccess(
        org: string,
        site: string,
        userEmail: string,
    ): Promise<GrantAccessResult> {
        try {
            this.logger.info(`[DaLiveConfig] Granting access to ${userEmail} for ${org}/${site}`);

            // Step 1: Read existing ORG config (permissions are at org level)
            const existing = await this.getOrgConfig(org);

            // Step 2: Build permissions data
            const permissionsData: PermissionRow[] = [];

            // Preserve existing permissions
            if (existing?.permissions?.data) {
                permissionsData.push(...existing.permissions.data);
            }

            // /+** matches the root path AND everything underneath it
            // /**  only matches children (sub-paths), not the root itself
            // Without +, listing the org root returns 403 (can't list projects)
            const rootPath = '/+**';
            const sitePath = `/${site}/+**`;

            // Check existing permissions to avoid duplicates
            const hasRootPermission = permissionsData.some(
                (row) => row.groups === userEmail && row.path === rootPath,
            );
            const hasContentPermission = permissionsData.some(
                (row) => row.groups === userEmail && row.path === sitePath,
            );
            const hasConfigPermission = permissionsData.some(
                (row) => row.groups === userEmail && row.path === 'CONFIG',
            );

            // Add CONFIG permission (required by DA.live API for config modification)
            if (!hasConfigPermission) {
                permissionsData.push({
                    path: 'CONFIG',
                    groups: userEmail,
                    actions: 'write',
                    comments: 'Demo Builder - config access',
                });
            }

            // Add root permission (required for org-level listing)
            if (!hasRootPermission) {
                permissionsData.push({
                    path: rootPath,
                    groups: userEmail,
                    actions: 'write',
                    comments: 'Demo Builder - org content access',
                });
            }

            // Add site-specific content permission
            if (!hasContentPermission) {
                permissionsData.push({
                    path: sitePath,
                    groups: userEmail,
                    actions: 'write',
                    comments: `Demo Builder - ${site} content access`,
                });
            }

            if (hasRootPermission && hasContentPermission && hasConfigPermission) {
                this.logger.debug(`[DaLiveConfig] User ${userEmail} already has full access to ${site}`);
            }

            // Step 3: Build updated config
            const names = existing?.[':names'] || ['permissions'];
            if (!names.includes('permissions')) {
                names.push('permissions');
            }

            const updatedConfig: MultiSheetConfig = {
                ...existing,
                ':names': names,
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: permissionsData.length,
                    limit: permissionsData.length,
                    offset: 0,
                    data: permissionsData,
                    ':colWidths': [200, 350, 75, 150],
                },
            };

            // Step 4: Update ORG config (permissions are at org level)
            await this.updateOrgConfig(org, updatedConfig);

            this.logger.info(`[DaLiveConfig] Access granted to ${userEmail} for ${org}/${site}`);
            return { success: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`[DaLiveConfig] Failed to grant access: ${message}`);
            return { success: false, error: message };
        }
    }

    /**
     * Check if user has access to site
     *
     * @param org - DA.live organization name
     * @param site - DA.live site name
     * @param userEmail - User's email address to check
     * @returns Result with access status and permission level
     */
    async hasUserAccess(org: string, site: string, userEmail: string): Promise<HasAccessResult> {
        try {
            const config = await this.getConfig(org, site);

            if (!config?.permissions?.data) {
                return { hasAccess: false };
            }

            // Check for exact email match or wildcard access
            for (const row of config.permissions.data) {
                // Check if groups contains the user's email
                const groups = row.groups.split(',').map((g) => g.trim());
                const hasAccess = groups.includes(userEmail) || groups.includes('*');

                if (hasAccess) {
                    return {
                        hasAccess: true,
                        permissionLevel: row.actions,
                    };
                }
            }

            return { hasAccess: false };
        } catch (error) {
            this.logger.warn(`[DaLiveConfig] Error checking access: ${(error as Error).message}`);
            return { hasAccess: false };
        }
    }

    /**
     * Get permissions status for a site
     *
     * Returns summary of configured permissions.
     *
     * @param org - DA.live organization name
     * @param site - DA.live site name
     * @returns Permissions status
     */
    async getPermissionsStatus(
        org: string,
        site: string,
    ): Promise<{
        configured: boolean;
        userCount: number;
        users: string[];
    }> {
        try {
            const config = await this.getConfig(org, site);

            if (!config?.permissions?.data) {
                return {
                    configured: false,
                    userCount: 0,
                    users: [],
                };
            }

            const users = config.permissions.data.map((row) => row.groups);

            return {
                configured: users.length > 0,
                userCount: users.length,
                users,
            };
        } catch (error) {
            this.logger.warn(
                `[DaLiveConfig] Error getting permissions status: ${(error as Error).message}`,
            );
            return {
                configured: false,
                userCount: 0,
                users: [],
            };
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
            const url = `${DA_ADMIN_URL}/config/${org}/${site}/`;

            this.logger.debug(`[DaLiveConfig] Deleting site config for ${org}/${site}`);

            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
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

    /**
     * Remove all site-specific permission rows from the org config
     *
     * When a site is deleted, its `/{site}/+**` permission rows become stale.
     * This method removes them for ALL users, while preserving shared rows
     * like `CONFIG` and `/+**`.
     *
     * @param org - DA.live organization name
     * @param site - DA.live site name to clean up
     * @returns Result with removed count
     */
    async removeSitePermissions(
        org: string,
        site: string,
    ): Promise<GrantAccessResult> {
        try {
            this.logger.info(
                `[DaLiveConfig] Removing permissions for site ${site} from org ${org}`,
            );

            const existing = await this.getOrgConfig(org);

            if (!existing?.permissions?.data) {
                this.logger.debug('[DaLiveConfig] No permissions to clean up');
                return { success: true };
            }

            const sitePath = `/${site}/+**`;
            const originalCount = existing.permissions.data.length;

            const filteredPermissions = existing.permissions.data.filter(
                (row) => row.path !== sitePath,
            );

            const removedCount = originalCount - filteredPermissions.length;

            if (removedCount === 0) {
                this.logger.debug(
                    `[DaLiveConfig] No permission rows found for site ${site}`,
                );
                return { success: true };
            }

            const updatedConfig: MultiSheetConfig = {
                ...existing,
                permissions: {
                    ...existing.permissions,
                    total: filteredPermissions.length,
                    limit: filteredPermissions.length,
                    data: filteredPermissions,
                },
            };

            await this.updateOrgConfig(org, updatedConfig);

            this.logger.info(
                `[DaLiveConfig] Removed ${removedCount} permission row(s) for site ${site}`,
            );
            return { success: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(
                `[DaLiveConfig] Failed to remove site permissions: ${message}`,
            );
            return { success: false, error: message };
        }
    }

    /**
     * Remove user access from site
     *
     * @param org - DA.live organization name
     * @param site - DA.live site name
     * @param userEmail - User's email address to remove
     * @returns Result indicating success or failure
     */
    async revokeUserAccess(
        org: string,
        site: string,
        userEmail: string,
    ): Promise<GrantAccessResult> {
        try {
            this.logger.info(`[DaLiveConfig] Revoking access for ${userEmail} from ${org}/${site}`);

            // Read existing config
            const existing = await this.getConfig(org, site);

            if (!existing?.permissions?.data) {
                return { success: true }; // No permissions to revoke
            }

            // Filter out the user's permissions
            const filteredPermissions = existing.permissions.data.filter(
                (row) => row.groups !== userEmail,
            );

            // Update config with filtered permissions
            const updatedConfig: MultiSheetConfig = {
                ...existing,
                permissions: {
                    total: filteredPermissions.length,
                    limit: filteredPermissions.length,
                    offset: 0,
                    data: filteredPermissions,
                    ':colWidths': [200, 350, 75, 150],
                },
            };

            await this.updateConfig(org, site, updatedConfig);

            this.logger.info(`[DaLiveConfig] Access revoked for ${userEmail} from ${org}/${site}`);
            return { success: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`[DaLiveConfig] Failed to revoke access: ${message}`);
            return { success: false, error: message };
        }
    }
}
