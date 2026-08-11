/**
 * Deploy-outcome → keyed appBuilderComponents write (ADR-011 D3 Step 02).
 *
 * The singular headless deploy paths historically wrote only the legacy
 * `appState`/`meshState` singletons, while the keyed runner wrote only
 * `appBuilderComponents[id]` — two surfaces reading different state. This helper
 * is the "one writer" seam: a caller invokes it on success AND on error so both
 * models agree. Of the two singular paths only `deployMeshHeadless` remains;
 * `deployAppHeadless` was retired on 2026-08-04.
 *
 * @module features/app-builder/services/appBuilderDeployOutcome
 */

import type { AppBuilderComponentKind, AppBuilderComponentState, Project } from '@/types/base';

/**
 * The fields a deploy outcome may contribute to the keyed entry.
 *
 * The mesh-runtime fields (`sourceHash`/`envVars`/decline flags, ADR-011 D3
 * Step 06) let a mesh deploy land its staleness baseline on the keyed entry
 * and clear a previous "Later" decline (an explicit `undefined` overwrites
 * via the spread in {@link recordDeployOutcome}).
 */
export type DeployOutcome = Pick<
    AppBuilderComponentState,
    | 'status'
    | 'endpoint'
    | 'url'
    | 'deployedUrls'
    | 'lastDeployed'
    | 'sourceHash'
    | 'envVars'
    | 'userDeclinedUpdate'
    | 'declinedAt'
    | 'error'
> &
    // Identity, supplied only when CREATING an entry. An update inherits these
    // from the entry it is updating — which is why they are optional rather than
    // part of the Pick above.
    Partial<Pick<AppBuilderComponentState, 'name' | 'source' | 'providesEnvVars'>>;

/**
 * Resolve the keyed id an operation on a component INSTANCE should land on.
 *
 * Prefers the component-instance id (the id the keyed runner uses). When that
 * id is not keyed but exactly ONE entry of the same kind exists, reuse its key:
 * that entry is the read-side migration of the legacy singleton (keyed under
 * 'mesh' / the appId) and targeting it prevents a stale twin from persisting
 * beside the fresh entry. With zero or several same-kind entries, the instance
 * id stands (several = the N-integration model; siblings must not be touched).
 *
 * Shared by the deploy-outcome write below and the per-id remove
 * ({@link import('./appBuilderComponentRunner').removeAppBuilderComponent}),
 * which must clear the SAME entry a deploy would have written.
 */
export function resolveKeyedComponentId(
    project: Project,
    kind: AppBuilderComponentKind,
    instanceId: string,
): string {
    if (project.appBuilderComponents?.[instanceId]) {
        return instanceId;
    }
    const sameKind = Object.entries(project.appBuilderComponents ?? {}).filter(
        ([, state]) => state.kind === kind,
    );
    return sameKind.length === 1 ? sameKind[0][0] : instanceId;
}

/**
 * Refresh a mesh entry's provided MESH_ENDPOINT with the freshly deployed one.
 * Entries that don't provide env vars stay as they are — nothing is fabricated
 * (the catalog decides what a component provides, not the deploy path).
 */
function refreshProvidedEnvVars(
    existing: AppBuilderComponentState | undefined,
    outcome: DeployOutcome,
): Record<string, string> | undefined {
    // The existing entry is authoritative on an update; on a CREATE there is none,
    // so the outcome carries what the catalog says this component provides.
    const provided = existing?.providesEnvVars ?? outcome.providesEnvVars;
    if (!provided || outcome.endpoint === undefined || !('MESH_ENDPOINT' in provided)) {
        return provided;
    }
    return { ...provided, MESH_ENDPOINT: outcome.endpoint };
}

/**
 * The failure reason to persist: the outcome's, else the existing one, else none.
 *
 * A NON-error outcome always clears it. This merge is `...existing, ...outcome`,
 * so a success that simply omits `error` would otherwise leave the previous
 * failure's message on a now-healthy component and the drawer would explain a
 * failure that had since been fixed — the same shape as the `meshStatusSummary`
 * bug the mesh deploy path carries a comment about.
 *
 * A failure that arrives WITHOUT a reason keeps the one already recorded: a
 * caller that knows only "it failed" must not erase a better message.
 */
function resolveErrorReason(
    existing: AppBuilderComponentState | undefined,
    outcome: DeployOutcome,
): string | undefined {
    if (outcome.status !== 'error') return undefined;
    return outcome.error ?? existing?.error;
}

/**
 * Merge a deploy outcome into `project.appBuilderComponents` (in place, like the
 * headless paths' existing singular writes — the caller saves the project).
 * Identity fields the outcome doesn't know (source, name, providesEnvVars) are
 * preserved from the existing entry; a never-keyed component gets the same
 * empty source the legacy migration uses.
 */
export function recordDeployOutcome(
    project: Project,
    kind: AppBuilderComponentKind,
    instanceId: string,
    outcome: DeployOutcome,
    options: { create?: boolean } = {},
): void {
    // `create` bypasses resolveKeyedComponentId deliberately. That helper's
    // legacy-migration branch reuses the ONE existing same-kind entry's key when
    // the given id is not yet keyed — correct for an update of a migrated
    // singleton, catastrophic for a create: adding a second integration would
    // land on the first one's key and overwrite it. An add keys by its own id.
    const id = options.create ? instanceId : resolveKeyedComponentId(project, kind, instanceId);
    const existing = project.appBuilderComponents?.[id];
    project.appBuilderComponents = {
        ...(project.appBuilderComponents ?? {}),
        [id]: {
            ...existing,
            ...outcome,
            kind,
            // Identity: the outcome supplies it on a create, the existing entry
            // keeps it on an update. Spreading alone would let an update carrying
            // no name blank the one already stored.
            name: outcome.name ?? existing?.name,
            source: outcome.source ?? existing?.source ?? { owner: '', repo: '' },
            providesEnvVars: refreshProvidedEnvVars(existing, outcome),
            error: resolveErrorReason(existing, outcome),
        },
    };

    // Mirror the deploy STATUS onto the component instance.
    //
    // Two records carry a status and different surfaces read different ones: the
    // integrations grid reads the keyed entry above, while `handleRequestStatus`
    // reads `getMeshComponentInstance(project)?.status`. `deployMeshHeadless` set
    // the instance by hand and the keyed runner did not, so after an ADD the keyed
    // entry said "deployed" while the instance still said "ready" — the INSTALL
    // outcome, never advanced — and the dashboard reported mesh=ready for a mesh
    // that had just verified successfully (2026-08-04, live).
    //
    // Doing it here rather than in the add path keeps the two deploy paths agreeing
    // by construction instead of adding a third writer. `deployMeshHeadless`'s own
    // assignments become redundant, not wrong.
    //
    // Keyed by `instanceId`, NOT the resolved `id`: a migrated project can hold its
    // keyed entry under the legacy `mesh` key while the instance keeps its real
    // component id.
    const instance = project.componentInstances?.[instanceId];
    if (instance && (outcome.status === 'deployed' || outcome.status === 'error')) {
        instance.status = outcome.status;
        instance.lastUpdated = new Date();
    }
}
