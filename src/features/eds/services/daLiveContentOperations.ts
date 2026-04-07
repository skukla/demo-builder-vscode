/**
 * DA.live Content Operations
 *
 * Handles content-level operations for DA.live content management:
 * - Directory listing
 * - Content copy operations
 * - Source creation
 * - CitiSignal content copy workflow
 *
 * Extracted from DaLiveService for better modularity and testability.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    DA_LIVE_BASE_URL,
    MAX_RETRY_ATTEMPTS,
    RETRYABLE_STATUS_CODES,
    getRetryDelay,
    normalizePath,
} from './daLiveConstants';
import { getMimeType } from './daLiveMimeTypes';
import { convertSpreadsheetJsonToHtml } from './daLiveSpreadsheetUtils';
import {
    DaLiveError,
    DaLiveAuthError,
    DaLiveNetworkError,
    type DaLiveEntry,
    type DaLiveSourceResult,
    type DaLiveCopyResult,
    type DaLiveProgressCallback,
} from './types';
import { formatDuration } from '@/core/utils/timeFormatting';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { ContentPatchSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

/**
 * Batch size for parallel content copying operations.
 * Process 5 files concurrently to balance speed vs API rate limits.
 */
const CONTENT_COPY_BATCH_SIZE = 5;

/**
 * Filter out product overlay documents from content paths.
 *
 * Product overlays (e.g., /products/sku-123) are template documents used by
 * EDS routing but should not be copied during content migration. Only the
 * default product page template (/products/default) should be copied.
 *
 * @param paths - Array of content paths from the index
 * @returns Filtered paths with product overlays removed
 */
export function filterProductOverlays(paths: string[]): string[] {
    return paths.filter(path => {
        // Check if this is a product path
        if (path.includes('/products/')) {
            // Keep /products/default and anything under it
            // e.g., /products/default, /products/default/something
            return path.endsWith('/products/default') ||
                   path.includes('/products/default/');
        }
        // Keep all non-product paths unchanged
        return true;
    });
}

/**
 * Content source configuration for copying content between DA.live sites
 */
export interface DaLiveContentSource {
    /** Source organization name */
    org: string;
    /** Source site name */
    site: string;
    /** URL to fetch content index (full-index.json) */
    indexUrl: string;
    /** Optional URL to fetch media index (media-index.json) */
    mediaIndexUrl?: string;
}

/**
 * Token provider interface for dependency injection
 */
export interface TokenProvider {
    getAccessToken(): Promise<string | null>;
}

/**
 * Authentication manager interface for token provider creation.
 * This matches the shape of AuthenticationService.getTokenManager().
 */
interface TokenManager {
    getAccessToken(): Promise<string | undefined>;
}

interface AuthManagerLike {
    getTokenManager(): TokenManager;
}

/**
 * Create a TokenProvider adapter from an authentication manager.
 *
 * This factory function consolidates the repeated pattern of creating
 * TokenProvider adapters throughout the codebase. It handles:
 * - Null/undefined authManager (returns null-returning provider)
 * - Converting undefined tokens to null (as required by TokenProvider)
 *
 * @param authManager - Optional authentication manager with getTokenManager()
 * @returns TokenProvider that wraps the auth manager's token access
 */
export function createDaLiveTokenProvider(authManager?: AuthManagerLike | null): TokenProvider {
    if (!authManager) {
        return {
            getAccessToken: async () => null,
        };
    }

    return {
        getAccessToken: async () => {
            const token = await authManager.getTokenManager().getAccessToken();
            return token ?? null;
        },
    };
}

/**
 * Create a TokenProvider that wraps a DaLiveAuthService instance.
 * Use this when you have a DaLiveAuthService and need a TokenProvider
 * for DaLiveContentOperations or DaLiveOrgOperations.
 *
 * @param authService - Any object with getAccessToken (e.g., DaLiveAuthService)
 * @returns TokenProvider that delegates to the auth service
 */
export function createDaLiveServiceTokenProvider(
    authService: { getAccessToken(): Promise<string | null> },
): TokenProvider {
    return {
        getAccessToken: () => authService.getAccessToken(),
    };
}

/**
 * DA.live Content Operations
 */
export class DaLiveContentOperations {
    constructor(
        private tokenProvider: TokenProvider,
        private logger: Logger,
    ) {}

    /**
     * Get IMS token from TokenProvider
     * @throws DaLiveAuthError if not authenticated
     */
    private async getImsToken(): Promise<string> {
        const token = await this.tokenProvider.getAccessToken();

        if (!token) {
            throw new DaLiveAuthError('Not authenticated. Please log in to Adobe.');
        }

        return token;
    }

