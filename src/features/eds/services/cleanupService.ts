/**
 * Cleanup Service
 *
 * Orchestrates cleanup of EDS (Edge Delivery Services) project resources.
 * Handles cleanup in the correct order to avoid orphaned resources:
 *
 * 1. Backend Data - Must clean up while tool config exists
 * 2. Helix - Unpublish while repo exists
 * 3. DA.live - Content can be removed independently
 * 4. GitHub - Most destructive, do last
 *
 * All operations continue even if one fails, with detailed results returned.
 */

import { getLogger } from '@/core/logging';
import type { GitHubService } from './githubService';
import type { DaLiveService } from './daLiveService';
import type { HelixService } from './helixService';
import type { ToolManager } from './toolManager';
import type {
    EdsMetadata,
    EdsCleanupOptions,
    EdsCleanupResult,
    CleanupOperationResult,
} from './types';

/**
 * Cleanup Service for EDS project resources
 *
 * Coordinates cleanup of all EDS-related resources in the correct order.
 * Continues cleanup even if individual operations fail, returning detailed
 * results for each operation.
 */
export class CleanupService {
    private logger = getLogger();
    private githubService: GitHubService;
    private daLiveService: DaLiveService;
    private helixService: HelixService;
    private toolManager: ToolManager;

    constructor(
        githubService: GitHubService,
        daLiveService: DaLiveService,
        helixService: HelixService,
        toolManager: ToolManager,
    ) {
        this.githubService = githubService;
        this.daLiveService = daLiveService;
        this.helixService = helixService;
        this.toolManager = toolManager;
    }

    /**
     * Clean up EDS resources based on provided metadata and options.
     *
     * CRITICAL: Cleanup order is Backend -> Helix -> DA.live -> GitHub
     * - Backend data requires tool config (must be first)
     * - Helix requires repo to exist for unpublishing
     * - DA.live can be done independently
     * - GitHub is most destructive (do last)
     *
     * @param metadata - EDS project metadata containing resource identifiers
     * @param options - Which resources to clean up
     * @returns Detailed result for each cleanup operation
     */
    async cleanupEdsResources(
        metadata: EdsMetadata,
        options: EdsCleanupOptions,
    ): Promise<EdsCleanupResult> {
        this.logger.debug('[Cleanup] Starting EDS resource cleanup');

        const result: EdsCleanupResult = {
            backendData: this.createSkippedResult(),
            helix: this.createSkippedResult(),
            daLive: this.createSkippedResult(),
            github: this.createSkippedResult(),
        };

        // 1. Backend Data Cleanup (FIRST - requires tool config)
        if (options.cleanupBackendData && metadata.backendType) {
            result.backendData = await this.cleanupBackendData(metadata);
        }

        // 2. Helix Unpublish (requires repo to exist)
        if (options.unpublishHelix && metadata.helixSiteUrl && metadata.githubRepo) {
            result.helix = await this.cleanupHelix(metadata);
        }

        // 3. DA.live Content Deletion
        if (options.deleteDaLive && metadata.daLiveOrg && metadata.daLiveSite) {
            result.daLive = await this.cleanupDaLive(metadata);
        }

        // 4. GitHub Repository (LAST - most destructive)
        if (options.deleteGitHub && metadata.githubRepo) {
            result.github = await this.cleanupGitHub(metadata, options);
        }

        this.logger.debug('[Cleanup] EDS resource cleanup complete');
        return result;
    }

    // ==========================================================
    // Individual Cleanup Operations
    // ==========================================================

