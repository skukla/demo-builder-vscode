/**
 * useProjectBuilder Hook (Slice 2 — Step 2)
 *
 * The selection hook for the two-column Project Builder step. Writes WizardState
 * directly via `updateState` — no modal-local draft/open/close lifecycle (the
 * step persists selections in place).
 *
 * Selection logic is MOVED VERBATIM from ArchitectureModal / useModalState:
 *
 *  - onAppBuilderComponentToggle carries the MESH DUAL-FLOW INVARIANT. Toggling
 *    a mesh App Builder component mirror-writes selectedOptionalDependencies via
 *    meshAppBuilderComponentToComponentIds, because useWizardState gates the
 *    Adobe-auth/IO steps on hasMeshInDependencies(selectedOptionalDependencies).
 *    A non-mesh toggle never touches selectedOptionalDependencies. Do NOT
 *    redesign this — D3 owns its eventual removal.
 *
 *  - onStackSelect resets selectedOptionalDependencies on stack change via
 *    resolveMeshOptionalDeps (the cross-package leak guard): the stack's mesh
 *    deps when mesh is required, [] otherwise.
 *
 * @module features/project-creation/ui/builder/useProjectBuilder
 */

import { useCallback } from 'react';
import {
    getNativeBlockLibraries,
    getDefaultBlockLibraryIds,
} from '../../services/blockLibraryLoader';
import { getResolvedMeshRequirement } from '../../services/demoPackageLoader';
import {
    withSelectedAppBuilderComponent,
    meshAppBuilderComponentToComponentIds,
} from '../wizard/appBuilderComponentSelectionState';
import { vscode } from '@/core/ui/utils/vscode-api';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { EDSConfig, WizardState } from '@/types/webview';

/** Stable empty array for selection defaults (avoids the infinite-re-render gotcha). */
const EMPTY_STRING_ARRAY: string[] = [];

/** Catalog data the hook needs to resolve stacks/packages for the mesh reset. */
export interface UseProjectBuilderDeps {
    packages: DemoPackage[];
    stacks: Stack[];
    /**
     * Notifies the wizard when the stack CHANGES (old !== new), so it can reset
     * the org-dependent downstream steps. Mirrors WelcomeStep.handleStackSelect.
     * Not fired on the initial stack selection or a same-stack re-select.
     */
    onArchitectureChange?: (oldStackId: string, newStackId: string) => void;
    /** Block-library default IDs from VS Code settings (seeds EDS selections). */
    blockLibraryDefaults?: string[];
    /** Custom block-library defaults from VS Code settings (seeds EDS selections). */
    customBlockLibraryDefaults?: CustomBlockLibrary[];
}

/**
 * Compute the IDs of addons that the package marks as `required`.
 * Moved verbatim from useModalState.handleStackSelect.
 */
function getRequiredAddons(pkg: DemoPackage): string[] {
    if (!pkg.addons) return [];
    return Object.entries(pkg.addons)
        .filter(([, c]) => c === 'required')
        .map(([id]) => id);
}

/** The selection handlers the Project Builder panels consume. */
export interface UseProjectBuilderReturn {
    onStackSelect: (stackId: string) => void;
    onAddonsChange: (addons: string[]) => void;
    onBlockLibrariesChange: (libraries: string[]) => void;
    onCustomBlockLibrariesChange: (libs: CustomBlockLibrary[]) => void;
    onAppBuilderComponentToggle: (id: string, isSelected: boolean) => void;
    onOptionalDependenciesChange: (deps: string[]) => void;
}

/**
 * Compute the optional mesh dependencies for a package + stack.
 * Returns the deps array when mesh is required, null when not applicable.
 * Moved verbatim from useModalState.
 */
function resolveMeshOptionalDeps(
    pkg: DemoPackage | undefined,
    stackId: string,
    stackObj: Stack | undefined,
): string[] | null {
    if (getResolvedMeshRequirement(pkg, stackId) === true) {
        return stackObj?.optionalDependencies ?? [];
    }
    return null;
}