    /**
     * List directory contents
     * @param org - Organization name
     * @param site - Site name
     * @param path - Directory path (e.g., '/', '/pages')
     * @returns Array of directory entries, empty array if path doesn't exist
     */
    async listDirectory(org: string, site: string, path: string): Promise<DaLiveEntry[]> {
        const token = await this.getImsToken();
        const url = `${DA_LIVE_BASE_URL}/list/${org}/${site}/${normalizePath(path)}`;

        const response = await this.fetchWithRetry(url, {
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

            throw this.createErrorFromResponse(response, 'list directory');
        }

        return response.json();
    }

    /**
     * Copy content from source to destination
     * @param source - Source location {org, site, path}
     * @param destination - Destination location {org, site, path}
     * @param options - Copy options {recursive}
     * @returns Copy result with success status and file lists
     */
    async copyContent(
        source: { org: string; site: string; path: string },
        destination: { org: string; site: string; path: string },
        options: { recursive?: boolean } = {},
    ): Promise<DaLiveCopyResult> {
        const token = await this.getImsToken();
        const copiedFiles: string[] = [];
        const failedFiles: { path: string; error: string }[] = [];

        // Check if source is a directory (needs recursive handling)
        if (options.recursive) {
            // List source directory
            const entries = await this.listDirectory(source.org, source.site, source.path);

            // Process all entries
            // In DA.live API, folders don't have an 'ext' field, only files do
            for (const entry of entries) {
                const isFolder = !entry.ext;
                if (isFolder) {
                    // Recursively copy subdirectory
                    const subResult = await this.copyContent(
                        { org: source.org, site: source.site, path: entry.path },
                        {
                            org: destination.org,
                            site: destination.site,
                            path: entry.path.replace(source.path, destination.path),
                        },
                        { recursive: true },
                    );
                    copiedFiles.push(...subResult.copiedFiles);
                    failedFiles.push(...subResult.failedFiles);
                } else {
                    // Copy individual file
                    const destPath = entry.path.replace(source.path, destination.path);
                    const success = await this.copySingleFile(token, source, entry.path, destination, destPath);
                    if (success) {
                        copiedFiles.push(destPath);
                    } else {
                        failedFiles.push({ path: destPath, error: 'Copy failed' });
                    }
                }
            }
        } else {
            // Single file copy
            const success = await this.copySingleFile(
                token,
                source,
                source.path,
                destination,
                destination.path,
            );
            if (success) {
                copiedFiles.push(destination.path);
            } else {
                failedFiles.push({ path: destination.path, error: 'Copy failed' });
            }
        }

        return {
            success: failedFiles.length === 0,
            copiedFiles,
            failedFiles,
            totalFiles: copiedFiles.length + failedFiles.length,
        };
    }

    /**
     * Transform plain HTML content for DA.live source upload
     *
     * Converts relative media URLs to absolute URLs pointing to the source CDN.
     * This follows BYOM (Bring Your Own Markup) best practices:
     * - Image URLs must be accessible by Edge Delivery Services
     * - During preview, Admin API downloads images from these URLs
     * - Images are then stored in Media Bus with hash-based URLs
     *
     * Also preserves empty structural divs that are important for EDS blocks:
     * - Header block expects 3 sections (brand, sections, tools)
     * - Empty divs are placeholders for dynamic content (search, cart, wishlist)
     * - DA.live/Helix may strip empty elements, so we add placeholders
     *
     * @param html - Plain HTML content from aem.live .plain.html endpoint
     * @param sourceBaseUrl - Base URL for the source CDN (e.g., "https://main--site--org.aem.live")
     * @returns Document HTML formatted for DA.live with absolute image URLs
     */
    private transformHtmlForDaLive(html: string, sourceBaseUrl: string): string {
        let transformed = html;

        // Convert relative media URLs to absolute URLs pointing to source CDN
        // Pattern: ./media_<hash>.<ext> or /media_<hash>.<ext>
        // The Admin API will download these during preview and store in Media Bus

        // Handle ./media_xxx URLs (most common in .plain.html)
        transformed = transformed.replace(
            /(['"])\.\/media_([a-f0-9]+\.[a-z0-9]+)(\?[^'"]*)?(['"])/gi,
            (_match, openQuote, mediaPath, queryParams, closeQuote) => {
                // Preserve query params as they may contain optimization hints
                const fullPath = queryParams ? `media_${mediaPath}${queryParams}` : `media_${mediaPath}`;
                return `${openQuote}${sourceBaseUrl}/${fullPath}${closeQuote}`;
            },
        );

        // Handle /media_xxx URLs (absolute paths without domain)
        transformed = transformed.replace(
            /(['"])\/media_([a-f0-9]+\.[a-z0-9]+)(\?[^'"]*)?(['"])/gi,
            (_match, openQuote, mediaPath, queryParams, closeQuote) => {
                const fullPath = queryParams ? `media_${mediaPath}${queryParams}` : `media_${mediaPath}`;
                return `${openQuote}${sourceBaseUrl}/${fullPath}${closeQuote}`;
            },
        );

        // Preserve empty structural divs by adding a paragraph with non-breaking space
        // DA.live/Helix strips completely empty elements during processing
        // These empty divs are important for EDS blocks (e.g., header expects 3 sections)
        // Pattern: <div></div> or <div> </div> (with only whitespace)
        // Using <p>&nbsp;</p> which DA.live preserves during round-trip conversion
        transformed = transformed.replace(
            /<div>(\s*)<\/div>/gi,
            '<div><p>&nbsp;</p></div>',
        );

        // Wrap in expected document structure
        // DA.live expects: <body><header></header><main>{content}</main><footer></footer></body>
        return `<body><header></header><main>${transformed}</main><footer></footer></body>`;
    }

    /**
     * Build the source URL for fetching content
     */
    private buildSourceUrl(sourceBaseUrl: string, sourcePath: string, isHtmlPath: boolean): string {
        if (!isHtmlPath) {
            return `${sourceBaseUrl}${sourcePath}`;
        }
        if (sourcePath === '/' || sourcePath.endsWith('/')) {
            return `${sourceBaseUrl}${sourcePath}index.plain.html`;
        }
        return `${sourceBaseUrl}${sourcePath}.plain.html`;
    }

    /**
     * Resolve the DA.live destination path with proper file extension
     */
    private resolveDaPath(destPath: string, isHtml: boolean): string {
        let daPath = normalizePath(destPath);
        if (isHtml && !daPath.endsWith('.html')) {
            if (daPath === '' || daPath.endsWith('/')) {
                daPath = `${daPath}index.html`;
            } else {
                daPath = `${daPath}.html`;
            }
        }
        return daPath;
    }

    /**
     * Process HTML content: apply patches and transform for DA.live
     */
    private async processHtmlContent(
        sourceResponse: Response,
        sourcePath: string,
        sourceBaseUrl: string,
        contentPatchIds?: string[],
        contentPatchSource?: ContentPatchSource,
    ): Promise<Blob> {
        let htmlText = await sourceResponse.text();

        if (contentPatchIds && contentPatchIds.length > 0) {
            const { applyContentPatches } = await import('./contentPatchRegistry');
            const { html: patchedHtml, results } = await applyContentPatches(
                htmlText, sourcePath, contentPatchIds, this.logger, contentPatchSource,
            );
            htmlText = patchedHtml;

            for (const result of results) {
                if (!result.applied && result.reason) {
                    this.logger.debug(`[DA.live] Content patch '${result.patchId}' not applied to ${sourcePath}: ${result.reason}`);
                }
            }
        }

        const transformedHtml = this.transformHtmlForDaLive(htmlText, sourceBaseUrl);
        return new Blob([transformedHtml], { type: 'text/html' });
    }

    /**
     * Copy a single file with retry logic
     * Uses the /source endpoint (like storefront-tools) which creates content directly,
     * rather than /copy which requires the destination site to already exist.
     *
     * For HTML content, fetches .plain.html to get just the main content without
     * the full page wrapper, then transforms and wraps it in document structure.
     *
     * @param contentPatchIds - Optional content patch IDs to apply to HTML content
     * @param contentPatchSource - Optional external source for content patches
     */
    private async copySingleFile(
        token: string,
        source: { org: string; site: string },
        sourcePath: string,
        destination: { org: string; site: string },
        destPath: string,
        contentPatchIds?: string[],
        contentPatchSource?: ContentPatchSource,
    ): Promise<boolean> {
        const sourceBaseUrl = `https://main--${source.site}--${source.org}.aem.live`;

        const isSpreadsheet = await this.isSpreadsheetPath(sourceBaseUrl, sourcePath);
        if (isSpreadsheet) {
            return this.copySpreadsheetFile(token, source, sourcePath, destination, destPath);
        }

        const isHtmlPath = !sourcePath.match(/\.[a-z0-9]+$/i) || sourcePath.endsWith('.html');
        const sourceUrl = this.buildSourceUrl(sourceBaseUrl, sourcePath, isHtmlPath);

        for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                const sourceResponse = await fetch(sourceUrl, {
                    signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                });

                if (!sourceResponse.ok) {
                    // 404 is expected for blocks without doc pages on the CDN — log at debug
                    const logLevel = sourceResponse.status === 404 ? 'debug' : 'warn';
                    this.logger[logLevel](`[DA.live] Failed to fetch source ${sourcePath}: ${sourceResponse.status}`);
                    return false;
                }

                const contentType = sourceResponse.headers.get('content-type') || '';
                const isHtml = contentType.includes('text/html') || isHtmlPath;
                const daPath = this.resolveDaPath(destPath, isHtml);

                const contentBlob = isHtml
                    ? await this.processHtmlContent(sourceResponse, sourcePath, sourceBaseUrl, contentPatchIds, contentPatchSource)
                    : await sourceResponse.blob();

                const destUrl = `${DA_LIVE_BASE_URL}/source/${destination.org}/${destination.site}/${daPath}`;
                const formData = new FormData();
                formData.append('data', contentBlob);

                const response = await fetch(destUrl, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                    signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                });

                if (response.ok) return true;

                // Token expired — throw so caller can pause-and-prompt for re-auth
                if (response.status === 401) {
                    throw new DaLiveAuthError('DA.live token expired during content copy');
                }

                if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < MAX_RETRY_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
                    continue;
                }

                let errorDetail = '';
                try {
                    const errorBody = await response.text();
                    errorDetail = errorBody ? `: ${errorBody}` : '';
                } catch {
                    // Ignore if response body can't be read
                }

