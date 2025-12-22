/**
 * DA.live Service
 *
 * Handles DA.live content management operations for EDS (Edge Delivery Services)
 * integration including:
 * - IMS token integration via AuthenticationService
 * - Organization access verification
 * - Directory listing
 * - Content copy operations
 * - CitiSignal content workflow
 * - Error handling with retry logic
 */

import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import {
    DaLiveError,
    DaLiveAuthError,
    DaLiveNetworkError,
    type DaLiveEntry,
    type DaLiveSourceResult,
    type DaLiveCopyResult,
    type DaLiveOrgAccess,
    type DaLiveProgressCallback,
} from './types';

// ==========================================================
// Constants
// ==========================================================

/** DA.live Admin API base URL */
const DA_LIVE_BASE_URL = 'https://admin.da.live';

/** CitiSignal source configuration */
const CITISIGNAL_SOURCE = {
    org: 'demo-system-stores',
    site: 'accs-citisignal',
    indexUrl: 'https://main--accs-citisignal--demo-system-stores.aem.live/full-index.json',
};

/** Maximum retry attempts for transient errors */
const MAX_RETRY_ATTEMPTS = 3;

/** Retry delay base (exponential backoff) */
const RETRY_DELAY_BASE = 1000;

/** HTTP status codes that should trigger retry */
const RETRYABLE_STATUS_CODES = [502, 503, 504];

/** Calculate exponential backoff delay */
const getRetryDelay = (attempt: number): number => RETRY_DELAY_BASE * Math.pow(2, attempt - 1);

/** Normalize path by removing leading slash */
const normalizePath = (path: string): string => path.startsWith('/') ? path.slice(1) : path;

/**
 * DA.live Service for content management operations
 */
export class DaLiveService {
    private logger = getLogger();
    private authService: AuthenticationService;

    constructor(authService: AuthenticationService) {
        if (!authService) {
            throw new Error('AuthenticationService is required');
        }
        this.authService = authService;
    }

    // ==========================================================
    // Token Management
    // ==========================================================

    /**
     * Get IMS token from AuthenticationService
     * @throws DaLiveAuthError if not authenticated
     */
    private async getImsToken(): Promise<string> {
        const tokenManager = this.authService.getTokenManager();
        const token = await tokenManager.getAccessToken();

        if (!token) {
            throw new DaLiveAuthError('Not authenticated. Please log in to Adobe.');
        }

        return token;
    }

    // ==========================================================
    // Organization Access
    // ==========================================================

    /**
     * List all sites in an organization
     * @param orgName - Organization name
     * @returns Array of site entries, or empty array if org not accessible
     */
    async listOrgSites(orgName: string): Promise<DaLiveEntry[]> {
        try {
            const token = await this.getImsToken();
            const url = `${DA_LIVE_BASE_URL}/list/${orgName}/`;

            const response = await this.fetchWithRetry(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                // 404 means org doesn't exist
                if (response.status === 404) {
                    return [];
                }
                // 403 means no access
                if (response.status === 403) {
                    return [];
                }
                throw this.createErrorFromResponse(response, 'list organization sites');
            }

            const entries: DaLiveEntry[] = await response.json();

            // Filter to only return folders (sites are top-level folders)
            return entries.filter(entry => entry.type === 'folder');
        } catch (error) {
            if (error instanceof DaLiveAuthError) {
                throw error;
            }
            this.logger.error('[DA.live] Error listing org sites', error as Error);
            throw error;
        }
    }

