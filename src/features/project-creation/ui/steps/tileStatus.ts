/**
 * Config-tile status predicates (R1b — group-paced steps)
 *
 * Pure, side-effect-free predicates that decide whether a group-step config tile
 * is "configured" (✓) or still "needs setup" (⚠). They derive from PERSISTED
 * wizard state so a tile's badge and the step's Continue gate stay correct when
 * the modal is closed and across back/forward navigation.
 *
 * Each predicate combines persisted selections with the authoritative validity
 * verdict the modal body reports — `commerceConnectValid` (ConnectStoreStepContent's
 * onValidationChange) and `storefrontRepoValid` (RepoSelectionInline's
 * onValidityChange). The modal bodies own the live, fine-grained validation; these
 * predicates are the single source for the tile badge AND the step canProceed.
 *
 * This module also exposes `isAdobeSignedIn`, derived from the same persisted
 * state, used by the Commerce step's guided accordion gating.
 *
 * @module features/project-creation/ui/steps/tileStatus
 */

import {
    getSelectableAppBuilderComponents,
    type SelectableAppBuilderComponent,
} from '../../services/appBuilderComponentSelection';
import { meshAppBuilderComponentToComponentIds } from '../wizard/appBuilderComponentSelectionState';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

/**
 * Whether the Commerce area (architecture + connection) is fully configured.
 *
 * @param state - Wizard state
 * @returns true when a stack is selected AND the connect form reported valid
 */
export function isCommerceConfigured(state: WizardState): boolean {
    return Boolean(state.selectedStack) && state.commerceConnectValid === true;
}

/**
 * Whether the user is signed in to Adobe with an organization selected.
 *
 * @param state - Wizard state
 * @returns true when Adobe auth reports authenticated AND an org is selected
 */
export function isAdobeSignedIn(state: WizardState): boolean {
    return state.adobeAuth?.isAuthenticated === true && Boolean(state.adobeOrg);
}

/**
 * Resolve the mesh App Builder component available for the current package + stack.
 *
 * Mirrors how the App Builder picker derives its rows: it resolves the selected
 * package + stack from the catalog, runs the SAME axis-filtered, package-scoped
 * selection (`getSelectableAppBuilderComponents` over the stack's backend +
 * frontend), then returns the single `kind: "mesh"` entry — the one the Mesh tile
 * toggles. Returns undefined when no stack is committed or the architecture has no
 * mesh component (the "N/A for this architecture" case).
 *
 * @param state - Wizard state (provides selectedPackage + selectedStack)
 * @param packages - Demo-package catalog
 * @param stacks - Stack catalog (provides the stack's backend + frontend ids)
 * @returns The mesh component for this architecture, or undefined when none applies
 */
export function meshComponentForStack(
    state: WizardState,
    packages: DemoPackage[],
    stacks: Stack[],
): SelectableAppBuilderComponent | undefined {
    const pkg = packages.find(p => p.id === state.selectedPackage);
    const stack = stacks.find(s => s.id === state.selectedStack);
    if (!pkg || !stack) return undefined;
    return getSelectableAppBuilderComponents(pkg, stack.backend, stack.frontend).find(
        c => c.kind === 'mesh',
    );
}

/**
 * Whether an API Mesh component is available for the current package + stack.
 *
 * @param state - Wizard state
 * @param packages - Demo-package catalog
 * @param stacks - Stack catalog
 * @returns true when a `kind: "mesh"` component applies to this architecture
 */
export function meshAvailable(
    state: WizardState,
    packages: DemoPackage[],
    stacks: Stack[],
): boolean {
    return meshComponentForStack(state, packages, stacks) !== undefined;
}

/**
 * Whether the given mesh component is currently selected (the tile's On state).
 *
 * A mesh component is "on" when its catalog id is in `selectedAppBuilderComponents`
 * OR — via the documented mesh dual-flow — any of its mapped legacy mesh component
 * ids are in `selectedOptionalDependencies`. Checking both keeps the tile correct
 * for template-required meshes that flow only through optionalDependencies.
 *
 * @param state - Wizard state
 * @param meshComponentId - The mesh catalog component id
 * @returns true when the mesh component is selected
 */
export function isMeshSelected(state: WizardState, meshComponentId: string): boolean {
    const selectedComponents = state.selectedAppBuilderComponents ?? [];
    if (selectedComponents.includes(meshComponentId)) return true;
    const legacyIds = meshAppBuilderComponentToComponentIds(meshComponentId);
    const selectedDeps = state.selectedOptionalDependencies ?? [];
    return legacyIds.some(id => selectedDeps.includes(id));
}

/**
 * Whether the user has any deployable selected (a mesh or an integration).
 *
 * State-only (no catalog needed): a deployable is selected when
 * `selectedAppBuilderComponents` holds any catalog id, or — via the documented mesh
 * dual-flow — `selectedOptionalDependencies` holds a mesh dep. `onStackSelect` resets
 * `selectedOptionalDependencies` on every stack change, so a stale mesh dep can't
 * survive onto a non-mesh stack. Drives the Integrations area's conditional
 * "Deployment target" sub-step (it only matters once something will deploy).
 *
 * @param state - Wizard state
 * @returns true when at least one deployable is selected
 */
export function anyDeployableSelected(state: WizardState): boolean {
    return (
        (state.selectedAppBuilderComponents?.length ?? 0) > 0 ||
        (state.selectedOptionalDependencies?.length ?? 0) > 0
    );
}

/**
 * Whether the Integrations area is complete enough to leave.
 *
 * Integrations is conditionally required: the ONLY thing that can block Finish is
 * an API Mesh that is turned On but not yet pointed at an Adobe I/O project +
 * workspace (the Mesh tile's config fold-in). The cases:
 *  - mesh NOT available for the architecture → true (nothing to configure);
 *  - mesh available but NOT selected (Off) → true (mesh is optional);
 *  - mesh selected (On) → require BOTH `adobeProject` and `adobeWorkspace`.
 *
 * Note: this intentionally does NOT require Adobe sign-in here — the tile owns the
 * sign-in gate UX (you can't pick a project/workspace until signed in, so the
 * project/workspace check implies sign-in).
 *
 * @param state - Wizard state
 * @param packages - Demo-package catalog
 * @param stacks - Stack catalog
 * @returns true when the Integrations area imposes no outstanding requirement
 */
export function isIntegrationsComplete(
    state: WizardState,
    packages: DemoPackage[],
    stacks: Stack[],
): boolean {
    const meshComponent = meshComponentForStack(state, packages, stacks);
    if (!meshComponent) return true; // No mesh for this architecture.
    if (!isMeshSelected(state, meshComponent.id)) return true; // Mesh optional, left Off.
    return Boolean(state.adobeProject?.id) && Boolean(state.adobeWorkspace?.id);
}

/**
 * Whether the Storefront step's Storefront tile is fully configured.
 *
 * @param state - Wizard state
 * @returns true when GitHub + DA.live are authenticated AND both the repo and the
 *   AEM Code Sync app reported valid
 */
export function isStorefrontConfigured(state: WizardState): boolean {
    const eds = state.edsConfig;
    return (
        Boolean(eds?.githubAuth?.isAuthenticated) &&
        Boolean(eds?.daLiveAuth?.isAuthenticated) &&
        state.storefrontRepoValid === true &&
        state.storefrontCodeSyncValid === true
    );
}
