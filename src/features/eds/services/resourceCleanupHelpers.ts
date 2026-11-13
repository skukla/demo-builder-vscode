/**
 * Resource Cleanup Helpers
 *
 * Shared helper functions for EDS resource cleanup operations.
 * Used by project deletion, DA.live management, and GitHub management commands.
 *
 * Functions:
 * - extractEdsMetadata: Extract EDS metadata from project
 * - getLinkedEdsProjects: Get all projects with EDS metadata
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
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
 * Individual cleanup result for formatting
 */
export interface CleanupResultItem {
    /** Resource type */
    type: 'github' | 'daLive' | 'helix' | 'backend' | 'datapack';
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
 * Extract EDS metadata from a project's componentInstances
 * @param project - Project to extract metadata from
 * @returns EDS metadata, or null when the project has no Edge Delivery storefront
 *   component. (A second `isEdsProject` here, by component rather than by stack,
 *   was deleted 2026-10-13: this read was its only use, and the instance check
 *   below already said the same. `isEdsProject` in `@/types/typeGuards` is the one.)
 */
export function extractEdsMetadata(project: Project): EdsProjectMetadata | null {
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!edsInstance) {
        return null;
    }

    // Metadata is stored as Record<string, unknown> on the component instance
    const metadata = edsInstance.metadata as Record<string, unknown> | undefined;

    const githubRepo = metadata?.githubRepo as string | undefined;
    return {
        githubRepo,
        // Both halves fall back to the repo, and for the same reason: the DA.live
        // org IS the GitHub namespace and the site name IS the repo name. The
        // cleanups below gate on BOTH, so a project missing either silently
        // skipped taking its storefront down (owner sweep, 2026-09-20).
        daLiveOrg: (metadata?.daLiveOrg as string | undefined) ?? githubRepo?.split('/')[0],
        // Legacy-first, repo fallback (the loader strips the equal copy) —
        // without it, deleting a migrated project skipped the DA site cleanup.
        daLiveSite:
            (metadata?.daLiveSite as string | undefined) ?? githubRepo?.split('/')[1],
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

        if (project) {
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
