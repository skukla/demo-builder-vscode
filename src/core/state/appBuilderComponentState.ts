/**
 * AppBuilderComponent State Accessors
 *
 * Pure read/write accessors over the keyed `project.appBuilderComponents` map —
 * the SINGLE persisted authority for App Builder component state (ADR-011 D3;
 * PL-1 phase 2 made it the ONLY in-memory carrier — legacy manifests fold into
 * it at load via the quarantined read-migration). No I/O, no `vscode`.
 *
 * @module features/app-builder/services/appBuilderComponentState
 */

import type { Project, AppBuilderComponentState } from '@/types/base';
import { hasEntries, getMeshEndpointUrl } from '@/types/typeGuards';

/** The canonical key a migrated legacy mesh lands under. */
const MESH_ID = 'mesh';

/** An App Builder component plus its map key, returned by listAppBuilderComponents. */
export interface IdentifiedAppBuilderComponent extends AppBuilderComponentState {
    id: string;
}

/** Read a keyed appBuilderComponent by id (no read-through). */
export function getAppBuilderComponent(
    project: Project,
    id: string,
): AppBuilderComponentState | undefined {
    return project.appBuilderComponents?.[id];
}

// The legacy `meshState`/`appState` synthesis functions lived here until PL-1
// phase 2: the loader has folded legacy manifests into the keyed map on every
// load since ADR-011 D3, so every in-memory Project carries keyed state and
// the read-through fallbacks were unreachable in production. The singular
// fields are gone from `Project` entirely; legacy MANIFESTS still migrate via
// the quarantined appBuilderComponentMigration inside the load path.

/**
 * The keyed mesh entry WITH the id it is stored under.
 *
 * The single resolver for "which mesh?". Anything that needs to ACT on the mesh
 * — remove, redeploy — must take the id from here rather than searching the map
 * itself, because the search has a priority (the canonical `mesh` key first,
 * then the first mesh found) and a second search that omits it can select a
 * DIFFERENT component. That happened live on 2026-08-04: a project with two mesh
 * components showed one mesh on the card and removed the other.
 */
export function getIdentifiedMeshAppBuilderComponent(
    project: Project,
): { id: string; state: AppBuilderComponentState } | undefined {
    const map = project.appBuilderComponents;
    if (!map) return undefined;
    if (map[MESH_ID]?.kind === 'mesh') return { id: MESH_ID, state: map[MESH_ID] };
    const found = Object.entries(map).find(([, state]) => state.kind === 'mesh');
    return found ? { id: found[0], state: found[1] } : undefined;
}

/**
 * Get the mesh appBuilderComponent — the live keyed map object, so
 * runtime-field writes (decline flags, envVars back-fill) land on the
 * persisted entry. Matches by KIND via the identified resolver.
 */
export function getMeshAppBuilderComponent(project: Project): AppBuilderComponentState | undefined {
    return getIdentifiedMeshAppBuilderComponent(project)?.state;
}

/** List every keyed appBuilderComponent with the id it is stored under. */
export function listAppBuilderComponents(project: Project): IdentifiedAppBuilderComponent[] {
    return Object.entries(project.appBuilderComponents ?? {}).map(([id, state]) => ({
        id,
        ...state,
    }));
}

/** Pure: return a new project with `appBuilderComponents[id]` set (does not mutate input). */
export function setAppBuilderComponent(
    project: Project,
    id: string,
    state: AppBuilderComponentState,
): Project {
    return {
        ...project,
        appBuilderComponents: { ...(project.appBuilderComponents ?? {}), [id]: state },
    };
}

/**
 * Collect `providesEnvVars` across all keyed appBuilderComponents into a flat map.
 * Used by step 04 to feed the storefront config from any provider. Empty when
 * no appBuilderComponent provides vars.
 */
export function getProvidedEnvVars(project: Project): Record<string, string> {
    const provided: Record<string, string> = {};
    for (const state of Object.values(project.appBuilderComponents ?? {})) {
        // Object.assign skips an undefined source, so a component that provides
        // nothing needs no guard.
        Object.assign(provided, state.providesEnvVars);
    }
    return provided;
}

/**
 * Has this mesh ever been deployed?
 *
 * The deployment record lives on the keyed mesh `appBuilderComponents` entry
 * (ADR-011 D3 Steps 07+09). Answered from the DEPLOY RECORD — an endpoint or a
 * `lastDeployed` timestamp.
 *
 * REGRESSION (2026-08-04, live): this tested `envVars` alone, which is the mesh
 * STALENESS BASELINE (ADR-011 D3 Step 06), written by `updateMeshState` on the
 * `deployMeshHeadless` path and NOT by the keyed runner's add. A mesh added from
 * the dashboard therefore verified successfully, persisted `status: 'deployed'`
 * with an endpoint and a timestamp — and the grid still read "Not Deployed",
 * while the SAME mesh redeployed read "Deployed". A staleness baseline is not
 * evidence of deployment; it is evidence of one particular writer having run.
 *
 * `envVars` stays in the disjunction: a MIGRATED legacy mesh can carry the
 * baseline without the newer fields, and dropping it would regress those
 * projects the other way.
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
 * Get the deployed mesh endpoint (via getMeshEndpointUrl, ADR-011 D3 Step 06).
 *
 * See docs/architecture/state-ownership.md for details.
 *
 * @param project - The project to check
 * @returns The mesh endpoint value if found, undefined otherwise
 */
export function getMeshEndpoint(project: Project): string | undefined {
    const endpoint = getMeshEndpointUrl(project);
    // A manifest is untyped JSON on disk, so the typeof check is real: a
    // non-string endpoint must read as "none", not throw on trim.
    if (typeof endpoint === 'string' && endpoint.trim() !== '') {
        return endpoint;
    }

    return undefined;
}