    /**
     * Clean up backend data (Commerce or ACO)
     */
    private async cleanupBackendData(metadata: EdsMetadata): Promise<CleanupOperationResult> {
        this.logger.debug(`[Cleanup] Cleaning up ${metadata.backendType} backend data`);

        try {
            let toolResult;

            if (metadata.backendType === 'aco') {
                toolResult = await this.toolManager.executeAcoCleanup();
            } else if (metadata.backendType === 'commerce') {
                toolResult = await this.toolManager.executeCommerceCleanup();
            } else {
                return this.createSkippedResult();
            }

            if (toolResult.success) {
                this.logger.debug('[Cleanup] Backend data cleaned up successfully');
                return { success: true, skipped: false };
            } else {
                return {
                    success: false,
                    skipped: false,
                    error: toolResult.error || 'Backend cleanup failed',
                };
            }
        } catch (error) {
            const errorMessage = (error as Error).message;
            this.logger.error('[Cleanup] Backend data cleanup failed', error as Error);
            return {
                success: false,
                skipped: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Unpublish from Helix (live and preview)
     */
    private async cleanupHelix(metadata: EdsMetadata): Promise<CleanupOperationResult> {
        if (!metadata.githubRepo) {
            return this.createSkippedResult();
        }

        this.logger.debug(`[Cleanup] Unpublishing from Helix: ${metadata.githubRepo}`);

        try {
            const result = await this.helixService.unpublishSite(metadata.githubRepo);

            // Consider it success if either live or preview was unpublished
            const success = result.liveUnpublished || result.previewDeleted;

            if (success) {
                this.logger.debug('[Cleanup] Helix unpublished successfully');
                return { success: true, skipped: false };
            } else {
                const errors = [result.liveError, result.previewError].filter(Boolean).join('; ');
                return {
                    success: false,
                    skipped: false,
                    error: errors || 'Helix unpublish failed',
                };
            }
        } catch (error) {
            const errorMessage = (error as Error).message;
            this.logger.error('[Cleanup] Helix unpublish failed', error as Error);
            return {
                success: false,
                skipped: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Delete DA.live site content
     */
    private async cleanupDaLive(metadata: EdsMetadata): Promise<CleanupOperationResult> {
        if (!metadata.daLiveOrg || !metadata.daLiveSite) {
            return this.createSkippedResult();
        }

        this.logger.debug(`[Cleanup] Deleting DA.live content: ${metadata.daLiveOrg}/${metadata.daLiveSite}`);

        try {
            const result = await this.daLiveService.deleteSite(metadata.daLiveOrg, metadata.daLiveSite);

            if (result.success) {
                this.logger.debug('[Cleanup] DA.live content deleted successfully');
                return { success: true, skipped: false };
            } else {
                return {
                    success: false,
                    skipped: false,
                    error: 'DA.live deletion failed',
                };
            }
        } catch (error) {
            const errorMessage = (error as Error).message;
            this.logger.error('[Cleanup] DA.live deletion failed', error as Error);
            return {
                success: false,
                skipped: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Delete or archive GitHub repository
     */
    private async cleanupGitHub(
        metadata: EdsMetadata,
        options: EdsCleanupOptions,
    ): Promise<CleanupOperationResult> {
        if (!metadata.githubRepo) {
            return this.createSkippedResult();
        }

        const [owner, repo] = metadata.githubRepo.split('/');

        if (!owner || !repo) {
            return {
                success: false,
                skipped: false,
                error: `Invalid repository name: ${metadata.githubRepo}`,
            };
        }

        const action = options.archiveInsteadOfDelete ? 'archive' : 'delete';
        this.logger.debug(`[Cleanup] ${action} GitHub repository: ${metadata.githubRepo}`);

        try {
            if (options.archiveInsteadOfDelete) {
                await this.githubService.archiveRepository(owner, repo);
            } else {
                await this.githubService.deleteRepository(owner, repo);
            }

            this.logger.debug(`[Cleanup] GitHub repository ${action}d successfully`);
            return { success: true, skipped: false };
        } catch (error) {
            const errorMessage = (error as Error).message;
            this.logger.error(`[Cleanup] GitHub ${action} failed`, error as Error);
            return {
                success: false,
                skipped: false,
                error: errorMessage,
            };
        }
    }

    // ==========================================================
    // Helpers
    // ==========================================================

    /**
     * Create a skipped result
     */
    private createSkippedResult(): CleanupOperationResult {
        return { success: false, skipped: true };
    }
}
