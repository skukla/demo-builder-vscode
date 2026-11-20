/**
 * The project's record of a mesh that is gone from Adobe I/O.
 *
 * Shared by the two places that learn it: a verify that finds the mesh missing
 * (`meshVerifier.syncMeshStatus`) and the agent's `delete_mesh`, which deleted it
 * (PL-104 fix 5). The delete used to save nothing, so the card read "Deployed" over
 * a mesh that no longer existed.
 *
 * @module features/mesh/services/meshGone
 */

import type { Project } from '@/types/base';
import { getMeshComponentInstance } from '@/types/typeGuards';

/**
 * Record on the project that its mesh is gone from Adobe I/O: found missing by a verify, or
 * deleted by `delete_mesh`. Mutates `project`; the caller saves it.
 *
 * Clears the VOLATILE deploy record on the keyed mesh entry (status/endpoint/envVars/
 * lastDeployed/sourceHash) while PRESERVING its identity fields (kind/source/name/
 * providesEnvVars), so a later redeploy re-lands on the SAME entry via recordDeployOutcome
 * (ADR-011 D3; integration siblings are untouched). The mesh component itself stays,
 * `ready` rather than deployed.
 *
 * @param project - the project whose mesh is gone
 */
export function recordMeshGone(project: Project): void {
    for (const state of Object.values(project.appBuilderComponents ?? {})) {
        if (state.kind === 'mesh') {
            state.status = 'not-deployed';
            state.endpoint = undefined;
            state.envVars = undefined;
            state.lastDeployed = undefined;
            state.sourceHash = undefined;
        }
    }
    const meshComponent = getMeshComponentInstance(project);
    if (meshComponent) {
        meshComponent.status = 'ready';
    }
}