    /**
     * Check if a site exists in an organization
     * @param orgName - Organization name
     * @param siteName - Site name to check
     * @returns True if site exists, false otherwise
     */
    async siteExists(orgName: string, siteName: string): Promise<boolean> {
        try {
            const token = await this.getImsToken();
            const url = `${DA_LIVE_BASE_URL}/list/${orgName}/${siteName}/`;

            const response = await this.fetchWithRetry(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            // 200 means site exists
            return response.ok;
        } catch (error) {
            // Any error means site doesn't exist or isn't accessible
            return false;
        }
    }

    /**
     * Verify user has access to organization
     * @param orgName - Organization name to check
     * @returns Access result with hasAccess and reason
     */
    async verifyOrgAccess(orgName: string): Promise<DaLiveOrgAccess> {
        try {
            const token = await this.getImsToken();
            const url = `${DA_LIVE_BASE_URL}/list/${orgName}/`;

            this.logger.debug(`[DA.live] Verifying org access: ${url}`);

            const response = await this.fetchWithRetry(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            this.logger.debug(`[DA.live] Verify response status: ${response.status}`);

            if (response.status === 403) {
                return {
                    hasAccess: false,
                    reason: 'Access denied. You may not have permission to access this organization.',
                    orgName,
                };
            }

            if (response.status === 404) {
                return {
                    hasAccess: false,
                    reason: 'Organization not found. Please verify the organization name.',
                    orgName,
                };
            }

            if (!response.ok) {
                return {
                    hasAccess: false,
                    reason: `Unexpected error: ${response.status} ${response.statusText}`,
                    orgName,
                };
            }

            // Parse response to get site list
            const entries: DaLiveEntry[] = await response.json();
            const sites = entries.filter(entry => entry.type === 'folder');

            this.logger.debug(`[DA.live] Org ${orgName} has ${sites.length} sites`);

            // Success - user has access
            return {
                hasAccess: true,
                orgName,
            };
        } catch (error) {
            if (error instanceof DaLiveAuthError) {
                throw error;
            }
            this.logger.error('[DA.live] Verify org access error:', error as Error);
            return {
                hasAccess: false,
                reason: `Error checking access: ${(error as Error).message}`,
                orgName,
            };
        }
    }

    // ==========================================================
    // Directory Operations
    // ==========================================================

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

    // ==========================================================
    // Content Copy Operations
    // ==========================================================

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
                    success ? copiedFiles.push(destPath) : failedFiles.push({ path: destPath, error: 'Copy failed' });
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
     */
    private async copySingleFile(
        token: string,
        source: { org: string; site: string },
        sourcePath: string,
        destination: { org: string; site: string },
        destPath: string,
    ): Promise<boolean> {
        const url = `${DA_LIVE_BASE_URL}/copy/${destination.org}/${destination.site}/${normalizePath(destPath)}`;
        const sourceUrl = `https://main--${source.site}--${source.org}.aem.live${sourcePath}`;

        const formData = new FormData();
        formData.append('source', sourceUrl);

        for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                    signal: AbortSignal.timeout(TIMEOUTS.DA_LIVE_API),
                });

                if (response.ok) return true;

                if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < MAX_RETRY_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
                    continue;
                }

                this.logger.warn(`[DA.live] Copy failed for ${destPath}: ${response.status}`);
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

    // ==========================================================
    // Create Source Operations
    // ==========================================================

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

    // ==========================================================
    // CitiSignal Content Copy
    // ==========================================================

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
            success ? copiedFiles.push(sourcePath) : failedFiles.push({ path: sourcePath, error: 'Copy failed' });
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

    // ==========================================================
    // Site Deletion
    // ==========================================================

    /**
     * Delete a site's content from DA.live
     * @param org - Organization name
     * @param site - Site name
     * @returns Result with success status
     * @throws DaLiveError on 403 access denied
     */
    async deleteSite(org: string, site: string): Promise<{ success: boolean; alreadyDeleted?: boolean }> {
        const token = await this.getImsToken();
        const url = `${DA_LIVE_BASE_URL}/source/${org}/${site}/`;

        this.logger.debug(`[DA.live] Deleting site: ${url}`);

        const response = await this.fetchWithRetry(url, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        // 404 is acceptable (site already deleted)
        if (response.status === 404) {
            this.logger.debug('[DA.live] Site already deleted (404)');
            return { success: true, alreadyDeleted: true };
        }

        // 403 is access denied
        if (response.status === 403) {
            throw new DaLiveError(
                'Access denied to organization. Check your permissions.',
                'ACCESS_DENIED',
                403,
            );
        }

        if (!response.ok) {
            throw this.createErrorFromResponse(response, 'delete site');
        }

        this.logger.debug('[DA.live] Site deleted successfully');
        return { success: true };
    }

    // ==========================================================
    // HTTP Helpers
    // ==========================================================

    /**
     * Fetch with retry logic and timeout
     * @param url - URL to fetch
     * @param options - Fetch options
     * @returns Response
     */
    private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
        for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                const response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUTS.DA_LIVE_API) });

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
