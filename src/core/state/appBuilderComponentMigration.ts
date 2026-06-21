/**
 * Legacy → appBuilderComponents read-migration (Step 02)
 *
 * Maps the singular `meshState`/`appState` from a project manifest into the
 * keyed `appBuilderComponents` map. Runs at LOAD time only — on-disk manifests are NOT
 * rewritten in D1, so this must be idempotent (a forward-state manifest with
 * `appBuilderComponents` already present is returned unchanged) and defensive against
 * malformed/partial legacy state (no throw, no silent drop).
 *
 * @module core/state/appBuilderComponentMigration
 */

import type { ProjectManifest } from './projectFileLoader';
import type { AppBuilderComponentState } from '@/types/base';

/** Stable id for the migrated mesh appBuilderComponent. */
const MESH_ID = 'mesh';
/** Fallback id for a migrated app with no appId. */
const APP_ID_FALLBACK = 'app';

/** Map a legacy meshState into a mesh AppBuilderComponentState (defensive). */
function meshToAppBuilderComponent(mesh: NonNullable<ProjectManifest['meshState']>): AppBuilderComponentState {
    return {
        kind: 'mesh',
        status: mesh.endpoint ? 'deployed' : 'not-deployed',
        source: { owner: '', repo: '' },
        endpoint: mesh.endpoint,
        sourceHash: mesh.sourceHash,
        lastDeployed: mesh.lastDeployed,
    };
}

/** Map a legacy appState into an integration AppBuilderComponentState (defensive). */
function appToAppBuilderComponent(app: NonNullable<ProjectManifest['appState']>): AppBuilderComponentState {
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
 * Migrate a manifest's legacy singular state into a keyed appBuilderComponents map.
 *
 * - Forward-state manifest (already has `appBuilderComponents`) → returned unchanged.
 * - meshState → one `mesh` entry; appState → one integration entry keyed by
 *   its appId (or a stable fallback).
 * - Neither → `{}` (no key fabricated).
 */
export function migrateLegacyToAppBuilderComponents(
    manifest: ProjectManifest,
): Record<string, AppBuilderComponentState> {
    if (manifest.appBuilderComponents) {
        return manifest.appBuilderComponents;
    }

    const appBuilderComponents: Record<string, AppBuilderComponentState> = {};

    if (manifest.meshState) {
        appBuilderComponents[MESH_ID] = meshToAppBuilderComponent(manifest.meshState);
    }

    if (manifest.appState) {
        const appId = manifest.appState.appId ?? APP_ID_FALLBACK;
        appBuilderComponents[appId] = appToAppBuilderComponent(manifest.appState);
    }

    return appBuilderComponents;
}
