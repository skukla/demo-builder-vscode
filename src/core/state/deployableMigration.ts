/**
 * Legacy → deployables read-migration (Step 02)
 *
 * Maps the singular `meshState`/`appState` from a project manifest into the
 * keyed `deployables` map. Runs at LOAD time only — on-disk manifests are NOT
 * rewritten in D1, so this must be idempotent (a forward-state manifest with
 * `deployables` already present is returned unchanged) and defensive against
 * malformed/partial legacy state (no throw, no silent drop).
 *
 * @module core/state/deployableMigration
 */

import type { ProjectManifest } from './projectFileLoader';
import type { DeployableState } from '@/types/base';

/** Stable id for the migrated mesh deployable. */
const MESH_ID = 'mesh';
/** Fallback id for a migrated app with no appId. */
const APP_ID_FALLBACK = 'app';

/** Map a legacy meshState into a mesh DeployableState (defensive). */
function meshToDeployable(mesh: NonNullable<ProjectManifest['meshState']>): DeployableState {
    return {
        kind: 'mesh',
        status: mesh.endpoint ? 'deployed' : 'not-deployed',
        source: { owner: '', repo: '' },
        endpoint: mesh.endpoint,
        sourceHash: mesh.sourceHash,
        lastDeployed: mesh.lastDeployed,
    };
}

/** Map a legacy appState into an integration DeployableState (defensive). */
function appToDeployable(app: NonNullable<ProjectManifest['appState']>): DeployableState {
    return {
        kind: 'integration',
        status: app.status ?? 'not-deployed',
        source: { owner: '', repo: '' },
        url: app.url,
        deployedUrls: app.deployedUrls,
        sourceHash: app.sourceHash,
        lastDeployed: app.lastDeployed,
    };
}

/**
 * Migrate a manifest's legacy singular state into a keyed deployables map.
 *
 * - Forward-state manifest (already has `deployables`) → returned unchanged.
 * - meshState → one `mesh` entry; appState → one integration entry keyed by
 *   its appId (or a stable fallback).
 * - Neither → `{}` (no key fabricated).
 */
export function migrateLegacyToDeployables(
    manifest: ProjectManifest,
): Record<string, DeployableState> {
    if (manifest.deployables) {
        return manifest.deployables;
    }

    const deployables: Record<string, DeployableState> = {};

    if (manifest.meshState) {
        deployables[MESH_ID] = meshToDeployable(manifest.meshState);
    }

    if (manifest.appState) {
        const appId = manifest.appState.appId ?? APP_ID_FALLBACK;
        deployables[appId] = appToDeployable(manifest.appState);
    }

    return deployables;
}
