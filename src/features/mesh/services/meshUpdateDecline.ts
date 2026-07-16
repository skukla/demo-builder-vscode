/**
 * Mesh update-decline state (the configure command's "Later" flow).
 *
 * ADR-011 D3 Step 06: the decline flags historically lived only on the
 * singular `meshState`. They now write to BOTH `meshState` and the keyed
 * mesh `appBuilderComponents` entry (the Step-02 both-writes pattern) and
 * read keyed-first, so the flags survive Step 07's retirement of the
 * singular write-side. Pure state helpers — no I/O, the caller saves.
 *
 * @module features/mesh/services/meshUpdateDecline
 */

import { getKeyedMeshAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentState';
import type { Project } from '@/types/base';

/**
 * Mark the mesh update as declined ("Later") on every mesh state the project
 * carries — the legacy `meshState` and the keyed mesh entry get the SAME
 * timestamp (one decline event). Fabricates nothing when neither exists.
 *
 * @param project - The project to mark (mutated in place; caller saves)
 * @returns true when a decline was recorded on at least one state
 */
export function markMeshUpdateDeclined(project: Project): boolean {
    const declinedAt = new Date().toISOString();
    let marked = false;

    if (project.meshState) {
        project.meshState.userDeclinedUpdate = true;
        project.meshState.declinedAt = declinedAt;
        marked = true;
    }

    const keyedMesh = getKeyedMeshAppBuilderComponent(project);
    if (keyedMesh) {
        keyedMesh.userDeclinedUpdate = true;
        keyedMesh.declinedAt = declinedAt;
        marked = true;
    }

    return marked;
}

/**
 * Whether the user declined the pending mesh update. Reads the keyed mesh
 * entry first, falling back to the legacy `meshState` for declines recorded
 * before Step 06 mirrored the write.
 *
 * @param project - The project to check
 * @returns true when a decline flag is set on either state
 */
export function isMeshUpdateDeclined(project: Project): boolean {
    const keyed = getKeyedMeshAppBuilderComponent(project)?.userDeclinedUpdate;
    return (keyed ?? project.meshState?.userDeclinedUpdate) === true;
}
