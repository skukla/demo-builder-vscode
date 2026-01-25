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
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
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
     */
    private async copySingleFile(
        token: string,
        source: { org: string; site: string },
        sourcePath: string,
        destination: { org: string; site: string },
        destPath: string,
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
                    const htmlText = await sourceResponse.text();
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
                signal: AbortSignal.timeout(5000),
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
        const normalizedPath = normalizePath(sourcePath);
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
            const htmlContent = this.convertSpreadsheetJsonToHtml(jsonData);
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
     * Convert EDS spreadsheet JSON to HTML table format
     * Handles both single-sheet and multi-sheet formats
     */
    private convertSpreadsheetJsonToHtml(json: Record<string, unknown>): string | null {
        try {
            // Check for multi-sheet format
            if (json[':type'] === 'multi-sheet' && Array.isArray(json[':names'])) {
                // Multi-sheet: create multiple tables
                const names = json[':names'] as string[];
                const tables = names
                    .filter(name => !name.startsWith('dnt')) // Skip "do not translate" sheets
                    .map(name => {
                        const sheet = json[name] as { columns?: string[]; data?: Record<string, unknown>[] };
                        if (!sheet?.data) return '';
                        return this.createHtmlTable(sheet.columns || [], sheet.data, name);
                    })
                    .filter(Boolean)
                    .join('\n');
                return this.wrapInDocument(tables);
            }

            // Single-sheet format
            const data = json.data as Record<string, unknown>[] | undefined;
            const columns = json.columns as string[] | undefined;
            if (!data || !Array.isArray(data)) return null;

            const table = this.createHtmlTable(columns || Object.keys(data[0] || {}), data);
            return this.wrapInDocument(table);
        } catch {
            return null;
        }
    }

    /**
     * Create an HTML table from columns and data
     */
    private createHtmlTable(columns: string[], data: Record<string, unknown>[], sheetName?: string): string {
        const headerRow = `<tr>${columns.map(col => `<th>${this.escapeHtml(col)}</th>`).join('')}</tr>`;
        const dataRows = data.map(row =>
            `<tr>${columns.map(col => `<td>${this.escapeHtml(String(row[col] ?? ''))}</td>`).join('')}</tr>`
        ).join('\n');

        const className = sheetName ? ` class="sheet-${sheetName}"` : '';
        return `<table${className}>\n<thead>\n${headerRow}\n</thead>\n<tbody>\n${dataRows}\n</tbody>\n</table>`;
    }

    /**
     * Wrap table(s) in a minimal HTML document
     */
    private wrapInDocument(content: string): string {
        return `<!DOCTYPE html>\n<html>\n<body>\n${content}\n</body>\n</html>`;
    }

    /**
     * Escape HTML special characters
     */
    private escapeHtml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
        formData.append('content', new Blob([content], { type: 'text/html' }));
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
     * @returns Copy result
     */
    async copyContentFromSource(
        source: DaLiveContentSource,
        destOrg: string,
        destSite: string,
        progressCallback?: DaLiveProgressCallback,
    ): Promise<DaLiveCopyResult> {
        // Report initialization progress
        progressCallback?.({ processed: 0, total: 0, percentage: 0, message: 'Fetching content index...' });

        const token = await this.getImsToken();

        // Get content paths from index
        const contentPaths = await this.getContentPathsFromIndex(source);
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

        // Copy each file
        for (let i = 0; i < contentPaths.length; i++) {
            const sourcePath = contentPaths[i];

            // Report progress
            if (progressCallback) {
                progressCallback({
                    currentFile: sourcePath,
                    processed: i,
                    total: totalFiles,
                    percentage: Math.round((i / totalFiles) * 100),
                });
            }

            // Copy the file
            const success = await this.copySingleFile(
                token,
                { org: source.org, site: source.site },
                sourcePath,
                { org: destOrg, site: destSite },
                sourcePath,
            );
            if (success) {
                copiedFiles.push(sourcePath);
            } else {
                failedFiles.push({ path: sourcePath, error: 'Copy failed' });
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

        // Copy each media file
        for (let i = 0; i < mediaPaths.length; i++) {
            const mediaPath = mediaPaths[i];

            // Report progress
            if (progressCallback) {
                progressCallback({
                    currentFile: mediaPath,
                    processed: i,
                    total: totalFiles,
                    percentage: Math.round((i / totalFiles) * 100),
                });
            }

            // Copy the file
            const success = await this.copySingleFile(
                token,
                { org: source.org, site: source.site },
                mediaPath,
                { org: destOrg, site: destSite },
                mediaPath,
            );

            if (success) {
                copiedFiles.push(mediaPath);
            } else {
                failedFiles.push({ path: mediaPath, error: 'Copy failed' });
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
     * Recursively collect all media file entries from a folder
     * @param org - Organization name
     * @param site - Site name
     * @param path - Starting path (e.g., '/media')
     * @returns Array of file entries (folders are traversed, not returned)
     */
    private async collectMediaFiles(org: string, site: string, path: string): Promise<DaLiveEntry[]> {
        const files: DaLiveEntry[] = [];

        // listDirectory returns empty array for 404 (graceful handling)
        const entries = await this.listDirectory(org, site, path);

        for (const entry of entries) {
            const isFolder = !entry.ext;

            if (isFolder) {
                // Recursively collect from subfolder
                const relativePath = entry.path.replace(`/${org}/${site}`, '');
                const subFiles = await this.collectMediaFiles(org, site, relativePath);
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
                const contentType = this.getContentType(ext);

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
     * Get content type based on file extension
     */
    private getContentType(ext: string): string {
        const contentTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.pdf': 'application/pdf',
            '.json': 'application/json',
            '.xml': 'application/xml',
            '.txt': 'text/plain',
            '.css': 'text/css',
            '.js': 'application/javascript',
        };
        return contentTypes[ext] || 'application/octet-stream';
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
