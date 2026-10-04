/**
 * A user's WRITE access to a DA.live site, kept in the ORG permissions sheet: grant,
 * check, summarise, revoke, and drop a deleted site's rows. Every read and write
 * goes through the `ConfigSheetStore` it is handed. Split from
 * `daLiveConfigService.ts` (EDS-8, 2026-10-04), which still answers for these.
 *
 * @module features/eds/services/daLive/daLiveSiteAccess
 */

import type {
    ConfigSheetStore,
    GrantAccessResult,
    HasAccessResult,
    MultiSheetConfig,
    PermissionRow,
} from './daLiveConfigTypes';
import type { Logger } from '@/types/logger';

export class DaLiveSiteAccess {
    constructor(private store: ConfigSheetStore, private logger: Logger) {}

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
            const existing = await this.store.getOrgConfig(org);

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
            await this.store.updateOrgConfig(org, updatedConfig);

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
            const config = await this.store.getConfig(org, site);

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
            const config = await this.store.getConfig(org, site);

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

            const existing = await this.store.getOrgConfig(org);

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

            await this.store.updateOrgConfig(org, updatedConfig);

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
            const existing = await this.store.getConfig(org, site);

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

            await this.store.updateConfig(org, site, updatedConfig);

            this.logger.info(`[DaLiveConfig] Access revoked for ${userEmail} from ${org}/${site}`);
            return { success: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`[DaLiveConfig] Failed to revoke access: ${message}`);
            return { success: false, error: message };
        }
    }
}
