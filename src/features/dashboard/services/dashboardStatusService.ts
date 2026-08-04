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

import { getMeshAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentState';
import { Project } from '@/types';
import { hasEntries, getProjectFrontendPort, getMeshEndpointUrl } from '@/types/typeGuards';

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
}

/**
 * Build the standard status payload for dashboard updates
 *
 * @param project - The project to build status for
 * @param frontendConfigChanged - Whether frontend config has changed
 * @param mesh - Optional mesh status info
 * @returns Status payload for UI
 *
 * Note: org-context mismatch is NOT part of this payload — it's delivered
 * separately via the on-open check orchestrator's `checkResult` message
 * (checkId `org-context`) so the org check never blocks the dashboard status.
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
        edsStorefrontStatus: project.edsStorefrontStatusSummary,
    };
}

/**
 * Has this mesh ever been deployed?
 *
 * Keyed-first (ADR-011 D3 Steps 07+09): the deployment record lives on the keyed
 * mesh `appBuilderComponents` entry; the accessor synthesizes from the legacy
 * `meshState` for pre-migration projects.
 *
 * Answered from the DEPLOY RECORD — an endpoint or a `lastDeployed` timestamp.
 *
 * REGRESSION (2026-08-04, live): this tested `envVars` alone, which is the mesh
 * STALENESS BASELINE (ADR-011 D3 Step 06), written by `updateMeshState` on the
 * `deployMeshHeadless` path and NOT by the keyed runner's add. A mesh added from
 * the dashboard therefore verified successfully, persisted `status: 'deployed'`
 * with an endpoint and a timestamp — and the grid still read "Not Deployed",
 * while the SAME mesh redeployed read "Deployed". A staleness baseline is not
 * evidence of deployment; it is evidence of one particular writer having run.
 *
 * `envVars` stays in the disjunction: a pre-migration `meshState` can carry the
 * baseline without the newer fields, and dropping it would regress those projects
 * the other way.
 *
 * @param project - The project to check
 * @returns True if project has mesh deployment record
 */
export function hasMeshDeploymentRecord(project: Project): boolean {
    const mesh = getMeshAppBuilderComponent(project);
    if (!mesh) return false;
    return Boolean(mesh.endpoint) || Boolean(mesh.lastDeployed) || hasEntries(mesh.envVars);
}

/**
 * Get the deployed mesh endpoint (keyed-first via getMeshEndpointUrl,
 * ADR-011 D3 Step 06; legacy meshState fallback preserved).
 *
 * See docs/architecture/state-ownership.md for details.
 *
 * @param project - The project to check
 * @returns The mesh endpoint value if found, undefined otherwise
 */
export function getMeshEndpoint(project: Project): string | undefined {
    const endpoint = getMeshEndpointUrl(project);
    if (endpoint && typeof endpoint === 'string' && endpoint.trim() !== '') {
        return endpoint;
    }

    return undefined;
}
