/**
 * Dashboard Status Service
 *
 * Business logic for dashboard status operations.
 * Extracted from meshStatusHelpers.ts for proper service layer separation.
 *
 * Responsibilities:
 * - Building status payloads for UI updates
 * - Checking mesh deployment records
 * - Extracting mesh endpoint from configurations
 */

import { Project } from '@/types';
import { hasEntries, getProjectFrontendPort } from '@/types/typeGuards';

/**
 * Mesh status info for UI updates
 */
export interface MeshStatusInfo {
    status: string;
    endpoint?: string;
    message?: string;
}

/**
 * Status payload for dashboard updates
 */
export interface StatusPayload {
    name: string;
    path: string;
    status: string;
    port: number | undefined;
    adobeOrg: string | undefined;
    adobeProject: string | undefined;
    frontendConfigChanged: boolean;
    mesh?: MeshStatusInfo;
}

/**
 * Build the standard status payload for dashboard updates
 *
 * @param project - The project to build status for
 * @param frontendConfigChanged - Whether frontend config has changed
 * @param mesh - Optional mesh status info
 * @returns Status payload for UI
 */
export function buildStatusPayload(
    project: Project,
    frontendConfigChanged: boolean,
    mesh?: MeshStatusInfo,
): StatusPayload {
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
 *
 * @param project - The project to check
 * @returns True if project has mesh deployment record
 */
export function hasMeshDeploymentRecord(project: Project): boolean {
    return Boolean(project.meshState && hasEntries(project.meshState.envVars));
}

/**
 * Get mesh endpoint from componentInstances (single source of truth)
 *
 * @param project - The project to check
 * @returns The mesh endpoint value if found, undefined otherwise
 */
export function getMeshEndpoint(project: Project): string | undefined {
    const meshEndpoint = project.componentInstances?.['commerce-mesh']?.endpoint;
    if (meshEndpoint && typeof meshEndpoint === 'string' && meshEndpoint.trim() !== '') {
        return meshEndpoint;
    }

    return undefined;
}
