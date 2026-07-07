/**
 * DaLiveConfigOperations — DA.live config-sheet writes.
 *
 * The config-write cluster carved out of `DaLiveContentOperations`: updating a
 * site's block-library sheet (`updateSiteConfig`), and merging key/value rows
 * into a site's data sheet while preserving all other sheets (`applySiteConfig`
 * → `writeMergedDataConfig`). Builds on the shared `DaLiveApiClient` (token +
 * error mapping); the facade constructs one instance and delegates to it.
 *
 * Keep this module `vscode`-free (the MCP server constructs it in a separate
 * Node process).
 *
 * @module features/eds/services/daLiveConfigOperations
 */

import { DaLiveApiClient } from './daLiveApiClient';
import { DA_LIVE_BASE_URL } from './daLiveConstants';
import { hasWriteAccess } from './daLiveOrgOperations';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** DA.live config-sheet write operations. */
export class DaLiveConfigOperations {
    constructor(
        private readonly apiClient: DaLiveApiClient,
        private readonly logger: Logger,
    ) {}

    /**
     * Update the site's block-library config sheet.
     *
     * The /config/ API is a special endpoint for managing site configuration.
     * It handles the /.da/config file and automatically syncs to CDN.
     * This is different from creating files via /source/ endpoint.
     *
     * @param org - Organization name
     * @param site - Site name
     * @param libraryEntries - Array of library entries with title and path
     * @returns Result with success status
     */
    async updateSiteConfig(
        org: string,
        site: string,
        libraryEntries: Array<{ title: string; path: string }>,
    ): Promise<{ success: boolean; error?: string }> {
        const token = await this.apiClient.getImsToken();

        // First, get existing config to preserve other settings
        let existingConfig: Record<string, unknown> = {};
        try {
            const getResponse = await fetch(`${DA_LIVE_BASE_URL}/config/${org}/${site}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });
            if (getResponse.ok) {
                existingConfig = await getResponse.json();
            }
        } catch {
            // No existing config, start fresh
        }

        // Build updated config with library entries
        // Preserve existing data sheet, update library sheet
        const configData = {
            ...existingConfig,
            data: (existingConfig.data as Record<string, unknown>) || {
                total: 1,
                offset: 0,
                limit: 1,
                data: [{}],
            },
            library: {
                total: libraryEntries.length,
                offset: 0,
                limit: libraryEntries.length,
                data: libraryEntries.map((entry) => ({
                    title: entry.title,
                    path: entry.path,
                    format: '',
                    ref: '',
                    icon: '',
                    experience: '',
                })),
            },
            ':version': 3,
            ':names': ['data', 'library'],
            ':type': 'multi-sheet',
        };

        // POST to /config/ API endpoint using FormData
        // DA.live expects the config as form data with a "config" field containing JSON
        const url = `${DA_LIVE_BASE_URL}/config/${org}/${site}`;
        const formData = new FormData();
        formData.append('config', JSON.stringify(configData));

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    // Note: Don't set Content-Type - fetch sets it automatically with boundary for FormData
                },
                body: formData,
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });

            if (response.ok) {
                this.logger.debug(`[DA.live] Config updated for ${org}/${site}`);
                return { success: true };
            }

            const errorText = await response.text().catch(() => '');
            return {
                success: false,
                error: `Failed to update config: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
            };
        } catch (error) {
            return { success: false, error: `Config API error: ${(error as Error).message}` };
        }
    }

    /**
     * Apply site-level configuration settings
     *
     * Writes to the per-SITE config (/config/{org}/{site}). da.live's Library
     * reads the AEM Assets binding (aem.repositoryId) from the site config, so
     * that binding must be written site-scoped for the AEM Assets panel to
     * appear for first-time users.
     *
     * IMPORTANT: Preserves all existing sheets (library, permissions, etc.) —
     * only updates the data sheet. The block library lives in the site config,
     * so clobbering other sheets here would remove it.
     *
     * 401 ownership is governed by the ORG (org ownership grants site writes),
     * so the write-access probe is keyed on the org, not the site.
     *
     * `removeKeys` deletes named keys from the data sheet (a merge cannot remove
     * a key) — used to clear a stale row, e.g. reverting editor.path to the
     * da.live default when a project flips back to Universal Editor with no IMS
     * org id. When updates is empty and no removeKey is present, no POST is made.
     *
     * @param org - DA.live organization name
     * @param site - DA.live site name
     * @param configUpdates - Key-value pairs to update in the config
     * @param removeKeys - Keys to delete from the data sheet (default none)
     * @returns Success status with optional error message
     */
    async applySiteConfig(
        org: string,
        site: string,
        configUpdates: Record<string, string>,
        removeKeys: string[] = [],
    ): Promise<{ success: boolean; error?: string }> {
        return this.writeMergedDataConfig(
            `${DA_LIVE_BASE_URL}/config/${org}/${site}`,
            org,
            configUpdates,
            removeKeys,
        );
    }