/**
 * Derive the EDS template config for a stack from the package's storefront.
 * Returns the populated config for EDS stacks, or undefined for non-EDS stacks
 * (clearing stale EDS data). Mirrors WelcomeStep.handleStackSelect verbatim.
 */
function buildEdsConfigUpdate(
    pkg: DemoPackage | undefined,
    stackId: string,
    stackObj: Stack | undefined,
    prev: EDSConfig | undefined,
): EDSConfig | undefined {
    const isEdsStack = Boolean(stackObj?.requiresGitHub || stackObj?.requiresDaLive);
    const storefront = pkg?.storefronts?.[stackId];
    if (!isEdsStack || !storefront) return undefined;
    return {
        ...prev,
        accsHost: prev?.accsHost || '',
        storeViewCode: prev?.storeViewCode || '',
        customerGroup: prev?.customerGroup || '',
        repoName: prev?.repoName || '',
        daLiveOrg: prev?.daLiveOrg || '',
        daLiveSite: prev?.daLiveSite || '',
        templateOwner: storefront.templateOwner,
        templateRepo: storefront.templateRepo,
        contentSource: storefront.contentSource,
        accountContentSource: storefront.accountContentSource,
        byomOverlayUrl: storefront.byomOverlayUrl,
        patches: storefront.patches,
        contentPatches: storefront.contentPatches,
        contentPatchSource: storefront.contentPatchSource,
        codePatches: storefront.codePatches,
        codePatchSource: storefront.codePatchSource,
    } as EDSConfig;
}

/**
 * Seed the default addons for a newly-selected stack: the package's `required`
 * addons unioned with the stack's `default` optional addons. Moved verbatim
 * from useModalState.handleStackSelect.
 */
function resolveDefaultAddons(pkg: DemoPackage | undefined, stackObj: Stack | undefined): string[] {
    const requiredAddons = pkg ? getRequiredAddons(pkg) : [];
    const defaultAddons = (stackObj?.optionalAddons || []).filter(a => a.default).map(a => a.id);
    return [...new Set([...requiredAddons, ...defaultAddons])];
}

/** The block-library selections seeded on a stack change. */
interface BlockLibrarySeed {
    blockLibraries: string[];
    customLibraries: CustomBlockLibrary[];
}

/**
 * Seed block libraries for a newly-selected stack. EDS stacks pre-select the
 * native libraries unioned with the user's defaults, and fall back to the
 * custom-library defaults when the state has none; non-EDS stacks clear both.
 * Moved verbatim from useModalState.handleStackSelect.
 */
function resolveBlockLibrarySeed(
    stackObj: Stack | undefined,
    packageId: string | undefined,
    blockLibraryDefaults: string[] | undefined,
    customBlockLibraryDefaults: CustomBlockLibrary[] | undefined,
    stateCustomLibraries: CustomBlockLibrary[] | undefined,
): BlockLibrarySeed {
    if (stackObj?.frontend !== 'eds-storefront' || !packageId) {
        return { blockLibraries: [], customLibraries: [] };
    }
    const defaults = getDefaultBlockLibraryIds(stackObj, packageId, blockLibraryDefaults);
    const nativeIds = getNativeBlockLibraries(stackObj, packageId).map(l => l.id);
    const customLibraries = (stateCustomLibraries && stateCustomLibraries.length > 0)
        ? stateCustomLibraries
        : (customBlockLibraryDefaults ?? []);
    return { blockLibraries: [...new Set([...nativeIds, ...defaults])], customLibraries };
}

/**
 * Selection hook for the Project Builder step.
 *
 * @param state - The current wizard state (read for current selections)
 * @param updateState - Applies a partial WizardState update
 * @param deps - Catalog data (packages + stacks) for the mesh reset
 * @returns The selection handlers the panels need
 */
