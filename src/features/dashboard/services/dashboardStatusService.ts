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
import {
    hasEntries,
    getProjectFrontendPort,
    getMeshComponentInstance,
    getMeshEndpointUrl,
} from '@/types/typeGuards';

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
 * Derive the mesh status shown for a project, from PERSISTED state only.
 *
 * Extracted from `handleRequestStatus` so the dashboard and the agent surface
 * cannot describe the same mesh differently — the bug the `status === 'error'`
 * branch below already documents, one layer up.
 *
 * Takes `authenticated` rather than checking, because the two callers must ask
 * the question differently and only one of them may prompt. The dashboard runs
 * `ensureAdobeIOAuth`, which can surface a sign-in warning; a tool has no UI to
 * show it in and must never stall an agent on a dialog, so it passes the result
 * of a silent `isAuthenticated()`. Deciding that inside would force one policy
 * on both.
 *
 * TWO DIFFERENT MESH OBJECTS are in play here and they are not interchangeable.
 * `getMeshComponentInstance` is the COMPONENT INSTANCE, whose `status` drives the
 * deploying/error branches; `hasMeshDeploymentRecord` reads the DEPLOY RECORD
 * (`getMeshAppBuilderComponent`), which is where an endpoint and a timestamp live.
 * The handler this came from uses both, on purpose. Swapping one for the other
 * looks like a simplification and reproduces the 2026-08-04 regression recorded on
 * `hasMeshDeploymentRecord` below — a deployed mesh reading "Not Deployed".
 *
 * @param project The project to describe.
 * @param authenticated Whether Adobe auth is currently usable.
 * @returns The status and whether a deployed mesh warrants background verification
 *          (the dashboard's mesh-verify check; tools ignore it), or `undefined`
 *          when the project has no mesh component at all — which callers pass
 *          through as an absent `mesh` field rather than a "not-deployed" one.
 */
export function deriveMeshStatus(
    project: Project,
    authenticated: boolean,
): { status: string; shouldVerify: boolean } | undefined {
    const mesh = getMeshComponentInstance(project);
    if (!mesh) return undefined;

    if (mesh.status === 'deploying') return { status: 'deploying', shouldVerify: false };

    // A failed deploy is reported WITHOUT consulting meshStatusSummary and without
    // waiting on auth — see the note on the dashboard handler this came from.
    if (mesh.status === 'error') return { status: 'error', shouldVerify: false };

    if (!authenticated) return { status: 'needs-auth', shouldVerify: false };

    if (!hasMeshDeploymentRecord(project)) {
        return { status: 'not-deployed', shouldVerify: false };
    }

    const summary = project.meshStatusSummary;
    if (summary === 'stale') return { status: 'config-changed', shouldVerify: true };
    if (summary === 'unknown' || !summary) return { status: 'deployed', shouldVerify: true };
    return { status: summary, shouldVerify: true };
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