    /**
     * Read the config at configUrl, merge configUpdates into its data sheet
     * (preserving ALL other sheets), delete any `removeKeys`, and POST it back.
     *
     * Used by applySiteConfig (/config/{org}/{site}). The 401 ownership probe
     * uses `org` because org ownership governs both org and site config writes.
     *
     * `removeKeys` deletes named keys from the data sheet — a merge alone cannot
     * remove a key, so removal is the only way to revert a key to the da.live
     * default. When configUpdates is empty AND no removeKey was actually present
     * in the existing sheet, the method short-circuits WITHOUT a POST (no
     * pointless round-trip, and no empty config doc created where none existed).
     *
     * @param configUrl - Full DA.live config endpoint URL
     * @param org - DA.live organization name (used for the 401 ownership probe)
     * @param configUpdates - Key-value pairs to merge into the data sheet
     * @param removeKeys - Keys to delete from the data sheet (default none)
     * @returns Success status with optional error message
     */
    private async writeMergedDataConfig(
        configUrl: string,
        org: string,
        configUpdates: Record<string, string>,
        removeKeys: string[] = [],
    ): Promise<{ success: boolean; error?: string }> {
        const token = await this.apiClient.getImsToken();

        // First, get existing config to preserve ALL sheets (data, permissions, etc.)
        // CRITICAL: If the GET fails, we must NOT write a skeleton config that
        // omits the permissions sheet — that would erase org-level permissions.
        let existingConfig: Record<string, unknown>;
        let existingRows: Array<{ key: string; value: string }> = [];

        try {
            const getResponse = await fetch(configUrl, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });
            if (getResponse.ok) {
                existingConfig = await getResponse.json();
                const dataSheet = existingConfig.data as
                    | { data?: Array<{ key: string; value: string }> }
                    | undefined;
                existingRows = dataSheet?.data || [];
            } else if (getResponse.status === 404) {
                // No existing config — safe to create fresh (no permissions to lose)
                existingConfig = {
                    ':version': 3,
                    ':names': ['data'],
                    ':type': 'multi-sheet',
                };
            } else if (getResponse.status === 401) {
                // DA.live returns 401 (not 404) when the config has never been
                // written. We can't safely treat 401 as "create fresh"
                // unconditionally — the endpoint's owner-auth model means
                // the same 401 can mean "you don't own this org," and
                // writing skeleton config to someone else's org would erase
                // their permissions sheet.
                //
                // The disambiguation is a separate write-access probe via
                // HEAD /list/<org>/, which returns the user's permissions
                // in the x-da-actions header. If write access is present,
                // the user is the legitimate owner (just first-time on
                // /config/) and creating fresh is safe. If not, we refuse.
                const canWrite = await hasWriteAccess(org, token);
                if (!canWrite) {
                    return {
                        success: false,
                        error: `Cannot read or write to org config (401): verify DA.live ownership of "${org}".`,
                    };
                }
                existingConfig = {
                    ':version': 3,
                    ':names': ['data'],
                    ':type': 'multi-sheet',
                };
            } else {
                return {
                    success: false,
                    error: `Failed to read existing config: ${getResponse.status} ${getResponse.statusText}`,
                };
            }
        } catch (error) {
            // Network/timeout error — cannot safely write without reading first
            return {
                success: false,
                error: `Cannot read existing config: ${(error as Error).message}`,
            };
        }

        // Convert existing rows to map for easy merging
        const configMap = new Map<string, string>();
        for (const row of existingRows) {
            if (row.key) {
                configMap.set(row.key, row.value);
            }
        }

        // Determine which removeKeys actually exist before mutating the map.
        // Used by the no-op short-circuit below.
        const removedAnything = removeKeys.some((key) => configMap.has(key));

        // Apply updates
        for (const [key, value] of Object.entries(configUpdates)) {
            configMap.set(key, value);
        }

        // Apply removals (e.g. clearing a stale editor.path row). writeMergedDataConfig
        // can only merge keys, so explicit removal is the only way to revert a key to
        // the da.live default.
        for (const key of removeKeys) {
            configMap.delete(key);
        }

        // No-op optimization: when there are no updates AND no removeKey was actually
        // present, the POST would rewrite the sheet to its current state — or worse,
        // create an empty config doc where none existed (UE projects that never had
        // editor.path). Skip the round-trip and report success.
        if (Object.keys(configUpdates).length === 0 && !removedAnything) {
            return { success: true };
        }

        // Convert back to rows format (key/value columns)
        const rows = Array.from(configMap.entries()).map(([key, value]) => ({ key, value }));

        // Update ONLY the data sheet, preserving all other sheets (permissions, etc.)
        const configData = {
            ...existingConfig,
            data: {
                total: rows.length,
                offset: 0,
                limit: rows.length,
                data: rows,
            },
        };

        // POST to the config API endpoint using FormData
        const formData = new FormData();
        formData.append('config', JSON.stringify(configData));

        try {
            const response = await fetch(configUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });

            if (response.ok) {
                this.logger.info(
                    `[DA.live] Config applied at ${configUrl}: ${Object.keys(configUpdates).join(', ')}`,
                );
                return { success: true };
            }

            const errorText = await response.text().catch(() => '');
            return {
                success: false,
                error: `Failed to apply config: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
            };
        } catch (error) {
            return { success: false, error: `Config API error: ${(error as Error).message}` };
        }
    }
}
