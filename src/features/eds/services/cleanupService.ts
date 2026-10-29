/**
 * Cleanup Service
 *
 * Orchestrates cleanup of EDS (Edge Delivery Services) project resources.
 * Handles cleanup in the correct order to avoid orphaned resources:
 *
 * 1. Backend Data - Must clean up while tool config exists
 * 2. DA.live - Content can be removed independently
 * 3. GitHub - Most destructive, do last; a DELETE (not an archive) takes the site's
 *    code on aem.live with it (EDS-67, `deleteStorefrontRepository`)
 *
 * All operations continue even if one fails, with detailed results returned.
 */

import type { ConfigurationService } from './configService/configurationService';
import type { DaLiveOrgOperations } from './daLive/daLiveOrgOperations';
import type { GitHubRepoLifecycle } from './github/githubRepoLifecycle';
import {
    deleteStorefrontRepository,
    type CodeRemovalResult,
    type StorefrontRepoDeletion,
    type StorefrontRepoDeletionDeps,
} from './storefront/storefrontCodeRemoval';
import type { ToolManager } from './toolManager';
import type {
    EdsMetadata,
    EdsCleanupOptions,
    EdsCleanupResult,
    CleanupOperationResult,
} from './types';
import { getLogger } from '@/core/logging/debugLogger';
import type { Logger } from '@/types/logger';

/**
 * What removing a deleted repository's code from aem.live needs, besides the delete and
 * the logger the service already has: the file list read first, and the DA.live sign-in.
 */
export type CodeRemovalWiring = Omit<StorefrontRepoDeletionDeps, 'deleteRepository' | 'logger' | 'onStep'>;

/**
 * Cleanup Service for EDS project resources
 *
 * Coordinates cleanup of all EDS-related resources in the correct order.
 * Continues cleanup even if individual operations fail, returning detailed
 * results for each operation.
 */
export class CleanupService {
    private logger: Logger;
    private githubRepoOps: GitHubRepoLifecycle;
    private daLiveOrgOps: DaLiveOrgOperations;
    private configurationService?: ConfigurationService;
    private toolManager: ToolManager;
    private codeRemoval: CodeRemovalWiring;

    /**
     * Create a CleanupService
     * @param githubRepoOps - GitHub repository operations for delete/archive
     * @param daLiveOrgOps - DA.live org operations for site deletion
     * @param toolManager - Tool manager for backend cleanup
     * @param codeRemoval - How a deleted repository's code is removed from aem.live
     *   (EDS-67). Required, so no delete through this service can leave the code behind
     *   by being built without it.
     * @param logger - Optional logger for dependency injection (defaults to getLogger())
     * @param configurationService - Optional Configuration Service for site config deletion
     */
    constructor(
        githubRepoOps: GitHubRepoLifecycle,
        daLiveOrgOps: DaLiveOrgOperations,
        toolManager: ToolManager,
        codeRemoval: CodeRemovalWiring,
        logger?: Logger,
        configurationService?: ConfigurationService,
    ) {
        this.githubRepoOps = githubRepoOps;
        this.codeRemoval = codeRemoval;
        this.daLiveOrgOps = daLiveOrgOps;
        this.configurationService = configurationService;
        this.toolManager = toolManager;
        this.logger = logger ?? getLogger();
    }

