/**
 * DaLiveSourceOperations — DA.live source-tree CRUD.
 *
 * The source-CRUD cluster carved out of `DaLiveContentOperations`: listing a
 * directory, creating/deleting a single source, deleting a site root, deleting
 * an entire site tree, and probing a source's existence. Builds on the shared
 * `DaLiveApiClient` (token + fetch-with-retry + error mapping); the facade
 * constructs one instance and delegates to it.
 *
 * Keep this module `vscode`-free (the MCP server constructs it in a separate
 * Node process).
 *
 * @module features/eds/services/daLiveSourceOperations
 */

import { DaLiveApiClient } from './daLiveApiClient';
import { DA_LIVE_BASE_URL, normalizePath } from './daLiveConstants';
import { DaLiveNetworkError, type DaLiveEntry, type DaLiveSourceResult } from './types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * Batch size for parallel content deletion operations.
 * Process 5 files concurrently to balance speed vs API rate limits.
 */
const CONTENT_COPY_BATCH_SIZE = 5;

/** DA.live source-tree CRUD operations. */
export class DaLiveSourceOperations {
    constructor(
        private readonly apiClient: DaLiveApiClient,
        private readonly logger: Logger,
    ) {}

    /**
     * List directory contents
     * @param org - Organization name
     * @param site - Site name
     * @param path - Directory path (e.g., '/', '/pages')
     * @returns Array of directory entries, empty array if path doesn't exist
     */
    async listDirectory(org: string, site: string, path: string): Promise<DaLiveEntry[]> {
        const token = await this.apiClient.getImsToken();
        const url = `${DA_LIVE_BASE_URL}/list/${org}/${site}/${normalizePath(path)}`;

        const response = await this.apiClient.fetchWithRetry(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            // 404 means path doesn't exist - return empty array gracefully
            if (response.status === 404) {
                return [];
            }

            // Check for rate limiting
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
                throw new DaLiveNetworkError(
                    'Rate limited. Please wait before making more requests.',
                    retryAfter,
                );
            }

            throw this.apiClient.createErrorFromResponse(response, 'list directory');
        }