export function useProjectBuilder(
    state: WizardState,
    updateState: (partial: Partial<WizardState>) => void,
    deps: UseProjectBuilderDeps,
): UseProjectBuilderReturn {
    const { packages, stacks, onArchitectureChange, blockLibraryDefaults, customBlockLibraryDefaults } = deps;
    const selectedPackage = state.selectedPackage;
    const stateCustomBlockLibraries = state.customBlockLibraries;
    const selectedStack = state.selectedStack;
    const selectedAppBuilderComponents = state.selectedAppBuilderComponents ?? EMPTY_STRING_ARRAY;
    const selectedOptionalDependencies = state.selectedOptionalDependencies ?? EMPTY_STRING_ARRAY;

    const onStackSelect = useCallback(
        (stackId: string) => {
            const selectedStackObj = stacks.find(s => s.id === stackId);
            const currentPkg = packages.find(p => p.id === selectedPackage);
            const meshDeps = resolveMeshOptionalDeps(currentPkg, stackId, selectedStackObj);
            const edsConfig = buildEdsConfigUpdate(
                currentPkg,
                stackId,
                selectedStackObj,
                state.edsConfig,
            );

            // Seed default addons + block libraries (parity with the old modal).
            const addons = resolveDefaultAddons(currentPkg, selectedStackObj);
            const { blockLibraries, customLibraries } = resolveBlockLibrarySeed(
                selectedStackObj,
                selectedPackage,
                blockLibraryDefaults,
                customBlockLibraryDefaults,
                stateCustomBlockLibraries,
            );

            // On a stack CHANGE (not the initial pick), notify the wizard so it can
            // reset the org-dependent downstream steps (mirrors WelcomeStep).
            if (selectedStack && selectedStack !== stackId) {
                onArchitectureChange?.(selectedStack, stackId);
            }

            updateState({
                selectedStack: stackId,
                selectedOptionalDependencies: meshDeps ?? [],
                edsConfig,
                selectedAddons: addons,
                selectedBlockLibraries: blockLibraries,
                customBlockLibraries: customLibraries,
            });
        },
        [
            stacks,
            packages,
            selectedPackage,
            selectedStack,
            state.edsConfig,
            stateCustomBlockLibraries,
            blockLibraryDefaults,
            customBlockLibraryDefaults,
            onArchitectureChange,
            updateState,
        ],
    );

    const onAppBuilderComponentToggle = useCallback(
        (id: string, isSelected: boolean) => {
            const nextComponents = withSelectedAppBuilderComponent(
                selectedAppBuilderComponents,
                id,
                isSelected,
            );

            const meshComponentIds = meshAppBuilderComponentToComponentIds(id);
            if (meshComponentIds.length === 0) {
                updateState({ selectedAppBuilderComponents: nextComponents });
                return;
            }

            const nextOptionalDeps = isSelected
                ? [...new Set([...selectedOptionalDependencies, ...meshComponentIds])]
                : selectedOptionalDependencies.filter(dep => !meshComponentIds.includes(dep));

            updateState({
                selectedAppBuilderComponents: nextComponents,
                selectedOptionalDependencies: nextOptionalDeps,
            });
        },
        [selectedAppBuilderComponents, selectedOptionalDependencies, updateState],
    );

    const onAddonsChange = useCallback(
        (addons: string[]) => updateState({ selectedAddons: addons }),
        [updateState],
    );

    const onBlockLibrariesChange = useCallback(
        (libraries: string[]) => {
            updateState({ selectedBlockLibraries: libraries });
            // Offer the one-time "save as defaults" tip when the user has a
            // block-library selection (the extension de-dupes via globalState).
            // Replaces the deleted modal's on-Done offer.
            if (libraries.length > 0) {
                vscode.postMessage('offer-save-block-library-defaults', {
                    selectedLibraries: libraries,
                });
            }
        },
        [updateState],
    );

    const onCustomBlockLibrariesChange = useCallback(
        (libs: CustomBlockLibrary[]) => updateState({ customBlockLibraries: libs }),
        [updateState],
    );

    const onOptionalDependenciesChange = useCallback(
        (optionalDeps: string[]) => updateState({ selectedOptionalDependencies: optionalDeps }),
        [updateState],
    );

    return {
        onStackSelect,
        onAddonsChange,
        onBlockLibrariesChange,
        onCustomBlockLibrariesChange,
        onAppBuilderComponentToggle,
        onOptionalDependenciesChange,
    };
}
