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
import { formatDuration } from '@/core/utils/timeFormatting';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import type { ContentPatchSource } from '@/types/demoPackages';
import {
    DaLiveError,
    DaLiveAuthError,
    DaLiveNetworkError,
    type DaLiveEntry,
    type DaLiveSourceResult,
    type DaLiveCopyResult,
    type DaLiveProgressCallback,
} from './types';
import {
    DA_LIVE_BASE_URL,
    MAX_RETRY_ATTEMPTS,
    RETRYABLE_STATUS_CODES,
    getRetryDelay,
    normalizePath,
} from './daLiveConstants';
import { convertSpreadsheetJsonToHtml } from './daLiveSpreadsheetUtils';
import { getMimeType } from './daLiveMimeTypes';

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

        return await response.json();
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

        // Check if this is a spreadsheet path (like /config) by testing for JSON response
        // Spreadsheets are stored as .xlsx in DA.live and served as .json on CDN
        const isSpreadsheet = await this.isSpreadsheetPath(sourceBaseUrl, sourcePath);
        if (isSpreadsheet) {
            return this.copySpreadsheetFile(token, source, sourcePath, destination, destPath);
        }

        // For HTML content, fetch .plain.html which returns just the main content
        // This is closer to what DA.live expects than the full rendered page
        const isHtmlPath = !sourcePath.match(/\.[a-z0-9]+$/i) || sourcePath.endsWith('.html');

        // Build the correct .plain.html URL
        // - /nav → /nav.plain.html
        // - / → /index.plain.html
        // - /citisignal-fr/ → /citisignal-fr/index.plain.html
        let sourceUrl: string;
        if (isHtmlPath) {
            if (sourcePath === '/' || sourcePath.endsWith('/')) {
                // Directory paths need index.plain.html
                sourceUrl = `${sourceBaseUrl}${sourcePath}index.plain.html`;
            } else {
                // Regular paths just append .plain.html
                sourceUrl = `${sourceBaseUrl}${sourcePath}.plain.html`;
            }
        } else {
            sourceUrl = `${sourceBaseUrl}${sourcePath}`;
        }

        for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                // Step 1: Fetch content from source
                const sourceResponse = await fetch(sourceUrl, {
                    signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                });

                if (!sourceResponse.ok) {
                    this.logger.warn(`[DA.live] Failed to fetch source ${sourcePath}: ${sourceResponse.status}`);
                    return false;
                }

                const contentType = sourceResponse.headers.get('content-type') || '';

                // Step 2: Determine file extension and DA.live path
                // DA.live uses /source endpoint and requires proper file extensions
                let daPath = normalizePath(destPath);

                // Ensure proper extension for HTML content
                const isHtml = contentType.includes('text/html') || isHtmlPath;
                if (isHtml && !daPath.endsWith('.html')) {
                    // Handle root path (empty string after normalization) and paths ending with '/'
                    if (daPath === '' || daPath.endsWith('/')) {
                        daPath = `${daPath}index.html`;
                    } else {
                        daPath = `${daPath}.html`;
                    }
                }

                // Step 3: Process content - transform HTML for DA.live compatibility
                // Transform HTML for DA.live using "Anchor Escape Pattern":
                // - Fetch .plain.html (just main content, no page wrapper)
                // - Convert <picture>/<img> to anchors with "//External Image//" marker
                // - Anchor href points to source CDN (media already exists there)
                // - Wrap in expected document structure
                // Client-side JS in the project will convert anchors back to images
                let contentBlob: Blob;
                if (isHtml) {
                    let htmlText = await sourceResponse.text();

                    // Apply content patches if any match this page path
                    if (contentPatchIds && contentPatchIds.length > 0) {
                        const { applyContentPatches } = await import('./contentPatchRegistry');
                        const { html: patchedHtml, results } = await applyContentPatches(
                            htmlText,
                            sourcePath,
                            contentPatchIds,
                            this.logger,
                            contentPatchSource,
                        );
                        htmlText = patchedHtml;

                        for (const result of results) {
                            if (!result.applied && result.reason) {
                                this.logger.debug(`[DA.live] Content patch '${result.patchId}' not applied to ${sourcePath}: ${result.reason}`);
                            }
                        }
                    }

                    const transformedHtml = this.transformHtmlForDaLive(htmlText, sourceBaseUrl);
                    contentBlob = new Blob([transformedHtml], { type: 'text/html' });
                } else {
                    contentBlob = await sourceResponse.blob();
                }

                // Step 4: POST content directly to /source endpoint (creates the content)
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

                if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < MAX_RETRY_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
                    continue;
                }

                // Log error details for debugging
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

            this.logger.warn(`[DA.live] Failed to upload spreadsheet ${destPath}: ${response.status}`);
            return false;
        } catch (error) {
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
     * @returns Result with success status, block count, and paths created (for publishing)
     */
    async createBlockLibraryFromTemplate(
        org: string,
        site: string,
        templateOwner: string,
        templateRepo: string,
        getFileContent: (owner: string, repo: string, path: string) => Promise<{ content: string; sha: string } | null>,
    ): Promise<{ success: boolean; blocksCount: number; paths: string[]; error?: string }> {
        try {
            const componentDef = await getFileContent(templateOwner, templateRepo, 'component-definition.json');

            if (!componentDef?.content) {
                this.logger.debug('[DA.live] No component-definition.json in template');
                return { success: true, blocksCount: 0, paths: [] };
            }

            // GitHubFileOperations.getFileContent already decodes base64
            const parsed = JSON.parse(componentDef.content);
            const blocksGroup = parsed.groups?.find((g: { id: string }) => g.id === 'blocks');

            const blocks = blocksGroup?.components?.map((c: {
                title: string;
                id: string;
                plugins?: { da?: { unsafeHTML?: string } };
            }) => ({
                title: c.title,
                id: c.id,
                exampleHtml: c.plugins?.da?.unsafeHTML,
            })) ?? [];

            if (blocks.length === 0) {
                this.logger.debug('[DA.live] No blocks found in component-definition.json');
                return { success: true, blocksCount: 0, paths: [] };
            }

            return await this.createBlockLibrary(org, site, blocks);
        } catch (error) {
            this.logger.warn(`[DA.live] Block library from template failed: ${(error as Error).message}`);
            return { success: false, blocksCount: 0, paths: [], error: (error as Error).message };
        }
    }

    /**
     * Create block library configuration in DA.live
     *
     * Creates:
     * 1. /.da/config - Config sheet with library tab pointing to /library/blocks.json
     * 2. /.da/library/blocks.json - Spreadsheet listing all blocks with paths to docs
     *
     * DA.live path mapping: /library/ → /.da/library/ internally
     * Config references /library/blocks.json but files are stored at /.da/library/
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
    ): Promise<{ success: boolean; blocksCount: number; paths: string[]; error?: string }> {
        if (blocks.length === 0) {
            return { success: true, blocksCount: 0, paths: [] };
        }

        try {
            // Step 1: Update site config via /config/ API
            // The config API is a special endpoint that manages /.da/config
            // This is NOT the same as creating a file via /source/
            // The config automatically syncs to CDN without needing preview/publish
            const configResult = await this.updateSiteConfig(org, site, [
                {
                    title: 'Blocks',
                    // Path points to the blocks spreadsheet we'll create
                    path: `https://content.da.live/${org}/${site}/.da/library/blocks.json`,
                },
            ]);
            if (!configResult.success) {
                this.logger.warn(`[DA.live] Failed to update config: ${configResult.error}`);
                // Continue - blocks spreadsheet is still useful
            }

            // Step 2: Delete any existing blocks spreadsheet files
            // Keep the blocks/ folder - it contains block documentation pages from template
            await this.deleteSource(org, site, '.da/library/blocks.json');
            await this.deleteSource(org, site, '.da/library/blocks.html');
            await this.deleteSource(org, site, '.da/library/blocks.xlsx');

            // Step 3: Create /.da/library/blocks.json spreadsheet
            // Block paths point to /.da/library/blocks/{id} where template docs are copied
            const blocksResult = await this.createJsonSpreadsheet(
                org,
                site,
                '.da/library/blocks',
                ['name', 'path'],
                blocks.map((b) => ({
                    name: b.title,
                    path: `https://content.da.live/${org}/${site}/.da/library/blocks/${b.id}`,
                })),
                { overwrite: true },
            );
            if (!blocksResult.success) {
                return { success: false, blocksCount: 0, paths: [], error: 'Failed to create /.da/library/blocks.json' };
            }

            this.logger.info(`[DA.live] Block library created: ${blocks.length} blocks in ${org}/${site}`);

            // Verify all library files and get list of blocks with documentation pages
            const existingBlockIds = await this.verifyBlockLibrary(org, site, blocks);

            // Return paths for preview/publish
            // - Config: handled by /config/ API, no preview/publish needed
            // - Blocks spreadsheet: needs preview/publish with .json extension
            // - Block docs: only include blocks that have documentation pages
            const paths: string[] = [
                '.da/library/blocks.json', // Spreadsheet - use .json extension for Helix
            ];

            // Add block document paths only for blocks that have docs
            // (not all blocks in component-definition.json have documentation pages)
            for (const blockId of existingBlockIds) {
                paths.push(`.da/library/blocks/${blockId}`);
            }

            return { success: true, blocksCount: blocks.length, paths };
        } catch (error) {
            this.logger.error(`[DA.live] Block library creation failed: ${(error as Error).message}`);
            return { success: false, blocksCount: 0, paths: [], error: (error as Error).message };
        }
    }

    /**
     * Verify block library files were created correctly
     *
     * Checks that all expected files exist:
     * 1. Config has library entry (via /config/ API)
     * 2. Blocks spreadsheet exists at /.da/library/blocks.json
     * 3. Block documentation pages exist at /.da/library/blocks/{id}
     *
     * Logs detailed results to debug channel for troubleshooting.
     *
     * @param org - Organization name
     * @param site - Site name
     * @param blocks - Array of block definitions that should have been created
     * @returns Array of block IDs that have documentation pages (for filtering publish paths)
     */
    private async verifyBlockLibrary(
        org: string,
        site: string,
        blocks: Array<{ title: string; id: string; exampleHtml?: string }>,
    ): Promise<string[]> {
        const token = await this.getImsToken();
        const verificationResults: {
            config: { exists: boolean; hasLibrary: boolean; error?: string };
            blocksSheet: { exists: boolean; error?: string };
            blockDocs: Array<{ id: string; exists: boolean; error?: string }>;
        } = {
            config: { exists: false, hasLibrary: false },
            blocksSheet: { exists: false },
            blockDocs: [],
        };

        // 1. Verify config has library entry
        try {
            const configResponse = await fetch(`${DA_LIVE_BASE_URL}/config/${org}/${site}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });

            if (configResponse.ok) {
                verificationResults.config.exists = true;
                const configData = await configResponse.json();
                // Check if library sheet exists and has entries
                const hasLibrary = configData.library?.data?.length > 0;
                verificationResults.config.hasLibrary = hasLibrary;
            } else {
                verificationResults.config.error = `HTTP ${configResponse.status}`;
            }
        } catch (error) {
            verificationResults.config.error = (error as Error).message;
        }

        // 2. Verify blocks spreadsheet exists
        try {
            const blocksSheetUrl = `${DA_LIVE_BASE_URL}/source/${org}/${site}/.da/library/blocks.json`;
            const blocksResponse = await fetch(blocksSheetUrl, {
                method: 'HEAD',
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });

            verificationResults.blocksSheet.exists = blocksResponse.ok;
            if (!blocksResponse.ok) {
                verificationResults.blocksSheet.error = `HTTP ${blocksResponse.status}`;
            }
        } catch (error) {
            verificationResults.blocksSheet.error = (error as Error).message;
        }

        // 3. Verify block documentation pages exist
        // Note: Block docs are copied from template during content copy phase,
        // so they may not exist yet if this is called before content copy completes.
        // We check them anyway for completeness.
        for (const block of blocks) {
            try {
                const blockDocUrl = `${DA_LIVE_BASE_URL}/source/${org}/${site}/.da/library/blocks/${block.id}.html`;
                const blockResponse = await fetch(blockDocUrl, {
                    method: 'HEAD',
                    headers: { Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                });

                verificationResults.blockDocs.push({
                    id: block.id,
                    exists: blockResponse.ok,
                    error: blockResponse.ok ? undefined : `HTTP ${blockResponse.status}`,
                });
            } catch (error) {
                verificationResults.blockDocs.push({
                    id: block.id,
                    exists: false,
                    error: (error as Error).message,
                });
            }
        }

        // Log detailed verification results to debug channel
        this.logger.debug(`[DA.live] Block Library Verification for ${org}/${site}:`);
        this.logger.debug(`  Config: exists=${verificationResults.config.exists}, hasLibrary=${verificationResults.config.hasLibrary}${verificationResults.config.error ? `, error=${verificationResults.config.error}` : ''}`);
        this.logger.debug(`  Blocks Sheet (.da/library/blocks.json): exists=${verificationResults.blocksSheet.exists}${verificationResults.blocksSheet.error ? `, error=${verificationResults.blocksSheet.error}` : ''}`);

        const existingDocs = verificationResults.blockDocs.filter(d => d.exists);
        const missingDocs = verificationResults.blockDocs.filter(d => !d.exists);

        this.logger.debug(`  Block Docs: ${existingDocs.length}/${blocks.length} found`);
        if (existingDocs.length > 0) {
            this.logger.debug(`    Found: ${existingDocs.map(d => d.id).join(', ')}`);
        }
        if (missingDocs.length > 0) {
            // Note: Missing docs are expected - not all blocks in component-definition.json have docs
            this.logger.debug(`    No docs (normal for sub-blocks): ${missingDocs.map(d => d.id).join(', ')}`);
        }

        // Return IDs of blocks that have documentation pages
        return existingDocs.map(d => d.id);
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
        progressCallback?.({ processed: 0, total: 0, percentage: 0, message: 'Fetching content index...' });

        const token = await this.getImsToken();

        // Get content paths from index
        let contentPaths = await this.getContentPathsFromIndex(source);

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

        // Add essential root-level spreadsheets that may not be in the content index
        // These are stored as .xlsx in DA.live and served as .json on CDN
        // Note: /config is handled separately via code generation (config.json in GitHub repo)
        // - /placeholders: i18n text strings and labels
        // - /redirects: URL redirect rules
        // - /metadata: Default page metadata
        // - /sitemap: Sitemap configuration
        const essentialConfigs = ['/placeholders', '/redirects', '/metadata', '/sitemap'];
        for (const configPath of essentialConfigs) {
            if (!contentPaths.includes(configPath)) {
                // Check if config exists on source before adding
                const sourceUrl = `https://main--${source.site}--${source.org}.aem.live${configPath}.json`;
                try {
                    const response = await fetch(sourceUrl, { method: 'HEAD' });
                    if (response.ok) {
                        contentPaths.unshift(configPath); // Add at beginning for priority
                    }
                } catch {
                    // Config doesn't exist, skip
                }
            }
        }

        const copiedFiles: string[] = [];
        const failedFiles: { path: string; error: string }[] = [];
        const totalFiles = contentPaths.length;

        // Copy files in parallel batches for improved performance (~5x faster)
        const contentStart = Date.now();
        for (let i = 0; i < contentPaths.length; i += CONTENT_COPY_BATCH_SIZE) {
            const batch = contentPaths.slice(i, i + CONTENT_COPY_BATCH_SIZE);
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
        const token = await this.getImsToken();
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

                if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < MAX_RETRY_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
                    continue;
                }

                this.logger.warn(`[DA.live] Upload failed for ${destPath}: ${response.status}`);
                return false;
            } catch (error) {
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
        let existingConfig: Record<string, unknown> = {
            ':version': 3,
            ':names': ['data'],
            ':type': 'multi-sheet',
        };
        let existingRows: Array<{ key: string; value: string }> = [];

        try {
            const getResponse = await fetch(configUrl, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });
            if (getResponse.ok) {
                existingConfig = await getResponse.json();
                // Extract existing rows from data sheet
                const dataSheet = existingConfig.data as { data?: Array<{ key: string; value: string }> } | undefined;
                existingRows = dataSheet?.data || [];
            }
        } catch {
            // No existing config, start fresh
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
