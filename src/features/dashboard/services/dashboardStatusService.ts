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

import type { OrgMismatchInfo } from '@/features/authentication/services/detectProjectOrgMismatch';
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
    edsStorefrontStatus?: 'published' | 'stale' | 'update-declined' | 'not-published';
    /**
     * Present when the project's Adobe org is NOT reachable by the current
     * token (proactive entry check). Drives the dashboard "Switch Adobe
     * Account" banner. Absent when there's no mismatch.
     */
    orgMismatch?: OrgMismatchInfo;
}

/**
 * Build the standard status payload for dashboard updates
 *
 * @param project - The project to build status for
 * @param frontendConfigChanged - Whether frontend config has changed
 * @param mesh - Optional mesh status info
 * @param orgMismatch - Optional proactive org-context mismatch info
 * @returns Status payload for UI
 */
export function buildStatusPayload(
    project: Project,
    frontendConfigChanged: boolean,
    mesh?: MeshStatusInfo,
    orgMismatch?: OrgMismatchInfo,
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
        edsStorefrontStatus: project.edsStorefrontStatusSummary,
        orgMismatch,
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
 * Get mesh endpoint from meshState (single source of truth)
 *
 * See docs/architecture/state-ownership.md for details.
 *
 * @param project - The project to check
 * @returns The mesh endpoint value if found, undefined otherwise
 */
export function getMeshEndpoint(project: Project): string | undefined {
    const endpoint = project.meshState?.endpoint;
    if (endpoint && typeof endpoint === 'string' && endpoint.trim() !== '') {
        return endpoint;
    }

    return undefined;
}