        return response.json();
    }

    /**
     * Create or update source content
     * @param org - Organization name
     * @param site - Site name
     * @param path - Content path
     * @param content - Content to write
     * @param options - Options {overwrite}
     * @returns Result with success status and path
     */
    async createSource(
        org: string,
        site: string,
        path: string,
        content: string,
        options: { overwrite?: boolean } = {},
    ): Promise<DaLiveSourceResult> {
        const token = await this.apiClient.getImsToken();
        const normalized = normalizePath(path);
        const url = `${DA_LIVE_BASE_URL}/source/${org}/${site}/${normalized}`;

        const formData = new FormData();
        formData.append('data', new Blob([content], { type: 'text/html' }));
        if (options.overwrite) formData.append('overwrite', 'true');

        const response = await this.apiClient.fetchWithRetry(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });

        const resultPath = `/${normalized}`;
        if (response.ok) return { success: true, path: resultPath };
        if (response.status === 409) {
            return {
                success: false,
                path: resultPath,
                error: 'Document already exists. Use overwrite option to replace.',
            };
        }
        return {
            success: false,
            path: resultPath,
            error: `Failed to create source: ${response.status} ${response.statusText}`,
        };
    }

    /**
     * Delete source content
     * @param org - Organization name
     * @param site - Site name
     * @param path - Content path to delete
     * @returns Result with success status
     */
    async deleteSource(
        org: string,
        site: string,
        path: string,
    ): Promise<{ success: boolean; error?: string }> {
        const token = await this.apiClient.getImsToken();
        const normalized = normalizePath(path);
        const url = `${DA_LIVE_BASE_URL}/source/${org}/${site}/${normalized}`;

        try {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });

            // 200/204 = deleted, 404 = already doesn't exist (both are success)
            if (response.ok || response.status === 404) {
                return { success: true };
            }

            return {
                success: false,
                error: `Failed to delete: ${response.status} ${response.statusText}`,
            };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Delete the site root entry so the site disappears from org listing.
     *
     * Sends `DELETE /source/{org}/{site}/` to remove the root directory marker.
     * Best-effort: 404 means it was already gone; other errors are logged but
     * don't fail the overall operation.
     */
    async deleteSiteRoot(org: string, site: string): Promise<void> {
        const token = await this.apiClient.getImsToken();
        const url = `${DA_LIVE_BASE_URL}/source/${org}/${site}/`;

        try {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });

            if (response.ok || response.status === 404) {
                this.logger.debug(
                    `[DA.live] Site root deleted for ${org}/${site} (status=${response.status})`,
                );
            } else {
                this.logger.debug(
                    `[DA.live] Site root deletion returned ${response.status} for ${org}/${site}`,
                );
            }
        } catch (error) {
            this.logger.debug(
                `[DA.live] Site root deletion failed for ${org}/${site}: ${(error as Error).message}`,
            );
        }
    }

    /**
     * Delete all content from a DA.live site.
     *
     * Recursively walks the directory tree, collects all file paths,
     * then deletes them in parallel batches (same concurrency as content
     * copy) followed by directory cleanup in reverse-depth order.
     * Finally deletes the site root entry so the site disappears from
     * the org listing.
     *
     * Note: Only DA.live *source* content is deleted. The caller is
     * responsible for unpublishing CDN content separately (via
     * HelixService.unpublishPages, which uses DA.live Bearer token auth).
     *
     * @param org - Organization name
     * @param site - Site name
     * @param onProgress - Optional progress callback
     * @returns Result with count of deleted entries
     */
    async deleteAllSiteContent(
        org: string,
        site: string,
        onProgress?: (info: { deleted: number; current: string }) => void,
    ): Promise<{ success: boolean; deletedCount: number; deletedPaths: string[]; error?: string }> {
        const filePaths: string[] = [];
        const dirPaths: string[] = [];

        // DA.live entry.path includes org/site prefix (e.g. /org/site/page.html).
        // listDirectory and deleteSource already prepend org/site into the URL,
        // so we must strip the prefix to avoid doubling it.
        const pathPrefix = `/${org}/${site}`;
        const stripPrefix = (entryPath: string): string => entryPath.replace(pathPrefix, '') || '/';

        // Phase 1: Walk the tree and collect all relative paths
        const collectPaths = async (dirPath: string): Promise<void> => {
            const entries = await this.listDirectory(org, site, dirPath);

            for (const entry of entries) {
                const relativePath = stripPrefix(entry.path);
                if (entry.ext) {
                    filePaths.push(relativePath);
                } else {
                    await collectPaths(relativePath);
                    // Collect dirs after recursion so deepest dirs come first
                    dirPaths.push(relativePath);
                }
            }
        };

        try {
            this.logger.info(`[DA.live] Deleting all content from ${org}/${site}`);
            await collectPaths('/');

            if (filePaths.length === 0) {
                this.logger.info(`[DA.live] Site ${org}/${site} is already empty`);
                // Still delete the site root entry so it disappears from org listing
                await this.deleteSiteRoot(org, site);
                return { success: true, deletedCount: 0, deletedPaths: [] };
            }

            this.logger.info(
                `[DA.live] Found ${filePaths.length} files and ${dirPaths.length} directories to delete`,
            );

            // Phase 2: Delete files in parallel batches
            let deletedCount = 0;
            for (let i = 0; i < filePaths.length; i += CONTENT_COPY_BATCH_SIZE) {
                const batch = filePaths.slice(i, i + CONTENT_COPY_BATCH_SIZE);
                await Promise.all(
                    batch.map(async (filePath) => {
                        const result = await this.deleteSource(org, site, filePath);
                        if (result.success) {
                            deletedCount++;
                            onProgress?.({ deleted: deletedCount, current: filePath });
                        }
                    }),
                );
            }

            // Phase 3: Delete empty directories (deepest first — already ordered by collectPaths)
            for (const dirPath of dirPaths) {
                await this.deleteSource(org, site, dirPath);
            }

            // Phase 4: Delete the site root entry so it disappears from org listing
            await this.deleteSiteRoot(org, site);

            this.logger.info(`[DA.live] Deleted ${deletedCount} files from ${org}/${site}`);
            return { success: true, deletedCount, deletedPaths: filePaths };
        } catch (error) {
            this.logger.error(
                `[DA.live] Failed to delete site content: ${(error as Error).message}`,
            );
            return {
                success: false,
                deletedCount: filePaths.length,
                deletedPaths: filePaths,
                error: (error as Error).message,
            };
        }
    }

    /**
     * Best-effort existence probe for a DA.live source path. Returns `false`
     * on 404 or any error (used only to pick a status label, never to gate the
     * delete itself).
     */
    async sourceExists(org: string, site: string, path: string): Promise<boolean> {
        try {
            const token = await this.apiClient.getImsToken();
            const normalized = normalizePath(path);
            const url = `${DA_LIVE_BASE_URL}/source/${org}/${site}/${normalized}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}