                this.logger.warn(`[DA.live] Copy failed for ${destPath}: ${response.status}${errorDetail}`);
                return false;
            } catch (error) {
                // Auth errors must propagate immediately — never retry or swallow
                if (error instanceof DaLiveAuthError) throw error;

                if (attempt < MAX_RETRY_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
                    continue;
                }
                this.logger.error(`[DA.live] Copy error for ${destPath}`, error as Error);
                return false;
            }
        }
        return false;
    }

    /**
     * Check if a path is a spreadsheet (Excel file in DA.live, served as JSON on CDN)
     * Spreadsheets don't have .plain.html versions, they're served as .json
     */
    private async isSpreadsheetPath(baseUrl: string, path: string): Promise<boolean> {
        // Skip paths that already have extensions or are obviously HTML
        if (path.match(/\.(html|htm)$/i) || path === '/' || path.endsWith('/')) {
            return false;
        }

        // Try fetching as JSON - spreadsheets return JSON, HTML pages return 404
        const jsonUrl = `${baseUrl}${path}.json`;
        try {
            const response = await fetch(jsonUrl, {
                method: 'HEAD',
                signal: AbortSignal.timeout(TIMEOUTS.QUICK),
            });
            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                return contentType.includes('application/json');
            }
        } catch {
            // Ignore errors - not a spreadsheet
        }
        return false;
    }

    /**
     * Copy a spreadsheet file from source to destination
     * Fetches JSON from public CDN and converts to HTML table for DA.live upload
     * (Can't use DA.live admin API for cross-org copies - no auth access to source)
     */
    private async copySpreadsheetFile(
        token: string,
        source: { org: string; site: string },
        sourcePath: string,
        destination: { org: string; site: string },
        destPath: string,
    ): Promise<boolean> {
        // Fetch JSON from public CDN (works without auth for any org)
        const sourceUrl = `https://main--${source.site}--${source.org}.aem.live${sourcePath}.json`;

        try {
            const sourceResponse = await fetch(sourceUrl, {
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });

            if (!sourceResponse.ok) {
                this.logger.warn(`[DA.live] Failed to fetch spreadsheet JSON ${sourcePath}: ${sourceResponse.status}`);
                return false;
            }

            const jsonData = await sourceResponse.json();

            // Convert JSON to HTML table format that DA.live can process
            const htmlContent = convertSpreadsheetJsonToHtml(jsonData);
            if (!htmlContent) {
                this.logger.warn(`[DA.live] Failed to convert spreadsheet ${sourcePath} to HTML`);
                return false;
            }

            // Upload as HTML to destination DA.live (will be converted to sheet)
            const destNormalizedPath = normalizePath(destPath);
            const destUrl = `${DA_LIVE_BASE_URL}/source/${destination.org}/${destination.site}/${destNormalizedPath}.html`;

            const formData = new FormData();
            formData.append('data', new Blob([htmlContent], { type: 'text/html' }));

            const response = await fetch(destUrl, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });

            if (response.ok) {
                this.logger.info(`[DA.live] Copied spreadsheet ${sourcePath}`);
                return true;
            }

            // Token expired — throw so caller can pause-and-prompt for re-auth
            if (response.status === 401) {
                throw new DaLiveAuthError('DA.live token expired during spreadsheet copy');
            }

            this.logger.warn(`[DA.live] Failed to upload spreadsheet ${destPath}: ${response.status}`);
            return false;
        } catch (error) {
            if (error instanceof DaLiveAuthError) throw error;
            this.logger.error(`[DA.live] Spreadsheet copy error for ${destPath}`, error as Error);
            return false;
        }
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
        const token = await this.getImsToken();
        const normalized = normalizePath(path);
        const url = `${DA_LIVE_BASE_URL}/source/${org}/${site}/${normalized}`;

        const formData = new FormData();
        formData.append('data', new Blob([content], { type: 'text/html' }));
        if (options.overwrite) formData.append('overwrite', 'true');

        const response = await this.fetchWithRetry(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });

        const resultPath = `/${normalized}`;
        if (response.ok) return { success: true, path: resultPath };
        if (response.status === 409) {
            return { success: false, path: resultPath, error: 'Document already exists. Use overwrite option to replace.' };
        }
        return { success: false, path: resultPath, error: `Failed to create source: ${response.status} ${response.statusText}` };
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
        const token = await this.getImsToken();
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

            return { success: false, error: `Failed to delete: ${response.status} ${response.statusText}` };
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
    private async deleteSiteRoot(org: string, site: string): Promise<void> {
        const token = await this.getImsToken();
        const url = `${DA_LIVE_BASE_URL}/source/${org}/${site}/`;

        try {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });

            if (response.ok || response.status === 404) {
                this.logger.debug(`[DA.live] Site root deleted for ${org}/${site} (status=${response.status})`);
            } else {
                this.logger.debug(`[DA.live] Site root deletion returned ${response.status} for ${org}/${site}`);
            }
        } catch (error) {
            this.logger.debug(`[DA.live] Site root deletion failed for ${org}/${site}: ${(error as Error).message}`);
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
        const stripPrefix = (entryPath: string): string =>
            entryPath.replace(pathPrefix, '') || '/';

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

            this.logger.info(`[DA.live] Found ${filePaths.length} files and ${dirPaths.length} directories to delete`);

            // Phase 2: Delete files in parallel batches
            let deletedCount = 0;
            for (let i = 0; i < filePaths.length; i += CONTENT_COPY_BATCH_SIZE) {
                const batch = filePaths.slice(i, i + CONTENT_COPY_BATCH_SIZE);
                await Promise.all(batch.map(async (filePath) => {
                    const result = await this.deleteSource(org, site, filePath);
                    if (result.success) {
                        deletedCount++;
                        onProgress?.({ deleted: deletedCount, current: filePath });
                    }
                }));
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
            this.logger.error(`[DA.live] Failed to delete site content: ${(error as Error).message}`);
            return { success: false, deletedCount: filePaths.length, deletedPaths: filePaths, error: (error as Error).message };
        }
    }

    /**
     * Create a JSON spreadsheet in DA.live's native format
     *
     * DA.live stores spreadsheets as .json files with a specific format.
     * This method creates the JSON directly and uploads it.
     *
     * @param org - Organization name
     * @param site - Site name
     * @param destPath - Destination path (without extension - .json will be added)
     * @param headers - Column headers (will be used as keys in data objects)
     * @param rows - Array of row data (each row is an object with keys matching headers)
     * @param options - Options {overwrite}
     * @returns Result with success status and path
     */
    async createJsonSpreadsheet(
        org: string,
        site: string,
        destPath: string,
        headers: string[],
        rows: Array<Record<string, string>>,
        options: { overwrite?: boolean } = {},
    ): Promise<DaLiveSourceResult> {
        const token = await this.getImsToken();

        // Create DA.live native JSON spreadsheet format
        const spreadsheetJson = {
            data: {
                total: rows.length,
                limit: rows.length,
                offset: 0,
                data: rows,
                ':colWidths': headers.map(() => 300), // Default column widths
            },
            ':names': ['data'],
            ':version': 3,
            ':type': 'multi-sheet',
        };

        // Upload with .json extension
        const normalized = normalizePath(destPath);
        const jsonPath = normalized.endsWith('.json') ? normalized : `${normalized}.json`;
        const url = `${DA_LIVE_BASE_URL}/source/${org}/${site}/${jsonPath}`;

        const formData = new FormData();
        formData.append('data', new Blob([JSON.stringify(spreadsheetJson)], {
            type: 'application/json',
        }));
        if (options.overwrite) formData.append('overwrite', 'true');

        const response = await this.fetchWithRetry(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });

        const resultPath = `/${jsonPath}`;
        if (response.ok) return { success: true, path: resultPath };
        if (response.status === 409) {
            return { success: false, path: resultPath, error: 'Document already exists. Use overwrite option to replace.' };
        }
        return { success: false, path: resultPath, error: `Failed to create spreadsheet: ${response.status} ${response.statusText}` };
    }

    /**
     * Create block library from a template's component-definition.json
     *
     * Fetches component-definition.json from the template repo, extracts blocks,
     * and creates library configuration in DA.live. Non-blocking - returns
     * gracefully if template has no blocks or file doesn't exist.
     *
     * @param org - Destination DA.live organization (user's site)
     * @param site - Destination DA.live site (user's site)
     * @param templateOwner - GitHub owner of template repo
     * @param templateRepo - GitHub repo name of template
     * @param getFileContent - Function to fetch file from GitHub (from GitHubFileOperations)
     * @param libraryContentSources - DA.live sites whose published block doc pages should be
     *   copied via public CDN for blocks that lack unsafeHTML auto-generation
     * @param installedBlockIds - Block IDs installed from block collections; when provided,
     *   CDN doc page copy is restricted to only these blocks (skips native template blocks)
     * @returns Result with success status, block count, and paths created (for publishing)
     */
    async createBlockLibraryFromTemplate(
        org: string,
        site: string,
        templateOwner: string,
        templateRepo: string,
        getFileContent: (owner: string, repo: string, path: string) => Promise<{ content: string; sha: string } | null>,
        libraryContentSources?: Array<{ org: string; site: string }>,
        installedBlockIds?: string[],
    ): Promise<{ success: boolean; blocksCount: number; paths: string[]; error?: string }> {
        try {
            const componentDef = await getFileContent(templateOwner, templateRepo, 'component-definition.json');

            if (!componentDef?.content) {
                this.logger.debug('[DA.live] No component-definition.json in template');
                return { success: true, blocksCount: 0, paths: [] };
            }

            // GitHubFileOperations.getFileContent already decodes base64
            const parsed = JSON.parse(componentDef.content);

            // Scan ALL groups (not just 'blocks') so entries in other groups
            // like 'product' (product-teaser) are included in the library.
            const blocks = (parsed.groups ?? []).flatMap(
                (g: { components?: Array<{ title: string; id: string; plugins?: { da?: { unsafeHTML?: string } } }> }) =>
                    (g.components ?? []).map(c => ({
                        title: c.title,
                        id: c.id,
                        exampleHtml: c.plugins?.da?.unsafeHTML,
                    })),
            );

            if (blocks.length === 0) {
                this.logger.debug('[DA.live] No blocks found in component-definition.json');
                return { success: true, blocksCount: 0, paths: [] };
            }

            return await this.createBlockLibrary(org, site, blocks, libraryContentSources, installedBlockIds);
        } catch (error) {
            this.logger.warn(`[DA.live] Block library from template failed: ${(error as Error).message}`);
            return { success: false, blocksCount: 0, paths: [], error: (error as Error).message };
        }
    }

    /**
     * Create block library configuration in DA.live
     *
     * Creates a single "Blocks" spreadsheet at /.da/library/blocks.json and
     * registers it in the site config. DA.live's library UI only renders
     * block lists for sections titled exactly "Blocks" — custom-named sections
     * are treated as iframe plugins and render blank.
     *
     * @param org - Destination organization (user's site)
     * @param site - Destination site name (user's site)
     * @param blocks - Array of block definitions
     * @returns Result with success status, block count, and paths created (for publishing)
     */
    private async createBlockLibrary(
        org: string,
        site: string,
        blocks: Array<{ title: string; id: string; exampleHtml?: string }>,
        libraryContentSources?: Array<{ org: string; site: string }>,
        installedBlockIds?: string[],
    ): Promise<{ success: boolean; blocksCount: number; paths: string[]; error?: string }> {
        if (blocks.length === 0) {
            return { success: true, blocksCount: 0, paths: [] };
        }

        try {
            // Create doc pages for blocks that have exampleHtml but no existing page
            await this.ensureBlockDocPages(org, site, blocks);

            // Copy doc pages from library content sources for blocks without
            // unsafeHTML. Uses the public CDN (.plain.html) to avoid requiring
            // DA.live API auth on third-party source orgs.
            if (libraryContentSources?.length) {
                await this.copyBlockDocPagesFromSources(org, site, blocks, libraryContentSources, installedBlockIds);
            }

            // Generate stub doc pages for any blocks still without documentation.
            // Runs after ensureBlockDocPages and copyBlockDocPagesFromSources so it
            // only creates stubs for blocks that couldn't be sourced from anywhere else.
            // Covers all blocks — not just installedBlockIds — because deduplicated
            // blocks (present in both template and a library) are skipped during
            // installation and never appear in installedBlockIds.
            await this.generateStubDocPages(org, site, blocks);

            // Check which blocks have documentation pages (including newly created ones)
            const existingBlockIds = await this.getBlocksWithDocs(org, site, blocks);
            const verifiedBlocks = blocks.filter(b => existingBlockIds.includes(b.id));

            if (verifiedBlocks.length === 0) {
                this.logger.info(`[DA.live] No blocks with documentation pages found in ${org}/${site}`);
                return { success: true, blocksCount: 0, paths: [] };
            }

            const contentBase = `https://content.da.live/${org}/${site}/.da/library/blocks`;
            const paths: string[] = [];

            // Clean up any existing library spreadsheet files (including grouped ones from previous runs)
            await this.deleteSource(org, site, '.da/library/blocks.json');
            await this.deleteSource(org, site, '.da/library/blocks.html');
            await this.deleteSource(org, site, '.da/library/blocks.xlsx');
            await this.deleteSource(org, site, '.da/library/storefront-blocks.json');
            await this.deleteSource(org, site, '.da/library/storefront-blocks.html');
            await this.deleteSource(org, site, '.da/library/block-collection.json');
            await this.deleteSource(org, site, '.da/library/block-collection.html');

            // Register single "Blocks" section in site config
            const configResult = await this.updateSiteConfig(org, site, [
                {
                    title: 'Blocks',
                    path: `https://content.da.live/${org}/${site}/.da/library/blocks.json`,
                },
            ]);
            if (!configResult.success) {
                this.logger.warn(`[DA.live] Failed to update config: ${configResult.error}`);
            }

            // Create single spreadsheet with all verified blocks
            const blocksResult = await this.createJsonSpreadsheet(
                org, site, '.da/library/blocks',
                ['name', 'path'],
                verifiedBlocks.map(b => ({ name: b.title, path: `${contentBase}/${b.id}` })),
                { overwrite: true },
            );
            if (!blocksResult.success) {
                return { success: false, blocksCount: 0, paths: [], error: 'Failed to create /.da/library/blocks.json' };
            }

            paths.push('.da/library/blocks.json');

            this.logger.info(`[DA.live] Block library created: ${verifiedBlocks.length}/${blocks.length} blocks with docs in ${org}/${site}`);

            // Add block doc pages to paths for publishing
            for (const blockId of existingBlockIds) {
                paths.push(`.da/library/blocks/${blockId}`);
            }

            return { success: true, blocksCount: verifiedBlocks.length, paths };
        } catch (error) {
            this.logger.error(`[DA.live] Block library creation failed: ${(error as Error).message}`);
            return { success: false, blocksCount: 0, paths: [], error: (error as Error).message };
        }
    }

    /**
     * Create documentation pages for blocks that have exampleHtml but no existing page.
     *
     * Non-destructive: only creates pages for blocks missing from DA.live.
     * Blocks that already have doc pages (e.g., copied from a library content
     * source) are left untouched — the authored page is higher quality than
     * the generated one. Failures are logged but don't halt the pipeline.
     *
     * @param org - Organization name
     * @param site - Site name
     * @param blocks - Array of block definitions (may include exampleHtml)
     */
    private async ensureBlockDocPages(
        org: string,
        site: string,
        blocks: Array<{ title: string; id: string; exampleHtml?: string }>,
    ): Promise<void> {
        const blocksWithHtml = blocks.filter(b => b.exampleHtml);
        if (blocksWithHtml.length === 0) return;

        // Check which blocks already have doc pages (e.g., copied from content source)
        const existingIds = new Set(await this.getBlocksWithDocs(org, site, blocksWithHtml));
        const missing = blocksWithHtml.filter(b => !existingIds.has(b.id));

        if (missing.length === 0) {
            this.logger.debug('[DA.live] All blocks with exampleHtml already have doc pages');
            return;
        }

        this.logger.info(`[DA.live] Creating ${missing.length} block doc pages (${existingIds.size} already exist)`);

        // Create doc pages in parallel batches to match content copy performance pattern
        for (let i = 0; i < missing.length; i += CONTENT_COPY_BATCH_SIZE) {
            const batch = missing.slice(i, i + CONTENT_COPY_BATCH_SIZE);
            await Promise.all(batch.map(async (block) => {
                try {
                    // Wrap exampleHtml in document structure expected by DA.live.
                    // Block must be inside a section <div> — DA.live treats direct
                    // children of <main> as sections, not blocks. This matches the
                    // format produced by .plain.html (content source copy path).
                    const docHtml = `<body><header></header><main><div>${block.exampleHtml}</div></main><footer></footer></body>`;
                    const result = await this.createSource(
                        org, site,
                        `.da/library/blocks/${block.id}.html`,
                        docHtml,
                    );
                    if (result.success) {
                        this.logger.debug(`[DA.live] Created doc page for block: ${block.id}`);
                    } else {
                        this.logger.warn(`[DA.live] Failed to create doc page for ${block.id}: ${result.error}`);
                    }
                } catch (error) {
                    this.logger.warn(`[DA.live] Failed to create doc page for ${block.id}: ${(error as Error).message}`);
                }
            }));
        }
    }

    /**
     * Copy block doc pages from library content sources via public CDN.
     *
     * For blocks without unsafeHTML (no auto-generated doc page), fetches each
     * block's doc page from each content source's public CDN and writes it to
     * the destination site. Tries content sources in order and stops at the
     * first successful fetch per block.
     *
     * Uses the CDN (.plain.html) instead of the DA.live /list/ API so that no
     * API auth is required on the source org — only the destination needs auth.
     *
     * @param org - Destination DA.live organization
     * @param site - Destination DA.live site
     * @param blocks - All block definitions (filters to those without unsafeHTML)
     * @param contentSources - Library content sources to fetch doc pages from
     */
    private async copyBlockDocPagesFromSources(
        org: string,
        site: string,
        blocks: Array<{ id: string; exampleHtml?: string }>,
        contentSources: Array<{ org: string; site: string }>,
        installedBlockIds?: string[],
    ): Promise<void> {
        // Only need CDN copy for blocks WITHOUT unsafeHTML —
        // blocks WITH unsafeHTML are handled by ensureBlockDocPages
        let blocksNeedingCdnCopy = blocks.filter(b => !b.exampleHtml);

        // When installedBlockIds is provided, only attempt CDN copy for blocks
        // installed by block collections. Native template blocks won't have doc
        // pages on library content sources, so attempting them produces 404 spam.
        if (installedBlockIds?.length) {
            const installedSet = new Set(installedBlockIds);
            blocksNeedingCdnCopy = blocksNeedingCdnCopy.filter(b => installedSet.has(b.id));
        }
        if (blocksNeedingCdnCopy.length === 0) return;

        // Check which blocks already have doc pages (e.g., copied by copyContent
        // from an owned org). Only CDN-fetch the ones still missing.
        const existingIds = new Set(await this.getBlocksWithDocs(org, site, blocksNeedingCdnCopy));
        const missing = blocksNeedingCdnCopy.filter(b => !existingIds.has(b.id));
        if (missing.length === 0) return;

        const token = await this.getImsToken();
        let copiedCount = 0;

        for (const block of missing) {
            const docPath = `/.da/library/blocks/${block.id}`;
            for (const source of contentSources) {
                const success = await this.copySingleFile(
                    token, source, docPath,
                    { org, site }, docPath,
                );
                if (success) {
                    copiedCount++;
                    break; // Found in this source, move to next block
                }
            }
        }

        if (copiedCount > 0) {
            this.logger.info(`[DA.live] Copied ${copiedCount} block doc pages from CDN (${existingIds.size} already existed)`);
        }
    }

    /**
     * Generate stub documentation pages for blocks that have no doc page.
     *
     * Runs after ensureBlockDocPages and copyBlockDocPagesFromSources as a final
     * fallback. Creates a minimal valid DA.live page for every block still missing
     * documentation so that all blocks in component-definition.json appear in the
     * library UI.
     *
     * Covers all blocks — not just those installed from external libraries — because
     * blocks deduplicated during library installation (already present in the template)
     * never appear in installedBlockIds but still need stubs if the template has no
     * doc page for them.
     *
     * Non-destructive: only creates pages for blocks with no existing doc page.
     * Blocks with unsafeHTML (handled by ensureBlockDocPages) are skipped.
     *
     * @param org - Destination DA.live organization
     * @param site - Destination DA.live site
     * @param blocks - All block definitions from component-definition.json
     */
    private async generateStubDocPages(
        org: string,
        site: string,
        blocks: Array<{ title: string; id: string; exampleHtml?: string }>,
    ): Promise<void> {
        // Only stub blocks without unsafeHTML — blocks with unsafeHTML
        // already have proper doc pages from ensureBlockDocPages
        const candidates = blocks.filter(b => !b.exampleHtml);
        if (candidates.length === 0) return;

        const existingIds = new Set(await this.getBlocksWithDocs(org, site, candidates));
        const missing = candidates.filter(b => !existingIds.has(b.id));
        if (missing.length === 0) return;

        this.logger.info(`[DA.live] Generating ${missing.length} stub doc pages for installed blocks without documentation`);

        // Create stub pages in parallel batches to match content copy performance pattern
        for (let i = 0; i < missing.length; i += CONTENT_COPY_BATCH_SIZE) {
            const batch = missing.slice(i, i + CONTENT_COPY_BATCH_SIZE);
            await Promise.all(batch.map(async (block) => {
                try {
                    const stubHtml = `<body><header></header><main><div><div class="${block.id}"><div><div><p>${block.title}</p></div></div></div></div></main><footer></footer></body>`;
                    const result = await this.createSource(org, site, `.da/library/blocks/${block.id}.html`, stubHtml);
                    if (result.success) {
                        this.logger.debug(`[DA.live] Created stub doc page for block: ${block.id}`);
                    } else {
                        this.logger.warn(`[DA.live] Failed to create stub doc page for ${block.id}: ${result.error}`);
                    }
                } catch (error) {
                    this.logger.warn(`[DA.live] Failed to create stub doc page for ${block.id}: ${(error as Error).message}`);
                }
            }));
        }
    }

    /**
     * Check which blocks have documentation pages on DA.live
     *
     * Performs HEAD requests to determine which blocks have doc pages.
     * Used to filter the block library to only include usable blocks.
     *
     * @param org - Organization name
     * @param site - Site name
     * @param blocks - Array of block definitions to check
     * @returns Array of block IDs that have documentation pages
     */
    private async getBlocksWithDocs(
        org: string,
        site: string,
        blocks: Array<{ id: string }>,
    ): Promise<string[]> {
        const token = await this.getImsToken();
        const existingIds: string[] = [];

        for (const block of blocks) {
            try {
                const blockDocUrl = `${DA_LIVE_BASE_URL}/source/${org}/${site}/.da/library/blocks/${block.id}.html`;
                const response = await fetch(blockDocUrl, {
                    method: 'HEAD',
                    headers: { Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                });
                if (response.ok) {
                    existingIds.push(block.id);
                }
            } catch {
                // Block doc doesn't exist or network error — skip this block
            }
        }

        return existingIds;
    }

    /**
     * Update site config via DA.live /config/ API
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
    private async updateSiteConfig(
        org: string,
        site: string,
        libraryEntries: Array<{ title: string; path: string }>,
    ): Promise<{ success: boolean; error?: string }> {
        const token = await this.getImsToken();

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
     * Get content paths by recursively listing all content on the source DA.live site.
     *
     * Uses the authenticated DA.live list API to enumerate every file,
     * then filters to content types (.html, .xlsx) and strips extensions
     * so the returned paths match the format expected by copySingleFile.
     *
     * This is more complete than getContentPathsFromIndex because the CDN
     * content index excludes fragment documents (nav, footer) and some
     * spreadsheets that are not indexed.
     *
     * @param org - Source organization name
     * @param site - Source site name
     * @returns Array of content paths (extension-free, e.g. '/nav', '/about')
     */
    async getContentPathsFromDaLive(org: string, site: string): Promise<string[]> {
        const contentPaths: string[] = [];
        const pathPrefix = `/${org}/${site}`;
        const contentExtensions = new Set(['.html', '.xlsx']);

        const stripPrefix = (entryPath: string): string =>
            entryPath.replace(pathPrefix, '') || '/';

        const stripExtension = (filePath: string, ext: string): string =>
            filePath.slice(0, -ext.length);

        const collectPaths = async (dirPath: string): Promise<void> => {
            const entries = await this.listDirectory(org, site, dirPath);

            for (const entry of entries) {
                if (entry.ext) {
                    // File — include only content types
                    if (contentExtensions.has(entry.ext)) {
                        const relativePath = stripPrefix(entry.path);
                        contentPaths.push(stripExtension(relativePath, entry.ext));
                    }
                } else {
                    // Directory — recurse
                    const relativePath = stripPrefix(entry.path);
                    await collectPaths(relativePath);
                }
            }
        };

        await collectPaths('/');
        return contentPaths;
    }

    /**
     * Get content paths from a content source index
     *
     * Fetches the content index (e.g., full-index.json) from the source site
     * and returns the list of content paths. This is useful for operations
     * that need to know what content exists before copying it.
     *
     * @param source - Source content configuration (org, site, indexUrl)
     * @returns Array of content paths from the index
     */
    async getContentPathsFromIndex(source: DaLiveContentSource): Promise<string[]> {
        const indexResponse = await fetch(source.indexUrl);
        if (!indexResponse.ok) {
            throw new DaLiveError(
                `Failed to fetch content index from ${source.org}/${source.site}`,
                'INDEX_FETCH_ERROR',
                indexResponse.status,
            );
        }

        const indexData = await indexResponse.json();
        return indexData.data?.map((item: { path: string }) => item.path) || [];
    }

    /**
     * Copy content from source site to destination site
     * @param source - Source content configuration (org, site, indexUrl)
     * @param destOrg - Destination organization
     * @param destSite - Destination site
     * @param progressCallback - Optional progress callback
     * @param contentPatchIds - Optional content patch IDs to apply
     * @param contentPatchSource - Optional external source for content patches
     * @returns Copy result
     */
    async copyContentFromSource(
        source: DaLiveContentSource,
        destOrg: string,
        destSite: string,
        progressCallback?: DaLiveProgressCallback,
        contentPatchIds?: string[],
        contentPatchSource?: ContentPatchSource,
    ): Promise<DaLiveCopyResult> {
        // Report initialization progress
        progressCallback?.({ processed: 0, total: 0, percentage: 0, message: 'Enumerating source content...' });

        // Enumerate content paths: prefer DA.live list API (complete), fall back to CDN index.
        // The list API returns 404 (mapped to empty array) for orgs the user doesn't belong to,
        // so also fall back when it succeeds but returns 0 paths.
        let contentPaths: string[];
        let usedDaLiveList = false;

        try {
            contentPaths = await this.getContentPathsFromDaLive(source.org, source.site);
            if (contentPaths.length > 0) {
                usedDaLiveList = true;
                this.logger.info(`[DA.live] Enumerated ${contentPaths.length} content files via list API`);
            } else {
                this.logger.info(`[DA.live] List API returned 0 files, falling back to content index`);
                contentPaths = await this.getContentPathsFromIndex(source);
            }
        } catch {
            this.logger.info(`[DA.live] List API unavailable, falling back to content index`);
            contentPaths = await this.getContentPathsFromIndex(source);
        }

        // Filter out product overlay documents (keep only /products/default)
        const originalCount = contentPaths.length;
        contentPaths = filterProductOverlays(contentPaths);
        const filteredCount = originalCount - contentPaths.length;
        if (filteredCount > 0) {
            this.logger.info(`[DA.live] Filtered ${filteredCount} product overlay paths`);
        }

        // Filter out ONLY the .da/library/blocks spreadsheet - we generate our own with correct paths
        // The template's spreadsheet has paths pointing to the template site, not the user's site
        // Note: The index may appear as /.da/library/blocks or /.da/library/blocks.json in full-index.json
        // BUT: Keep the individual block documentation pages (/.da/library/blocks/hero, etc.)
        // which contain example HTML and should be copied from the template
        const libraryIndexPaths = ['/.da/library/blocks', '/.da/library/blocks.json'];
        const preLibraryCount = contentPaths.length;
        contentPaths = contentPaths.filter(p => !libraryIndexPaths.includes(p));
        if (contentPaths.length < preLibraryCount) {
            this.logger.info(`[DA.live] Excluded library index (will be generated with correct paths)`);
        }

        progressCallback?.({ processed: 0, total: 0, percentage: 0, message: 'Checking configurations...' });

        // Auth pages missing from source — stubs created after the main copy loop
        const missingAuthPages: Array<{ path: string; blockClass: string }> = [];

        // When using CDN index fallback, add essential content that may not
        // be in the content index. The DA.live list API already returns
        // everything, so this is only needed for the fallback path.
        if (!usedDaLiveList) {
            const baseUrl = `https://main--${source.site}--${source.org}.aem.live`;

            // Spreadsheets: served as .json on CDN, stored as .xlsx on DA.live
            const essentialSpreadsheets = ['/placeholders', '/redirects', '/metadata', '/sitemap'];
            for (const configPath of essentialSpreadsheets) {
                if (!contentPaths.includes(configPath)) {
                    try {
                        const response = await fetch(`${baseUrl}${configPath}.json`, { method: 'HEAD' });
                        if (response.ok) {
                            contentPaths.unshift(configPath);
                        }
                    } catch {
                        // Doesn't exist, skip
                    }
                }
            }

            // HTML fragment documents (nav, footer): not indexed but loaded at runtime
            const essentialFragments = ['/nav', '/footer'];
            for (const fragmentPath of essentialFragments) {
                if (!contentPaths.includes(fragmentPath)) {
                    try {
                        const response = await fetch(`${baseUrl}${fragmentPath}`, { method: 'HEAD' });
                        if (response.ok) {
                            contentPaths.unshift(fragmentPath);
                        }
                    } catch {
                        // Doesn't exist, skip
                    }
                }
            }

            // Customer auth pages: dropin-rendered pages not in content index but
            // needed for login/account flows. Probe source CDN and copy if they exist.
            // Pages not on source get stubs with correct block markup in the destination.
            const essentialAuthPages: Array<{ path: string; blockClass: string }> = [
                { path: '/customer/login', blockClass: 'commerce-login' },
                { path: '/customer/account', blockClass: 'commerce-account' },
                { path: '/customer/create-account', blockClass: 'commerce-create-account' },
            ];
            for (const authPage of essentialAuthPages) {
                if (!contentPaths.includes(authPage.path)) {
                    try {
                        const response = await fetch(`${baseUrl}${authPage.path}`, { method: 'HEAD' });
                        if (response.ok) {
                            contentPaths.unshift(authPage.path);
                        } else {
                            missingAuthPages.push(authPage);
                        }
                    } catch {
                        missingAuthPages.push(authPage);
                    }
                }
            }
        }

        const copiedFiles: string[] = [];
        const failedFiles: { path: string; error: string }[] = [];
        let totalFiles = contentPaths.length;

        // Copy files in parallel batches for improved performance (~5x faster)
        const contentStart = Date.now();
        for (let i = 0; i < contentPaths.length; i += CONTENT_COPY_BATCH_SIZE) {
            const batch = contentPaths.slice(i, i + CONTENT_COPY_BATCH_SIZE);
            const token = await this.getImsToken();
            const batchNum = Math.floor(i / CONTENT_COPY_BATCH_SIZE) + 1;
            const batchStart = Date.now();

            // Report progress at batch start
            if (progressCallback) {
                progressCallback({
                    currentFile: batch[0],
                    processed: i,
                    total: totalFiles,
                    percentage: Math.round((i / totalFiles) * 100),
                });
            }

            // Copy batch in parallel
            const results = await Promise.all(
                batch.map(async (sourcePath) => {
                    const success = await this.copySingleFile(
                        token,
                        { org: source.org, site: source.site },
                        sourcePath,
                        { org: destOrg, site: destSite },
                        sourcePath,
                        contentPatchIds,
                        contentPatchSource,
                    );
                    return { path: sourcePath, success };
                }),
            );

            this.logger.debug(`[DA.live] Content batch ${batchNum}: ${batch.length} files in ${formatDuration(Date.now() - batchStart)}`);

            // Track results
            for (const result of results) {
                if (result.success) {
                    copiedFiles.push(result.path);
                } else {
                    failedFiles.push({ path: result.path, error: 'Copy failed' });
                }
            }
        }
        this.logger.debug(`[DA.live] Content copy total: ${totalFiles} files in ${formatDuration(Date.now() - contentStart)}`);

        // Create stub pages for auth pages that don't exist on source.
        // Each stub uses the correct block class so the dropin renders properly.
        if (missingAuthPages.length > 0) {
            const token = await this.getImsToken();
            for (const { path: authPath, blockClass } of missingAuthPages) {
                try {
                    const daPath = this.resolveDaPath(authPath, true);
                    const stubHtml = [
                        '<body><header></header><main><div>',
                        `<div class="${blockClass}"><div><div></div></div></div>`,
                        '</div></main><footer></footer></body>',
                    ].join('');
                    const blob = new Blob([stubHtml], { type: 'text/html' });
                    const formData = new FormData();
                    formData.append('data', blob);

                    const destUrl = `${DA_LIVE_BASE_URL}/source/${destOrg}/${destSite}/${daPath}`;
                    const response = await fetch(destUrl, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` },
                        body: formData,
                        signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                    });

                    if (response.ok) {
                        copiedFiles.push(authPath);
                        totalFiles++;
                        this.logger.info(`[DA.live] Created stub page for ${authPath}`);
                    } else {
                        this.logger.warn(`[DA.live] Failed to create stub for ${authPath}: ${response.status}`);
                    }
                } catch (error) {
                    this.logger.warn(`[DA.live] Failed to create stub for ${authPath}: ${(error as Error).message}`);
                }
            }
        }

        // Final progress update
        if (progressCallback) {
            progressCallback({
                processed: totalFiles,
                total: totalFiles,
                percentage: 100,
            });
        }

        return {
            success: failedFiles.length === 0,
            copiedFiles,
            failedFiles,
            totalFiles,
        };
    }

    /**
     * Copy media files from source site to destination site
     * Recursively copies all files from /media/ folder
     *
     * @param source - Source site configuration (org, site)
     * @param destOrg - Destination organization
     * @param destSite - Destination site
     * @param contentPaths - Content paths that were copied (to scan for media references)
     * @param progressCallback - Optional progress callback
     * @returns Copy result with success status and file lists
     */
    async copyMediaFromContent(
        source: { org: string; site: string },
        destOrg: string,
        destSite: string,
        contentPaths: string[],
        progressCallback?: DaLiveProgressCallback,
    ): Promise<DaLiveCopyResult> {
        const baseUrl = `https://main--${source.site}--${source.org}.aem.live`;

        // Collect unique media references from all content pages
        const mediaSet = new Set<string>();

        this.logger.info(`[DA.live] Scanning ${contentPaths.length} content pages for media references`);

        for (const contentPath of contentPaths) {
            try {
                const response = await fetch(`${baseUrl}${contentPath}`, {
                    signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                });

                if (response.ok) {
                    const html = await response.text();
                    // Match Helix media pattern: media_<hash>.<ext>
                    // These appear as ./media_xxx or /media_xxx in the HTML
                    const mediaMatches = html.match(/(?:\.\/|\/)(media_[a-f0-9]+\.[a-z0-9]+)/gi);
                    if (mediaMatches) {
                        for (const match of mediaMatches) {
                            // Normalize to /media_xxx format
                            const mediaPath = '/' + match.replace(/^\.?\//, '');
                            mediaSet.add(mediaPath);
                        }
                    }
                }
            } catch {
                // Skip errors, continue scanning other pages
            }
        }

        const mediaPaths = Array.from(mediaSet);

        if (mediaPaths.length === 0) {
            this.logger.debug('[DA.live] No media references found in content');
            return {
                success: true,
                copiedFiles: [],
                failedFiles: [],
                totalFiles: 0,
            };
        }

        this.logger.info(`[DA.live] Found ${mediaPaths.length} unique media files to copy`);

        const copiedFiles: string[] = [];
        const failedFiles: { path: string; error: string }[] = [];
        const totalFiles = mediaPaths.length;

        // Copy media files in parallel batches for improved performance (~5x faster)
        const mediaStart = Date.now();
        for (let i = 0; i < mediaPaths.length; i += CONTENT_COPY_BATCH_SIZE) {
            const batch = mediaPaths.slice(i, i + CONTENT_COPY_BATCH_SIZE);
            const token = await this.getImsToken();
            const batchNum = Math.floor(i / CONTENT_COPY_BATCH_SIZE) + 1;
            const batchStart = Date.now();

            // Report progress at batch start
            if (progressCallback) {
                progressCallback({
                    currentFile: batch[0],
                    processed: i,
                    total: totalFiles,
                    percentage: Math.round((i / totalFiles) * 100),
                });
            }

            // Copy batch in parallel
            const results = await Promise.all(
                batch.map(async (mediaPath) => {
                    const success = await this.copySingleFile(
                        token,
                        { org: source.org, site: source.site },
                        mediaPath,
                        { org: destOrg, site: destSite },
                        mediaPath,
                    );
                    return { path: mediaPath, success };
                }),
            );

            this.logger.debug(`[DA.live] Media batch ${batchNum}: ${batch.length} files in ${formatDuration(Date.now() - batchStart)}`);

            // Track results
            for (const result of results) {
                if (result.success) {
                    copiedFiles.push(result.path);
                } else {
                    failedFiles.push({ path: result.path, error: 'Copy failed' });
                }
            }
        }
        this.logger.debug(`[DA.live] Media copy total: ${totalFiles} files in ${formatDuration(Date.now() - mediaStart)}`);

        // Final progress update
        if (progressCallback) {
            progressCallback({
                processed: totalFiles,
                total: totalFiles,
                percentage: 100,
            });
        }

        return {
            success: failedFiles.length === 0,
            copiedFiles,
            failedFiles,
            totalFiles,
        };
    }

    /**
     * Recursively collect all media file entries from a folder
     * @param org - Organization name
     * @param site - Site name
     * @param path - Starting path (e.g., '/media')
     * @returns Array of file entries (folders are traversed, not returned)
     */
    private async _collectMediaFiles(org: string, site: string, path: string): Promise<DaLiveEntry[]> {
        const files: DaLiveEntry[] = [];

        // listDirectory returns empty array for 404 (graceful handling)
        const entries = await this.listDirectory(org, site, path);

        for (const entry of entries) {
            const isFolder = !entry.ext;

            if (isFolder) {
                // Recursively collect from subfolder
                const relativePath = entry.path.replace(`/${org}/${site}`, '');
                const subFiles = await this._collectMediaFiles(org, site, relativePath);
                files.push(...subFiles);
            } else {
                // It's a file - add to collection
                files.push(entry);
            }
        }

        return files;
    }

    /**
     * Copy media files from local project directory to DA.live
     * Reads from local filesystem instead of calling DA.live API on source org.
     *
     * @param localProjectPath - Local project directory path
     * @param destOrg - Destination DA.live organization
     * @param destSite - Destination DA.live site
     * @param progressCallback - Optional progress callback
     * @returns Copy result with success status and file lists
     */
    async copyMediaFromLocalPath(
        localProjectPath: string,
        destOrg: string,
        destSite: string,
        progressCallback?: DaLiveProgressCallback,
    ): Promise<DaLiveCopyResult> {
        const token = await this.getImsToken();
        const mediaDir = path.join(localProjectPath, 'media');

        // Check if media directory exists
        if (!fs.existsSync(mediaDir)) {
            this.logger.debug('[DA.live] No local media directory found, skipping media copy');
            return {
                success: true,
                copiedFiles: [],
                failedFiles: [],
                totalFiles: 0,
            };
        }

        // Collect all media files recursively from local filesystem
        const mediaFiles = this.collectLocalMediaFiles(mediaDir, mediaDir);

        if (mediaFiles.length === 0) {
            this.logger.debug('[DA.live] No media files found in local /media/ folder');
            return {
                success: true,
                copiedFiles: [],
                failedFiles: [],
                totalFiles: 0,
            };
        }

        this.logger.info(`[DA.live] Found ${mediaFiles.length} local media files to upload`);

        const copiedFiles: string[] = [];
        const failedFiles: { path: string; error: string }[] = [];
        const totalFiles = mediaFiles.length;

        // Upload each media file
        for (let i = 0; i < mediaFiles.length; i++) {
            const { localPath, relativePath } = mediaFiles[i];

            // Report progress
            if (progressCallback) {
                progressCallback({
                    currentFile: relativePath,
                    processed: i,
                    total: totalFiles,
                    percentage: Math.round((i / totalFiles) * 100),
                });
            }

            // Upload the file
            const success = await this.uploadLocalFile(
                token,
                localPath,
                destOrg,
                destSite,
                `/media${relativePath}`,
            );

            if (success) {
                copiedFiles.push(`/media${relativePath}`);
            } else {
                failedFiles.push({ path: `/media${relativePath}`, error: 'Upload failed' });
            }
        }

        // Final progress update
        if (progressCallback) {
            progressCallback({
                processed: totalFiles,
                total: totalFiles,
                percentage: 100,
            });
        }

        return {
            success: failedFiles.length === 0,
            copiedFiles,
            failedFiles,
            totalFiles,
        };
    }

    /**
     * Recursively collect all files from a local directory
     * @param baseDir - Base directory for relative path calculation
     * @param currentDir - Current directory being scanned
     * @returns Array of { localPath, relativePath } for each file
     */
    private collectLocalMediaFiles(
        baseDir: string,
        currentDir: string,
    ): Array<{ localPath: string; relativePath: string }> {
        const files: Array<{ localPath: string; relativePath: string }> = [];

        if (!fs.existsSync(currentDir)) {
            return files;
        }

        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                // Recursively collect from subdirectory
                files.push(...this.collectLocalMediaFiles(baseDir, fullPath));
            } else if (entry.isFile()) {
                // Calculate relative path from media directory
                const relativePath = fullPath.substring(baseDir.length).replace(/\\/g, '/');
                files.push({ localPath: fullPath, relativePath });
            }
        }

        return files;
    }

    /**
     * Upload a local file to DA.live
     */
    private async uploadLocalFile(
        token: string,
        localPath: string,
        destOrg: string,
        destSite: string,
        destPath: string,
    ): Promise<boolean> {
        for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                // Read local file
                const content = fs.readFileSync(localPath);
                const ext = path.extname(localPath).toLowerCase();

                // Determine content type based on extension
                const contentType = getMimeType(ext);

                // Normalize destination path
                const daPath = normalizePath(destPath);
                const destUrl = `${DA_LIVE_BASE_URL}/source/${destOrg}/${destSite}/${daPath}`;

                const formData = new FormData();
                formData.append('data', new Blob([content], { type: contentType }));

                const response = await fetch(destUrl, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                    signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                });

                if (response.ok) return true;

                // Token expired — throw so caller can pause-and-prompt for re-auth
                if (response.status === 401) {
                    throw new DaLiveAuthError('DA.live token expired during media upload');
                }

                if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < MAX_RETRY_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
                    continue;
                }

                this.logger.warn(`[DA.live] Upload failed for ${destPath}: ${response.status}`);
                return false;
            } catch (error) {
                if (error instanceof DaLiveAuthError) throw error;
                if (attempt < MAX_RETRY_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
                    continue;
                }
                this.logger.error(`[DA.live] Upload error for ${destPath}`, error as Error);
                return false;
            }
        }
        return false;
    }

    /**
     * Fetch with retry logic and timeout
     */
    private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
        for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                const response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUTS.NORMAL) });

                if (response.status === 429) {
                    const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
                    throw new DaLiveNetworkError('Rate limited. Please wait before making more requests.', retryAfter);
                }

                if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < MAX_RETRY_ATTEMPTS) {
                    this.logger.debug(`[DA.live] Retrying after ${response.status}, attempt ${attempt}`);
                    await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
                    continue;
                }

                return response;
            } catch (error) {
                if (error instanceof DaLiveAuthError || error instanceof DaLiveNetworkError) throw error;

                const errorMessage = (error as Error).message || 'Unknown error';
                if (attempt < MAX_RETRY_ATTEMPTS && !errorMessage.includes('abort')) {
                    this.logger.debug(`[DA.live] Network error, retrying: ${errorMessage}`);
                    await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
                    continue;
                }

                throw new DaLiveNetworkError(`Network error: ${errorMessage}`);
            }
        }
        throw new DaLiveNetworkError('Max retry attempts exceeded');
    }

    /**
     * Apply org-level configuration settings
     *
     * Updates the org's config sheet with settings like:
     * - aem.repositoryId: AEM Assets Delivery instance
     * - editor.path: Universal Editor path mapping
     *
     * Config sheet format uses key/value columns:
     * | key              | value                        |
     * | aem.repositoryId | author-p123-e456.adobeaem... |
     * | editor.path      | /org/site=https://...        |
     *
     * IMPORTANT: Preserves all existing sheets (permissions, etc.) - only updates the data sheet.
     *
     * @param org - DA.live organization name
     * @param configUpdates - Key-value pairs to update in the config
     * @returns Success status with optional error message
     */
    async applyOrgConfig(
        org: string,
        configUpdates: Record<string, string>,
    ): Promise<{ success: boolean; error?: string }> {
        const token = await this.getImsToken();
        const configUrl = `${DA_LIVE_BASE_URL}/config/${org}`;

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
                const dataSheet = existingConfig.data as { data?: Array<{ key: string; value: string }> } | undefined;
                existingRows = dataSheet?.data || [];
            } else if (getResponse.status === 404) {
                // No existing config — safe to create fresh (no permissions to lose)
                existingConfig = {
                    ':version': 3,
                    ':names': ['data'],
                    ':type': 'multi-sheet',
                };
            } else {
                return {
                    success: false,
                    error: `Failed to read existing org config: ${getResponse.status} ${getResponse.statusText}`,
                };
            }
        } catch (error) {
            // Network/timeout error — cannot safely write without reading first
            return {
                success: false,
                error: `Cannot read existing org config: ${(error as Error).message}`,
            };
        }

        // Convert existing rows to map for easy merging
        const configMap = new Map<string, string>();
        for (const row of existingRows) {
            if (row.key) {
                configMap.set(row.key, row.value);
            }
        }

        // Apply updates
        for (const [key, value] of Object.entries(configUpdates)) {
            configMap.set(key, value);
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

        // POST to /config/{org} API endpoint using FormData
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
                this.logger.info(`[DA.live] Org config applied for ${org}: ${Object.keys(configUpdates).join(', ')}`);
                return { success: true };
            }

            const errorText = await response.text().catch(() => '');
            return {
                success: false,
                error: `Failed to apply org config: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
            };
        } catch (error) {
            return { success: false, error: `Config API error: ${(error as Error).message}` };
        }
    }

    /**
     * Create user-friendly error from HTTP response
     */
    private createErrorFromResponse(response: Response, operation: string): DaLiveError {
        const status = response.status;
        let message: string;

        switch (status) {
            case 401:
                throw new DaLiveAuthError('Authentication expired. Please log in again.');
            case 403:
                message = `Access denied when trying to ${operation}. Check your permissions.`;
                break;
            case 404:
                message = `Resource not found when trying to ${operation}.`;
                break;
            case 500:
            case 502:
            case 503:
            case 504:
                message = `Server error occurred while trying to ${operation}. Please try again later.`;
                break;
            default:
                message = `Unexpected error (${status}) while trying to ${operation}.`;
        }

        return new DaLiveError(message, `HTTP_${status}`, status);
    }
}
