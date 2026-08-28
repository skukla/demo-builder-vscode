/**
 * Mesh update-decline state (the configure command's "Later" flow).
 *
 * ADR-011 D3 Steps 06+07: the decline flags live on the keyed mesh
 * `appBuilderComponents` entry (the single durable model — the singular
 * `meshState` write-side is retired). Reads stay keyed-first with a legacy
 * fallback for declines recorded by old builds before the keyed mirror.
 * Pure state helpers — no I/O, the caller saves.
 *
 * @module features/mesh/services/meshUpdateDecline
 */

import { getMeshAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import type { Project } from '@/types/base';

/**
 * Mark the mesh update as declined ("Later") on the keyed mesh entry — the
 * single durable model (ADR-011 D3 Step 07; the legacy `meshState` write-side
 * is retired). Fabricates nothing when no keyed mesh entry exists (real flows
 * always have one: the loader migrates legacy manifests on load).
 *
 * @param project - The project to mark (mutated in place; caller saves)
 * @returns true when a decline was recorded
 */
export function markMeshUpdateDeclined(project: Project): boolean {
    const keyedMesh = getMeshAppBuilderComponent(project);
    if (!keyedMesh) {
        return false;
    }

    keyedMesh.userDeclinedUpdate = true;
    keyedMesh.declinedAt = new Date().toISOString();
    return true;
}

/**
 * Whether the user declined the pending mesh update. The keyed mesh entry is
 * the only carrier (PL-1 phase 2 removed the legacy `meshState` fallback —
 * legacy manifests fold their decline flags into the keyed entry at load).
 *
 * @param project - The project to check
 * @returns true when the decline flag is set
 */
export function isMeshUpdateDeclined(project: Project): boolean {
    return getMeshAppBuilderComponent(project)?.userDeclinedUpdate === true;
}
