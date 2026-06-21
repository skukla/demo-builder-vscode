/**
 * Deployable State Accessors (Step 01)
 *
 * Pure read/write accessors over the keyed `project.deployables` map. In D1
 * these READ THROUGH to the legacy singular `meshState`/`appState` so behavior
 * is unchanged — the legacy singletons stay authoritative. No I/O, no `vscode`.
 *
 * @module features/app-builder/services/deployableState
 */

import type { Project, DeployableState, DeployableKind } from '@/types/base';

/** Stable id for the read-through mesh deployable synthesized from `meshState`. */
const MESH_ID = 'mesh';
/** Fallback id for the read-through integration when `appState.appId` is absent. */
const APP_ID_FALLBACK = 'app';

const DEPLOYABLE_KINDS: readonly DeployableKind[] = ['mesh', 'integration'];

/** A deployable plus its map key, returned by listDeployables. */
export interface IdentifiedDeployable extends DeployableState {
    id: string;
}

/** Type guard: rejects malformed objects (missing/invalid `kind`). */
export function isDeployableState(value: unknown): value is DeployableState {
    if (typeof value !== 'object' || value === null) return false;
    const kind = (value as { kind?: unknown }).kind;
    return typeof kind === 'string' && (DEPLOYABLE_KINDS as readonly string[]).includes(kind);
}

/** Read a keyed deployable by id (no read-through). */
export function getDeployable(project: Project, id: string): DeployableState | undefined {
    return project.deployables?.[id];
}

/** Synthesize a mesh DeployableState from the legacy `meshState`. */
function synthesizeMeshFromLegacy(project: Project): DeployableState | undefined {
    const mesh = project.meshState;
    if (!mesh) return undefined;
    return {
        kind: 'mesh',
        status: mesh.endpoint ? 'deployed' : 'not-deployed',
        source: { owner: '', repo: '' },
        endpoint: mesh.endpoint,
        sourceHash: mesh.sourceHash,
        lastDeployed: mesh.lastDeployed,
    };
}

/** Synthesize an integration DeployableState from the legacy `appState`. */
function synthesizeAppFromLegacy(project: Project): DeployableState | undefined {
    const app = project.appState;
    if (!app) return undefined;
    return {
        kind: 'integration',
        status: app.status,
        source: { owner: '', repo: '' },
        url: app.url,
        deployedUrls: app.deployedUrls,
        sourceHash: app.sourceHash,
        lastDeployed: app.lastDeployed,
    };
}

/**
 * Get the mesh deployable. Prefers the keyed entry; falls back to a
 * read-through synthesis of the legacy `meshState`.
 */
export function getMeshDeployable(project: Project): DeployableState | undefined {
    const keyed = project.deployables?.[MESH_ID];
    if (keyed) return keyed;
    return synthesizeMeshFromLegacy(project);
}

/**
 * Get all integration deployables. Merges keyed `kind:'integration'` entries
 * with a read-through synthesis of the legacy `appState`.
 */
export function getIntegrationDeployables(project: Project): DeployableState[] {
    const keyed = Object.values(project.deployables ?? {}).filter(d => d.kind === 'integration');
    if (keyed.length > 0) return keyed;
    const legacy = synthesizeAppFromLegacy(project);
    return legacy ? [legacy] : [];
}

/** The read-through id for the legacy app (its appId, or a stable fallback). */
function legacyAppId(project: Project): string {
    return project.appState?.appId ?? APP_ID_FALLBACK;
}

/**
 * List every deployable with its id: keyed entries plus read-through
 * singletons, de-duplicated by id (keyed entries win).
 */
export function listDeployables(project: Project): IdentifiedDeployable[] {
    const result: IdentifiedDeployable[] = [];
    const seen = new Set<string>();

    for (const [id, state] of Object.entries(project.deployables ?? {})) {
        result.push({ id, ...state });
        seen.add(id);
    }

    if (!seen.has(MESH_ID)) {
        const mesh = synthesizeMeshFromLegacy(project);
        if (mesh) {
            result.push({ id: MESH_ID, ...mesh });
            seen.add(MESH_ID);
        }
    }

    const hasKeyedIntegration = result.some(d => d.kind === 'integration');
    if (!hasKeyedIntegration) {
        const app = synthesizeAppFromLegacy(project);
        const appId = legacyAppId(project);
        if (app && !seen.has(appId)) {
            result.push({ id: appId, ...app });
        }
    }

    return result;
}

/** Pure: return a new project with `deployables[id]` set (does not mutate input). */
export function setDeployable(project: Project, id: string, state: DeployableState): Project {
    return {
        ...project,
        deployables: { ...(project.deployables ?? {}), [id]: state },
    };
}

/**
 * Collect `providesEnvVars` across all keyed deployables into a flat map.
 * Used by step 04 to feed the storefront config from any provider. Empty when
 * no deployable provides vars.
 */
export function getProvidedEnvVars(project: Project): Record<string, string> {
    const provided: Record<string, string> = {};
    for (const state of Object.values(project.deployables ?? {})) {
        if (state.providesEnvVars) {
            Object.assign(provided, state.providesEnvVars);
        }
    }
    return provided;
}
