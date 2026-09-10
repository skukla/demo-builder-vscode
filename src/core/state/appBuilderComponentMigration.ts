/**
 * Legacy → appBuilderComponents read-migration
 *
 * Maps the singular `meshState`/`appState` from a project manifest into the
 * keyed `appBuilderComponents` map. As of ADR-011 D3 Step 01 the keyed map is
 * PERSISTED in the manifest and the loader prefers it — this migration is the
 * LEGACY FALLBACK for old manifests that carry no keyed map. It runs at LOAD
 * time only, is idempotent (a forward-state manifest with `appBuilderComponents`
 * already present is returned unchanged) and defensive against malformed/partial
 * legacy state (no throw, no silent drop).
 *
 * @module core/state/appBuilderComponentMigration
 */

import type { ProjectManifest } from './projectFileLoader';
import type { AppBuilderComponentState } from '@/types/base';

/** Stable id for the migrated mesh appBuilderComponent. */
const MESH_ID = 'mesh';
/** Fallback id for a migrated app with no appId. */
const APP_ID_FALLBACK = 'app';

/**
 * A legacy field is usable only when it is a plain object (manifests are
 * arbitrary user-editable JSON — a corrupt string/number/array/null must be
 * skipped, never turned into a fabricated entry; D3 Step 09). The ONE gate:
 * callers do not pre-check truthiness, so this predicate owns the null case.
 */
function isUsableLegacyState<T>(value: T): value is NonNullable<T> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Map a legacy meshState into a mesh AppBuilderComponentState (defensive). */
function meshToAppBuilderComponent(mesh: NonNullable<ProjectManifest['meshState']>): AppBuilderComponentState {
    return {
        kind: 'mesh',
        status: mesh.endpoint ? 'deployed' : 'not-deployed',
        source: { owner: '', repo: '' },
        endpoint: mesh.endpoint,
        sourceHash: mesh.sourceHash,
        lastDeployed: mesh.lastDeployed,
        // Mesh runtime baseline + decline flow (ADR-011 D3 Steps 07+09): once
        // Step 07 stops persisting meshState, the migrated keyed entry is the
        // ONLY durable carrier of these fields — dropping them here would lose
        // the staleness baseline on a legacy project's first save.
        envVars: mesh.envVars ?? {},
        userDeclinedUpdate: mesh.userDeclinedUpdate,
        declinedAt: mesh.declinedAt,
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

    if (isUsableLegacyState(manifest.meshState)) {
        appBuilderComponents[MESH_ID] = meshToAppBuilderComponent(manifest.meshState);
    }

    if (isUsableLegacyState(manifest.appState)) {
        const appId = manifest.appState.appId ?? APP_ID_FALLBACK;
        appBuilderComponents[appId] = appToAppBuilderComponent(manifest.appState);
    }

    return appBuilderComponents;
}
