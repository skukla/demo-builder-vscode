/**
 * Helix Service
 *
 * Handles Helix Admin API operations for EDS (Edge Delivery Services)
 * including unpublishing from live and deleting from preview.
 *
 * Features:
 * - IMS token integration via AuthenticationService
 * - Unpublish from live (DELETE /live/{org}/{site}/main/*)
 * - Delete from preview (DELETE /preview/{org}/{site}/main/*)
 * - 404 handling as success (site never published)
 * - Repo fullName parsing for org/site extraction
 */

import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { Logger } from '@/types/logger';

// ==========================================================
// Constants
// ==========================================================

/** Helix Admin API base URL */
const HELIX_ADMIN_URL = 'https://admin.hlx.page';

/** Default branch for Helix operations */
const DEFAULT_BRANCH = 'main';

/**
 * Result of unpublishing a site
 */
export interface UnpublishResult {
    /** Whether live content was unpublished */
    liveUnpublished: boolean;
    /** Whether preview content was deleted */
    previewDeleted: boolean;
    /** Error message for live unpublish if failed */
    liveError?: string;
    /** Error message for preview delete if failed */
    previewError?: string;
}

/**
 * Helix Service for admin operations
 */
export class HelixService {
    private logger: Logger;
    private authService: AuthenticationService;

    /**
     * Create a HelixService
     * @param authService - Authentication service for IMS token access
     * @param logger - Optional logger for dependency injection (defaults to getLogger())
     */
    constructor(authService: AuthenticationService, logger?: Logger) {
        if (!authService) {
            throw new Error('AuthenticationService is required');
        }
        this.authService = authService;
        this.logger = logger ?? getLogger();
    }

    // ==========================================================
    // Token Management
    // ==========================================================

    /**
     * Get IMS token from AuthenticationService
     * @throws Error if not authenticated
     */
    private async getImsToken(): Promise<string> {
        const tokenManager = this.authService.getTokenManager();
        const token = await tokenManager.getAccessToken();

        if (!token) {
            throw new Error('Not authenticated. Please log in to Adobe.');
        }

        return token;
    }

    // ==========================================================
    // Unpublish Operations
    // ==========================================================

    /**
     * Unpublish content from live
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @throws Error on access denied (403) or network error
     */
    async unpublishFromLive(org: string, site: string, branch: string = DEFAULT_BRANCH): Promise<void> {
        const token = await this.getImsToken();
        const url = `${HELIX_ADMIN_URL}/live/${org}/${site}/${branch}/*`;

        this.logger.debug(`[Helix] Unpublishing from live: ${url}`);

        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(TIMEOUTS.EDS_HELIX_CONFIG || 30000),
        });

        // 404 is acceptable (site was never published)
        if (response.status === 404) {
            this.logger.debug('[Helix] Site was never published (404)');
            return;
        }

        // 403 is access denied
        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to unpublish this site.');
        }

        if (!response.ok) {
            throw new Error(`Failed to unpublish from live: ${response.status} ${response.statusText}`);
        }

        this.logger.debug('[Helix] Successfully unpublished from live');
    }

    /**
     * Delete content from preview
     * @param org - Organization/owner name
     * @param site - Site/repository name
     * @param branch - Branch name (default: main)
     * @throws Error on access denied (403) or network error
     */
    async deleteFromPreview(org: string, site: string, branch: string = DEFAULT_BRANCH): Promise<void> {
        const token = await this.getImsToken();
        const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/${branch}/*`;

        this.logger.debug(`[Helix] Deleting from preview: ${url}`);

        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(TIMEOUTS.EDS_HELIX_CONFIG || 30000),
        });

        // 404 is acceptable (never previewed)
        if (response.status === 404) {
            this.logger.debug('[Helix] Site was never previewed (404)');
            return;
        }

        // 403 is access denied
        if (response.status === 403) {
            throw new Error('Access denied. You do not have permission to delete preview content.');
        }

        if (!response.ok) {
            throw new Error(`Failed to delete from preview: ${response.status} ${response.statusText}`);
        }

        this.logger.debug('[Helix] Successfully deleted from preview');
    }

    /**
     * Fully unpublish a site (both live and preview)
     * Continues with preview deletion even if live unpublish fails.
     *
     * @param repoFullName - Full repository name (owner/repo)
     * @param branch - Branch name (default: main)
     * @returns Result with success status for both operations
     */
    async unpublishSite(repoFullName: string, branch: string = DEFAULT_BRANCH): Promise<UnpublishResult> {
        const [org, site] = this.parseRepoFullName(repoFullName);

        const result: UnpublishResult = {
            liveUnpublished: false,
            previewDeleted: false,
        };

        // Unpublish from live
        try {
            await this.unpublishFromLive(org, site, branch);
            result.liveUnpublished = true;
        } catch (error) {
            result.liveError = (error as Error).message;
            this.logger.warn(`[Helix] Failed to unpublish from live: ${result.liveError}`);
        }

        // Delete from preview (continue even if live failed)
        try {
            await this.deleteFromPreview(org, site, branch);
            result.previewDeleted = true;
        } catch (error) {
            result.previewError = (error as Error).message;
            this.logger.warn(`[Helix] Failed to delete from preview: ${result.previewError}`);
        }

        return result;
    }

    // ==========================================================
    // Helpers
    // ==========================================================

    /**
     * Parse repository full name into org and site
     * @param fullName - Full repository name (owner/repo)
     * @returns Tuple of [org, site]
     */
    private parseRepoFullName(fullName: string): [string, string] {
        const parts = fullName.split('/');
        if (parts.length !== 2) {
            throw new Error(`Invalid repository name: ${fullName}. Expected format: owner/repo`);
        }
        return [parts[0], parts[1]];
    }
}