    /**
     * Clean up EDS resources based on provided metadata and options.
     *
     * CRITICAL: Cleanup order is Backend -> DA.live -> GitHub
     * - Backend data requires tool config (must be first)
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
            configService: this.createSkippedResult(),
            daLive: this.createSkippedResult(),
            github: this.createSkippedResult(),
            siteCode: this.createSkippedResult(),
        };

        // 1. Backend Data Cleanup (FIRST - requires tool config)
        if (options.cleanupBackendData && metadata.backendType) {
            result.backendData = await this.cleanupBackendData(metadata);
        }

        // 2. Configuration Service Deletion (requires repo info for org/site)
        if (options.deleteConfigService && metadata.githubRepo) {
            result.configService = await this.cleanupConfigService(metadata);
        }

        // 3. DA.live Content Deletion
        if (options.deleteDaLive && metadata.daLiveOrg && metadata.daLiveSite) {
            result.daLive = await this.cleanupDaLive(metadata);
        }

        // 4. GitHub Repository (LAST - most destructive)
        if (options.deleteGitHub && metadata.githubRepo) {
            const github = await this.cleanupGitHub(metadata, options);
            result.github = github.result;
            if (github.code) result.siteCode = this.siteCodeResult(github.code);
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
     * Delete site configuration from the AEM Configuration Service
     */
    private async cleanupConfigService(metadata: EdsMetadata): Promise<CleanupOperationResult> {
        if (!metadata.githubRepo || !this.configurationService) {
            return this.createSkippedResult();
        }

        const [owner, repo] = metadata.githubRepo.split('/');
        if (!owner || !repo) {
            return this.createSkippedResult();
        }

        this.logger.debug(`[Cleanup] Deleting Configuration Service site: ${owner}/${repo}`);

        try {
            const result = await this.configurationService.deleteSiteConfig(owner, repo);

            if (result.success) {
                this.logger.debug('[Cleanup] Configuration Service site deleted');
                return { success: true, skipped: false };
            } else {
                return {
                    success: false,
                    skipped: false,
                    error: result.error || 'Configuration Service deletion failed',
                };
            }
        } catch (error) {
            const errorMessage = (error as Error).message;
            this.logger.error('[Cleanup] Configuration Service deletion failed', error as Error);
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
            const result = await this.daLiveOrgOps.deleteSite(metadata.daLiveOrg, metadata.daLiveSite);

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
     * Delete or archive GitHub repository. A delete removes the site's code from aem.live
     * after it (`code`); an archive keeps the repository, and its code with it.
     */
    private async cleanupGitHub(
        metadata: EdsMetadata,
        options: EdsCleanupOptions,
    ): Promise<{ result: CleanupOperationResult; code?: CodeRemovalResult }> {
        if (!metadata.githubRepo) {
            return { result: this.createSkippedResult() };
        }

        const [owner, repo] = metadata.githubRepo.split('/');

        if (!owner || !repo) {
            return {
                result: {
                    success: false,
                    skipped: false,
                    error: `Invalid repository name: ${metadata.githubRepo}`,
                },
            };
        }

        const action = options.archiveInsteadOfDelete ? 'archive' : 'delete';
        this.logger.debug(`[Cleanup] ${action} GitHub repository: ${metadata.githubRepo}`);

        try {
            let code: CodeRemovalResult | undefined;
            if (options.archiveInsteadOfDelete) {
                await this.githubRepoOps.archiveRepository(owner, repo);
            } else {
                const deletion = await this.deleteRepository(owner, repo);
                // No working DA.live sign-in: the repository stays, so its code can still go.
                if (deletion.kept) return { result: { success: false, skipped: false, error: deletion.kept } };
                code = deletion.code;
            }

            this.logger.debug(`[Cleanup] GitHub repository ${action}d successfully`);
            return { result: { success: true, skipped: false }, code };
        } catch (error) {
            const errorMessage = (error as Error).message;
            this.logger.error(`[Cleanup] GitHub ${action} failed`, error as Error);
            return {
                result: {
                    success: false,
                    skipped: false,
                    error: errorMessage,
                },
            };
        }
    }

    /**
     * Delete the repository, then its code on aem.live (the files are listed first), or
     * keep a storefront's repository when there is no working DA.live sign-in (`kept`).
     */
    private async deleteRepository(owner: string, repo: string): Promise<StorefrontRepoDeletion> {
        return deleteStorefrontRepository(
            { owner, repo },
            {
                ...this.codeRemoval,
                deleteRepository: (o, r) => this.githubRepoOps.deleteRepository(o, r),
                logger: this.logger,
            },
        );
    }

    /** The code's outcome as a cleanup row: done only when nothing may be left. */
    private siteCodeResult(code: CodeRemovalResult): CleanupOperationResult {
        return code.summary ? { success: false, skipped: false, error: code.summary } : { success: true, skipped: false };
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
