/**
 * DaLiveConfigOperations — DA.live config-sheet writes.
 *
 * The config-write cluster carved out of `DaLiveContentOperations`: updating a
 * site's block-library sheet (`updateSiteConfig`), and merging key/value rows
 * into a site's data sheet while preserving all other sheets (`applySiteConfig`
 * → `writeMergedDataConfig`). Both write the SAME per-site config endpoint and
 * share one hardened read/write discipline (`readConfigOrError` +
 * `computeSheetNames` + `postSiteConfig`): fail closed on a read error, probe
 * org ownership on 401, and never drop an existing sheet. Builds on the shared
 * `DaLiveApiClient` (token + error mapping); the facade constructs one instance
 * and delegates to it.
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
     * Uses the same fail-closed read + 401 ownership discipline as
     * `writeMergedDataConfig`: a transient GET error never triggers a skeleton
     * write, and `:names` is computed dynamically so a `permissions` (or any
     * other) sheet already on the site config is preserved, not clobbered.
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
        const configUrl = `${DA_LIVE_BASE_URL}/config/${org}/${site}`;

        const read = await this.readConfigOrError(configUrl, org, token);
        if ('error' in read) {
            return { success: false, error: read.error };
        }
        const existingConfig = read.config;

        // Preserve the existing data sheet, (re)write the library sheet, and
        // preserve ALL other sheets. `:names` is computed dynamically so a
        // permissions sheet in the existing config survives the write.
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
            ':names': this.computeSheetNames(existingConfig, ['data', 'library']),
            ':type': 'multi-sheet',
        };

        const result = await this.postSiteConfig(configUrl, token, configData);
        if (result.success) {
            this.logger.debug(`[DA.live] Config updated for ${org}/${site}`);
        }
        return result;
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

        const read = await this.readConfigOrError(configUrl, org, token);
        if ('error' in read) {
            return { success: false, error: read.error };
        }
        const existingConfig = read.config;
        const dataSheet = existingConfig.data as
            | { data?: Array<{ key: string; value: string }> }
            | undefined;
        const existingRows = dataSheet?.data || [];

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

        // Update ONLY the data sheet, preserving all other sheets (permissions, etc.).
        // `:names` is recomputed (never hardcoded) so no existing sheet is dropped.
        const configData = {
            ...existingConfig,
            data: {
                total: rows.length,
                offset: 0,
                limit: rows.length,
                data: rows,
            },
            ':names': this.computeSheetNames(existingConfig, ['data']),
        };

        const result = await this.postSiteConfig(configUrl, token, configData);
        if (result.success) {
            this.logger.info(
                `[DA.live] Config applied at ${configUrl}: ${Object.keys(configUpdates).join(', ')}`,
            );
        }
        return result;
    }

    /**
     * Read the existing config with fail-closed error handling + a 401 ownership
     * probe. Returns the existing config, or a minimal fresh skeleton for the
     * legitimate create-fresh cases (404, or 401 where the caller owns the org),
     * or an `error` the caller MUST surface WITHOUT writing.
     *
     * CRITICAL: a transient network/timeout error or an unexpected status must
     * never fall through to a skeleton write — that would drop existing sheets
     * (e.g. permissions). DA.live returns 401 (not 404) when a config has never
     * been written, but the same 401 also means "you don't own this org", so the
     * two are disambiguated by a HEAD /list/<org>/ write-access probe.
     */
    private async readConfigOrError(
        configUrl: string,
        org: string,
        token: string,
    ): Promise<{ config: Record<string, unknown> } | { error: string }> {
        const freshSkeleton = (): Record<string, unknown> => ({
            ':version': 3,
            ':names': [],
            ':type': 'multi-sheet',
        });

        try {
            const getResponse = await fetch(configUrl, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });

            if (getResponse.ok) {
                return { config: (await getResponse.json()) as Record<string, unknown> };
            }
            if (getResponse.status === 404) {
                // No existing config — safe to create fresh (nothing to lose).
                return { config: freshSkeleton() };
            }
            if (getResponse.status === 401) {
                const canWrite = await hasWriteAccess(org, token);
                if (!canWrite) {
                    return {
                        error: `Cannot read or write to config (401): verify DA.live ownership of "${org}".`,
                    };
                }
                return { config: freshSkeleton() };
            }
            return {
                error: `Failed to read existing config: ${getResponse.status} ${getResponse.statusText}`,
            };
        } catch (error) {
            return { error: `Cannot read existing config: ${(error as Error).message}` };
        }
    }

    /**
     * Compute the multi-sheet `:names` listing: preserve the existing order and
     * append any `required` sheet names not already present. Falls back to the
     * config's non-meta top-level keys when `:names` is absent. Recomputing (vs.
     * hardcoding) is what keeps a `permissions` sheet from being dropped.
     */
    private computeSheetNames(config: Record<string, unknown>, required: string[]): string[] {
        const existing = Array.isArray(config[':names'])
            ? (config[':names'] as string[])
            : Object.keys(config).filter((key) => !key.startsWith(':'));
        const names = [...existing];
        for (const name of required) {
            if (!names.includes(name)) {
                names.push(name);
            }
        }
        return names;
    }

    /**
     * POST the config document to the DA.live /config/ endpoint (FormData with a
     * single `config` field). Maps the HTTP result to `{ success, error? }`.
     */
    private async postSiteConfig(
        configUrl: string,
        token: string,
        configData: Record<string, unknown>,
    ): Promise<{ success: boolean; error?: string }> {
        const formData = new FormData();
        formData.append('config', JSON.stringify(configData));

        try {
            const response = await fetch(configUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    // Don't set Content-Type — fetch sets the multipart boundary for FormData.
                },
                body: formData,
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });

            if (response.ok) {
                return { success: true };
            }

            const errorText = await response.text().catch(() => '');
            return {
                success: false,
                error: `Failed to write config: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
            };
        } catch (error) {
            return { success: false, error: `Config API error: ${(error as Error).message}` };
        }
    }
}
