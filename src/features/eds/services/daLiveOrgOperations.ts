/**
 * DA.live Organization Operations
 *
 * Handles organization and site-level operations for DA.live content management:
 * - Organization access verification
 * - Site listing
 * - Site existence checks
 * - Site deletion
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
    type DaLiveOrgAccess,
} from './types';
import { DA_LIVE_BASE_URL, MAX_RETRY_ATTEMPTS, RETRYABLE_STATUS_CODES, getRetryDelay } from './daLiveConstants';

/**
 * Token provider interface for dependency injection
 */
export interface TokenProvider {
    getAccessToken(): Promise<string | null>;
}

/**
 * DA.live Organization Operations
 */
export class DaLiveOrgOperations {
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
                    this.logger.warn(`[DA.live] Organization not found: ${orgName} (404)`);
                    return [];
                }
                // 403 means no access
                if (response.status === 403) {
                    this.logger.warn(`[DA.live] Access denied to organization: ${orgName} (403)`);
                    return [];
                }
                throw this.createErrorFromResponse(response, 'list organization sites');
            }

            const entries: DaLiveEntry[] = await response.json();
            this.logger.debug(`[DA.live] Retrieved ${entries.length} entries for ${orgName}`);
            
            // Note: DA.live API returns entries with just 'name' field at org level
            // All top-level entries in an org are sites/projects, no filtering needed
            return entries;
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
        } catch {
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
