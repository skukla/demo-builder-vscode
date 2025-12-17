/**
 * Dashboard Helpers
 *
 * Pure helper functions and type guards extracted from dashboardHandlers.ts
 * for improved readability and testability (SOP §10 compliance).
 */

import { Project, ComponentInstance } from '@/types';
import { hasEntries, getProjectFrontendPort } from '@/types/typeGuards';

// ============================================================================
// Types
// ============================================================================

/**
 * Mesh status information for dashboard updates
 */
export interface MeshStatusInfo {
    status: string;
    endpoint?: string;
    message?: string;
}

/**
 * Type for project with guaranteed Adobe workspace context
 */
export type ProjectWithAdobeWorkspace = Project & {
    adobe: NonNullable<Project['adobe']> & {
        organization: string;
        projectId: string;
        workspace: string;
    };
};

/**
 * Type for project with guaranteed Adobe project context (no workspace required)
 */
export type ProjectWithAdobeProject = Project & {
    adobe: NonNullable<Project['adobe']> & {
        organization: string;
        projectId: string;
    };
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard: Check if project has full Adobe workspace context (org + project + workspace)
 *
 * Extracts 3-level optional chain: project?.adobe?.organization && project?.adobe?.projectId && project?.adobe?.workspace
 */
export function hasAdobeWorkspaceContext(project: Project | null | undefined): project is ProjectWithAdobeWorkspace {
    if (!project?.adobe) return false;
    const { organization, projectId, workspace } = project.adobe;
    return Boolean(organization && projectId && workspace);
}

/**
 * Type guard: Check if project has Adobe project context (org + project, no workspace required)
 *
 * Extracts 3-level optional chain: project?.adobe?.organization && project?.adobe?.projectId
 */
export function hasAdobeProjectContext(project: Project | null | undefined): project is ProjectWithAdobeProject {
    if (!project?.adobe) return false;
    const { organization, projectId } = project.adobe;
    return Boolean(organization && projectId);
}

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * Build the standard status payload for dashboard updates
 */
export function buildStatusPayload(
    project: Project,
    frontendConfigChanged: boolean,
    mesh?: MeshStatusInfo,
): {
    name: string;
    path: string;
    status: string;
    port: number | undefined;
    adobeOrg: string | undefined;
    adobeProject: string | undefined;
    frontendConfigChanged: boolean;
    mesh?: MeshStatusInfo;
} {
    return {
        name: project.name,
        path: project.path,
        status: project.status || 'ready',
        port: getProjectFrontendPort(project),
        adobeOrg: project.adobe?.organization,
        adobeProject: project.adobe?.projectName,
        frontendConfigChanged,
        mesh,
    };
}

/**
 * Check if mesh has been deployed (has env vars recorded from previous deployment)
 */
export function hasMeshDeploymentRecord(project: Project): boolean {
    return Boolean(project.meshState && hasEntries(project.meshState.envVars));
}

/**
 * Determine mesh status based on changes and component state
 */
export function determineMeshStatus(
    meshChanges: { hasChanges: boolean; unknownDeployedState?: boolean },
    meshComponent: ComponentInstance,
    project: Project,
): 'deployed' | 'config-changed' | 'update-declined' | 'error' | 'checking' {
    if (meshChanges.hasChanges) {
        // User previously declined update → 'update-declined' (orange badge)
        // Otherwise → 'config-changed' (yellow badge)
        return project.meshState?.userDeclinedUpdate ? 'update-declined' : 'config-changed';
    }
    // No config changes: show error if previous deployment failed, otherwise deployed
    return meshComponent.status === 'error' ? 'error' : 'deployed';
}

/**
 * Check if we should perform async mesh status check
 * (mesh exists, not currently deploying, and not in error state)
 */
export function shouldAsyncCheckMesh(meshComponent: ComponentInstance | undefined): boolean {
    return Boolean(meshComponent && meshComponent.status !== 'deploying' && meshComponent.status !== 'error');
}
