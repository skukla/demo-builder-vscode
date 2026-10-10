/**
 * Taking a removed component out of the project's records: its instance and the
 * selections that pointed at it.
 *
 * Split from `appBuilderComponentRunner.ts` (decompose-god-file, 2026-10-07); that file keeps the
 * shared contract (`RunnerResult`, `AppBuilderComponentRunnerDeps`).
 *
 * @module features/app-builder/services/appBuilderRemovalState
 */

import { isMeshComponentId } from '@/core/constants';
import { withoutStaleSystemLinks } from '@/core/state/appBuilderComponentState';
import type { AppBuilderComponentState, Project } from '@/types/base';


/**
 * The project without one component: its record, its selection, its API picks
 * and its env-value copies. The caller's reference is synced too.
 */
export function withoutComponent(
    project: Project,
    id: string,
    state: AppBuilderComponentState,
): Project & {
    appBuilderComponents: NonNullable<Project['appBuilderComponents']>;
} {
    const cleared = {
        ...project,
        appBuilderComponents: { ...(project.appBuilderComponents ?? {}) },
        // Removing a MESH revokes the project's claim to one. `hasMesh`
        // (showDashboard) is instance OR keyed-state OR dependency, so clearing
        // only the keyed entry left the other two asserting a mesh that no longer
        // existed: the card kept rendering, stuck on "Checking requirements…",
        // and its Redeploy answered "This project does not have an API Mesh
        // component". A selected-but-absent mesh is an error state, not a resting
        // one — so the selection goes with the component.
        // Both kinds revoke their selection; they just live in different lists —
        // the persisted mesh rides `dependencies`, an integration rides
        // `appBuilder` (ADR-011). Only the mesh half existed until 2026-08-17.
        componentSelections:
            state.kind === 'mesh'
                ? withoutMeshDependencies(project)
                : withoutIntegrationSelection(project, id),
        // The component's API picks go with it. `componentApiPicks` records WHICH
        // integration wanted an API precisely so this moment can answer "is it safe
        // to drop?" — and nothing was spending that: three writers, no remover.
        // Left behind, the picks stay in resolveDesiredApis' union, so the next
        // reconcile PUT keeps subscribing for a component that no longer exists and
        // Manage APIs keeps listing it.
        //
        // Only the ATTRIBUTED key is dropped. UNATTRIBUTED_PICKS_KEY holds picks
        // made from the union view (Manage APIs) and migrated legacy ones; no
        // component claims them, so no removal can prove them safe to drop.
        ...(project.componentApiPicks
            ? { componentApiPicks: { ...project.componentApiPicks } }
            : {}),
        // The component's env-value copies go with it too. Configure's fan-out
        // writes a shared field only to SELECTED components, but the env/config
        // generators sweep the WHOLE map — configGenerator with
        // mesh-overrides-non-mesh priority — so a stranded entry's stale copy of
        // ADOBE_COMMERCE_URL (etc.) would outvote the backend's fresh value on
        // the next publish. Same failure shape as the 2026-08-10 wrong-website
        // bug. `stripOrphanedComponentConfigs` (loader) sweeps entries older
        // removals already stranded.
        ...(project.componentConfigs ? { componentConfigs: { ...project.componentConfigs } } : {}),
    };
    delete cleared.appBuilderComponents[id];
    // A system leaves its integration's `systems` list in the same save (AB-70).
    cleared.appBuilderComponents = withoutStaleSystemLinks(cleared.appBuilderComponents);
    if (cleared.componentApiPicks) {
        delete cleared.componentApiPicks[id];
    }
    if (cleared.componentConfigs) {
        delete cleared.componentConfigs[id];
    }
    // Sync the caller's reference too — a later save from a stale reference
    // would otherwise RESURRECT the removed integration (see persistOutcome).
    project.appBuilderComponents = cleared.appBuilderComponents;
    // Same stale-reference hazard as the entry above: a later save from the
    // caller's copy would otherwise restore the picks we just dropped.
    if (cleared.componentApiPicks) {
        project.componentApiPicks = cleared.componentApiPicks;
    }
    if (cleared.componentConfigs) {
        project.componentConfigs = cleared.componentConfigs;
    }
    return cleared;
}

/**
 * The project's selections with every mesh dependency dropped.
 *
 * Keyed by the LEGACY component ids (`eds-accs-mesh` and friends), which is what
 * `componentSelections.dependencies` holds — not the catalog ids.
 *
 * @param project - the project whose mesh selection is being revoked
 * @returns componentSelections with mesh dependencies removed
 */
function withoutMeshDependencies(project: Project): Project['componentSelections'] {
    const selections = project.componentSelections;
    if (!selections?.dependencies) return selections;
    return {
        ...selections,
        dependencies: selections.dependencies.filter((dep) => !isMeshComponentId(dep)),
    };
}

/**
 * The project's selections with one integration's id dropped from `appBuilder`.
 *
 * The integration counterpart of {@link withoutMeshDependencies}, and it exists
 * for the same reason: a selected-but-absent component is an error state, not a
 * resting one. Found live 2026-08-17 — an `add_integration` / `remove_integration`
 * round trip cleared the keyed entry and the component instance while leaving the
 * id in `componentSelections.appBuilder`.
 *
 * The cost lands at RESET, which rebuilds the component list from the selections
 * (`projectResetService`) and would try to re-clone a component that is gone.
 *
 * NOT `reconcileComponentSelections`: that helper is additive by design, because
 * a wizard selection not yet installed is a legitimate mid-creation state. Its
 * docstring assumed an explicit removal already cleaned up after itself — which
 * was true only for meshes until now.
 *
 * @param project - the project whose integration selection is being revoked
 * @param id - the integration id being removed
 * @returns componentSelections without that id
 */
function withoutIntegrationSelection(project: Project, id: string): Project['componentSelections'] {
    const selections = project.componentSelections;
    if (!selections?.appBuilder) return selections;
    return {
        ...selections,
        appBuilder: selections.appBuilder.filter((entry) => entry !== id),
    };
}
