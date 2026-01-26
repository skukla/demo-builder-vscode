/**
 * Resource Cleanup Helpers
 *
 * Shared helper functions for EDS resource cleanup operations.
 * Used by project deletion, DA.live management, and GitHub management commands.
 *
 * Functions:
 * - isEdsProject: Check if a project has EDS component
 * - extractEdsMetadata: Extract EDS metadata from project
 * - getLinkedEdsProjects: Get all projects with EDS metadata
 * - deleteDaLiveSiteWithUnpublish: Combined Helix unpublish + DA.live delete
 * - formatCleanupResults: Human-readable cleanup summary
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';
import type { DaLiveOrgOperations } from './daLiveOrgOperations';
import type { HelixService, UnpublishResult } from './helixService';
import type { StateManager } from '@/types/state';

// ==========================================================
// Types
// ==========================================================

/**
 * EDS project metadata extracted from componentInstances
 */
export interface EdsProjectMetadata {
    /** GitHub repository full name (owner/repo) */
    githubRepo: string | undefined;
    /** DA.live organization name */
    daLiveOrg: string | undefined;
    /** DA.live site name */
    daLiveSite: string | undefined;
    /** Helix site URL for unpublishing */
    helixSiteUrl?: string | undefined;
    /** Backend type for data cleanup */
    backendType?: 'commerce' | 'aco' | undefined;
}

/**
 * Project info with EDS metadata for management commands
 */
export interface EdsProjectInfo {
    /** Project name */
    name: string;
    /** Project path */
    path: string;
    /** EDS metadata */
    metadata: EdsProjectMetadata;
}

/**
 * Result of combined DA.live site deletion with Helix unpublish
 */
export interface DaLiveSiteCleanupResult {
    /** Overall success */
    success: boolean;
    /** Whether Helix unpublish succeeded */
    helixUnpublished: boolean;
    /** Whether DA.live site was deleted */
    daLiveDeleted: boolean;
    /** Error message if operation failed */
    error?: string;
    /** Detailed results for each operation */
    details?: {
        helix?: UnpublishResult;
        daLiveAlreadyDeleted?: boolean;
    };
}

/**
 * Individual cleanup result for formatting
 */
export interface CleanupResultItem {
    /** Resource type */
    type: 'github' | 'daLive' | 'helix' | 'backend';
    /** Resource name/identifier */
    name: string;
    /** Whether operation succeeded */
    success: boolean;
    /** Whether operation was skipped */
    skipped?: boolean;
    /** Error message if failed */
    error?: string;
}

// ==========================================================
// Detection & Extraction Functions
// ==========================================================

/**
 * Check if a project is an EDS project (has eds-storefront component)
 * @param project - Project to check
 * @returns true if project has EDS component
 */
export function isEdsProject(project: Project): boolean {
    if (!project.componentInstances) {
        return false;
    }
    return COMPONENT_IDS.EDS_STOREFRONT in project.componentInstances;
}

/**
 * Extract EDS metadata from a project's componentInstances
 * @param project - Project to extract metadata from
 * @returns EDS metadata or null if not an EDS project
 */
export function extractEdsMetadata(project: Project): EdsProjectMetadata | null {
    if (!isEdsProject(project)) {
        return null;
    }

    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!edsInstance) {
        return null;
    }

    // Metadata is stored as Record<string, unknown> on the component instance
    const metadata = edsInstance.metadata as Record<string, unknown> | undefined;

    return {
        githubRepo: metadata?.githubRepo as string | undefined,
        daLiveOrg: metadata?.daLiveOrg as string | undefined,
        daLiveSite: metadata?.daLiveSite as string | undefined,
        helixSiteUrl: metadata?.helixSiteUrl as string | undefined,
        backendType: metadata?.backendType as 'commerce' | 'aco' | undefined,
    };
}

/**
 * Get all projects that have EDS metadata
 * @param stateManager - StateManager to get projects from
 * @returns Array of projects with their EDS metadata
 */
export async function getLinkedEdsProjects(
    stateManager: StateManager,
): Promise<EdsProjectInfo[]> {
    const allProjects = await stateManager.getAllProjects();
    const edsProjects: EdsProjectInfo[] = [];

    for (const projectSummary of allProjects) {
        // Load full project data to access componentInstances
        const project = await stateManager.loadProjectFromPath(
            projectSummary.path,
            () => [],
            { persistAfterLoad: false },
        );

        if (project && isEdsProject(project)) {
            const metadata = extractEdsMetadata(project);
            if (metadata) {
                edsProjects.push({
                    name: project.name,
                    path: project.path,
                    metadata,
                });
            }
        }
    }

    return edsProjects;
}

// ==========================================================
// Combined Cleanup Operations
// ==========================================================

/**
 * Delete a DA.live site with Helix unpublish (recommended approach)
 *
 * This function performs the cleanup in the correct order:
 * 1. Unpublish from Helix CDN (live + preview) to remove cached content
 * 2. Delete the DA.live site content
 *
 * @param helixService - HelixService for CDN operations
 * @param daLiveOrgOps - DaLiveOrgOperations for site deletion
 * @param repoFullName - GitHub repo full name (owner/repo) for Helix unpublish
 * @param daLiveOrg - DA.live organization name
 * @param daLiveSite - DA.live site name
 * @param logger - Logger instance
 * @returns Cleanup result with details for each operation
 */
