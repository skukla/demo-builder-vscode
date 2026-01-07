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
    CITISIGNAL_SOURCE,
    MAX_RETRY_ATTEMPTS,
    RETRYABLE_STATUS_CODES,
    getRetryDelay,
    normalizePath,
} from './daLiveConstants';

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
            for (const entry of entries) {
                if (entry.type === 'folder') {
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
     * Copy a single file with retry logic
     * Uses the /source endpoint (like storefront-tools) which creates content directly,
     * rather than /copy which requires the destination site to already exist.
     */
    private async copySingleFile(
        token: string,
        source: { org: string; site: string },
        sourcePath: string,
        destination: { org: string; site: string },
        destPath: string,
    ): Promise<boolean> {
        // Fetch content from source
        const sourceUrl = `https://main--${source.site}--${source.org}.aem.live${sourcePath}`;
        
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
                const content = await sourceResponse.blob();

                // Step 2: Determine file extension and DA.live path
                // DA.live uses /source endpoint and requires proper file extensions
                let daPath = normalizePath(destPath);
                
                // Ensure proper extension for HTML content
                if (contentType.includes('text/html') && !daPath.endsWith('.html')) {
                    // If path ends with '/', add 'index.html'
                    if (daPath.endsWith('/')) {
                        daPath = `${daPath}index.html`;
                    } else {
                        daPath = `${daPath}.html`;
                    }
                }

                // Step 3: POST content directly to /source endpoint (creates the content)
                const destUrl = `${DA_LIVE_BASE_URL}/source/${destination.org}/${destination.site}/${daPath}`;

                const formData = new FormData();
                formData.append('data', content);

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
     * Copy CitiSignal content to destination
     * @param destOrg - Destination organization
     * @param destSite - Destination site
     * @param progressCallback - Optional progress callback
     * @returns Copy result
     */
    async copyCitisignalContent(
        destOrg: string,
        destSite: string,
        progressCallback?: DaLiveProgressCallback,
    ): Promise<DaLiveCopyResult> {
        const token = await this.getImsToken();

        // Fetch content index
        const indexResponse = await fetch(CITISIGNAL_SOURCE.indexUrl);
        if (!indexResponse.ok) {
            throw new DaLiveError(
                'Failed to fetch CitiSignal content index',
                'INDEX_FETCH_ERROR',
                indexResponse.status,
            );
        }

        const indexData = await indexResponse.json();
        const contentPaths: string[] = indexData.data?.map((item: { path: string }) => item.path) || [];

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
                { org: CITISIGNAL_SOURCE.org, site: CITISIGNAL_SOURCE.site },
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
