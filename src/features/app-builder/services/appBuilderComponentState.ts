/**
 * AppBuilderComponent State Accessors
 *
 * Pure read/write accessors over the keyed `project.appBuilderComponents` map —
 * the SINGLE persisted authority for App Builder component state (ADR-011 D3:
 * the singular `meshState`/`appState` write-side is retired; legacy manifests
 * migrate on load). The `synthesize*FromLegacy` functions are the legacy READ
 * fallback for pre-migration in-memory projects only. No I/O, no `vscode`.
 *
 * @module features/app-builder/services/appBuilderComponentState
 */

import type { Project, AppBuilderComponentState, AppBuilderComponentKind } from '@/types/base';

/** Stable id for the read-through mesh appBuilderComponent synthesized from `meshState`. */
const MESH_ID = 'mesh';
/** Fallback id for the read-through integration when `appState.appId` is absent. */
const APP_ID_FALLBACK = 'app';

const APP_BUILDER_COMPONENT_KINDS: readonly AppBuilderComponentKind[] = ['mesh', 'integration'];

/** An App Builder component plus its map key, returned by listAppBuilderComponents. */
export interface IdentifiedAppBuilderComponent extends AppBuilderComponentState {
    id: string;
}

/** Type guard: rejects malformed objects (missing/invalid `kind`). */
export function isAppBuilderComponentState(value: unknown): value is AppBuilderComponentState {
    if (typeof value !== 'object' || value === null) return false;
    const kind = (value as { kind?: unknown }).kind;
    return typeof kind === 'string' && (APP_BUILDER_COMPONENT_KINDS as readonly string[]).includes(kind);
}

/** Read a keyed appBuilderComponent by id (no read-through). */
export function getAppBuilderComponent(project: Project, id: string): AppBuilderComponentState | undefined {
    return project.appBuilderComponents?.[id];
}

/** Synthesize a mesh AppBuilderComponentState from the legacy `meshState`. */
function synthesizeMeshFromLegacy(project: Project): AppBuilderComponentState | undefined {
    const mesh = project.meshState;
    if (!mesh) return undefined;
    return {
        kind: 'mesh',
        status: mesh.endpoint ? 'deployed' : 'not-deployed',
        source: { owner: '', repo: '' },
        endpoint: mesh.endpoint,
        sourceHash: mesh.sourceHash,
        lastDeployed: mesh.lastDeployed,
        // Runtime fields (ADR-011 D3 Steps 07+09): readers of the staleness
        // baseline / decline flags / deployment record go through this accessor,
        // so the legacy synthesis must carry them for in-memory-legacy projects.
        envVars: mesh.envVars,
        userDeclinedUpdate: mesh.userDeclinedUpdate,
        declinedAt: mesh.declinedAt,
    };
}

/** Synthesize an integration AppBuilderComponentState from the legacy `appState`. */
function synthesizeAppFromLegacy(project: Project): AppBuilderComponentState | undefined {
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
 * Get the KEYED mesh entry only (no legacy synthesis) — the live map object,
 * so runtime-field writes (decline flags, envVars back-fill) land on the
 * persisted entry. Matches by KIND: the migrated key is 'mesh', but
 * `recordDeployOutcome` keys never-migrated projects by the mesh component
 * instance id (ADR-011 D3 Step 06).
 */
export function getKeyedMeshAppBuilderComponent(
    project: Project,
): AppBuilderComponentState | undefined {
    return getIdentifiedMeshAppBuilderComponent(project)?.state;
}

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
 * Get the mesh appBuilderComponent. Prefers the keyed entry (by kind); falls
 * back to a read-through synthesis of the legacy `meshState`.
 */
export function getMeshAppBuilderComponent(project: Project): AppBuilderComponentState | undefined {
    return getKeyedMeshAppBuilderComponent(project) ?? synthesizeMeshFromLegacy(project);
}

/**
 * Get all integration appBuilderComponents. Merges keyed `kind:'integration'` entries
 * with a read-through synthesis of the legacy `appState`.
 */
export function getIntegrationAppBuilderComponents(project: Project): AppBuilderComponentState[] {
    const keyed = Object.values(project.appBuilderComponents ?? {}).filter(d => d.kind === 'integration');
    if (keyed.length > 0) return keyed;
    const legacy = synthesizeAppFromLegacy(project);
    return legacy ? [legacy] : [];
}

/** The read-through id for the legacy app (its appId, or a stable fallback). */
function legacyAppId(project: Project): string {
    return project.appState?.appId ?? APP_ID_FALLBACK;
}

/**
 * List every appBuilderComponent with its id: keyed entries plus read-through
 * singletons, de-duplicated by id (keyed entries win).
 */
export function listAppBuilderComponents(project: Project): IdentifiedAppBuilderComponent[] {
    const result: IdentifiedAppBuilderComponent[] = [];
    const seen = new Set<string>();

    for (const [id, state] of Object.entries(project.appBuilderComponents ?? {})) {
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

/** Pure: return a new project with `appBuilderComponents[id]` set (does not mutate input). */
export function setAppBuilderComponent(project: Project, id: string, state: AppBuilderComponentState): Project {
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
        if (state.providesEnvVars) {
            Object.assign(provided, state.providesEnvVars);
        }
    }
    return provided;
}