export async function deleteDaLiveSiteWithUnpublish(
    helixService: HelixService,
    daLiveOrgOps: DaLiveOrgOperations,
    repoFullName: string | undefined,
    daLiveOrg: string,
    daLiveSite: string,
    logger: Logger,
): Promise<DaLiveSiteCleanupResult> {
    const result: DaLiveSiteCleanupResult = {
        success: false,
        helixUnpublished: false,
        daLiveDeleted: false,
        details: {},
    };

    // Step 1: Unpublish from Helix (if we have repo info)
    if (repoFullName) {
        try {
            logger.debug(`[Cleanup] Unpublishing from Helix: ${repoFullName}`);
            const helixResult = await helixService.unpublishSite(repoFullName);
            result.details!.helix = helixResult;

            // Consider success if either live or preview was unpublished
            result.helixUnpublished = helixResult.liveUnpublished || helixResult.previewDeleted;

            if (result.helixUnpublished) {
                logger.debug('[Cleanup] Helix unpublished successfully');
            } else {
                const errors = [helixResult.liveError, helixResult.previewError].filter(Boolean).join('; ');
                logger.warn(`[Cleanup] Helix unpublish partial/failed: ${errors}`);
            }
        } catch (error) {
            const errorMessage = (error as Error).message;
            logger.warn(`[Cleanup] Helix unpublish failed: ${errorMessage}`);
            // Continue with DA.live deletion even if Helix fails
            // The CDN content will eventually expire
        }
    } else {
        logger.debug('[Cleanup] Skipping Helix unpublish - no repo info available');
        // Mark as "success" since there's nothing to unpublish
        result.helixUnpublished = true;
    }

    // Step 2: Delete DA.live site
    try {
        logger.debug(`[Cleanup] Deleting DA.live site: ${daLiveOrg}/${daLiveSite}`);
        const daLiveResult = await daLiveOrgOps.deleteSite(daLiveOrg, daLiveSite);
        result.daLiveDeleted = daLiveResult.success;
        result.details!.daLiveAlreadyDeleted = daLiveResult.alreadyDeleted;

        if (result.daLiveDeleted) {
            logger.debug(`[Cleanup] DA.live site deleted${daLiveResult.alreadyDeleted ? ' (was already deleted)' : ''}`);
        }
    } catch (error) {
        const errorMessage = (error as Error).message;
        logger.error(`[Cleanup] DA.live deletion failed: ${errorMessage}`);
        result.error = `DA.live deletion failed: ${errorMessage}`;
    }

    // Overall success: DA.live must be deleted (Helix is best-effort)
    result.success = result.daLiveDeleted;

    return result;
}

// ==========================================================
// Results Formatting
// ==========================================================

/**
 * Format cleanup results into human-readable summary
 * @param results - Array of cleanup results
 * @returns Formatted summary string
 */
export function formatCleanupResults(results: CleanupResultItem[]): string {
    if (results.length === 0) {
        return 'No cleanup operations performed.';
    }

    const succeeded = results.filter(r => r.success && !r.skipped);
    const failed = results.filter(r => !r.success && !r.skipped);
    const skipped = results.filter(r => r.skipped);

    const lines: string[] = [];

    if (succeeded.length > 0) {
        const successItems = succeeded.map(r => formatResourceName(r.type, r.name)).join(', ');
        lines.push(`✓ Cleaned up: ${successItems}`);
    }

    if (failed.length > 0) {
        for (const result of failed) {
            const name = formatResourceName(result.type, result.name);
            lines.push(`✗ Failed: ${name}${result.error ? ` - ${result.error}` : ''}`);
        }
    }

    if (skipped.length > 0) {
        const skippedItems = skipped.map(r => formatResourceName(r.type, r.name)).join(', ');
        lines.push(`○ Skipped: ${skippedItems}`);
    }

    return lines.join('\n');
}

/**
 * Format a resource type and name for display
 */
function formatResourceName(type: CleanupResultItem['type'], name: string): string {
    switch (type) {
        case 'github':
            return `GitHub repo (${name})`;
        case 'daLive':
            return `DA.live site (${name})`;
        case 'helix':
            return `Helix CDN (${name})`;
        case 'backend':
            return `Backend data (${name})`;
        default:
            return name;
    }
}

/**
 * Create a summary message for cleanup operations
 * @param results - Array of cleanup results
 * @returns Object with summary counts and message
 */
export function summarizeCleanupResults(results: CleanupResultItem[]): {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
    message: string;
} {
    const succeeded = results.filter(r => r.success && !r.skipped).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;

    let message: string;
    if (failed === 0 && succeeded > 0) {
        message = `Successfully cleaned up ${succeeded} resource${succeeded !== 1 ? 's' : ''}.`;
    } else if (failed > 0 && succeeded > 0) {
        message = `Cleaned up ${succeeded} resource${succeeded !== 1 ? 's' : ''}, ${failed} failed.`;
    } else if (failed > 0 && succeeded === 0) {
        message = `Failed to clean up ${failed} resource${failed !== 1 ? 's' : ''}.`;
    } else {
        message = 'No resources were cleaned up.';
    }

    return {
        total: results.length,
        succeeded,
        failed,
        skipped,
        message,
    };
}
