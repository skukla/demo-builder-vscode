/**
 * useProjectBuilder Hook (Slice 2 — Step 2)
 *
 * The selection hook for the two-column Project Builder step. Writes WizardState
 * directly via `updateState` — no modal-local draft/open/close lifecycle (the
 * step persists selections in place).
 *
 * One invariant carried here (it predates this hook; `ArchitectureModal` and
 * `useModalState`, which used to hold it, are deleted — git has that history):
 *
 *  - onStackSelect reconciles the mesh inside selectedAppBuilderComponents on
 *    stack change via resolveMeshOptionalDeps (the cross-package leak guard):
 *    mesh ids are stripped and the new stack's mesh is seeded when the package
 *    requires it. selectedAppBuilderComponents is the SINGLE mesh authority —
 *    the legacy selectedOptionalDependencies mirror was removed by D3.
 *
 * @module features/project-creation/ui/steps/useProjectBuilder
 */

import { useCallback } from 'react';
import { getSelectableAppBuilderComponents } from '../../services/appBuilderComponentSelection';
import { withSelectedAppBuilderComponent } from '../wizard/appBuilderComponentSelectionState';
import { buildEdsConfigFromStorefront } from './edsConfigFromStorefront';
import { isMeshComponentId } from '@/core/constants';
import { vscode } from '@/core/ui/utils/vscode-api';
import {
    getNativeBlockLibraries,
    getDefaultBlockLibraryIds,
    getPackageDefaultBlockLibraryIds,
} from '@/features/components/services/blockLibraryLoader';
import { getResolvedMeshRequirement } from '@/features/components/services/demoPackageLoader';
import type { BlankInstance } from '@/features/project-creation/ui/components/integration-flow/flowStages';
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
     * the org-dependent downstream steps.
     * Not fired on the initial stack selection or a same-stack re-select.
     */
    onArchitectureChange?: (oldStackId: string, newStackId: string) => void;
    /** Block-library default IDs from VS Code settings (seeds EDS selections). */
    blockLibraryDefaults?: string[];
    /** Custom block-library defaults from VS Code settings (seeds EDS selections). */
    customBlockLibraryDefaults?: CustomBlockLibrary[];
}

/** Compute the IDs of addons that the package marks as `required`. */
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
    /**
     * Add a custom-URL integration. With `instance` (a named AI-built shell
     * instance) the selection commits under the INSTANCE id and the source record
     * carries the display name; without it, the id is `${owner}-${repo}` (the
     * import door, unchanged).
     */
    onAddCustomAppBuilderComponent: (
        source: { owner: string; repo: string; branch?: string },
        instance?: BlankInstance
    ) => void;
    /** Remove an added App Builder integration: clears its selection AND its source. */
    onRemoveAppBuilderComponent: (id: string) => void;
    /**
     * Rename an AI-built instance: updates `appBuilderComponentSources[id].name`
     * IN PLACE. Display name only — the id (folder, ow.package, keyed key),
     * selection, and API picks are immutable. No-op for ids without a source
     * record (catalog / legacy fixed-id blank selections have no name home).
     */
    onRenameAppBuilderComponent: (id: string, name: string) => void;
}

/**
 * Compute the optional mesh dependencies for a package + stack.
 * Returns the deps array when mesh is required, null when not applicable.
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
 * (clearing stale EDS data). The field mapping itself lives in
 * {@link buildEdsConfigFromStorefront}, shared with WelcomeStep's package-change
 * effect — the two were separate copies and drifted on `codePatches`.
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
    return buildEdsConfigFromStorefront(storefront, prev);
}

/**
 * Seed the default addons for a newly-selected stack: the package's `required`
 * addons unioned with the stack's `default` optional addons.
 */
function resolveDefaultAddons(pkg: DemoPackage | undefined, stackObj: Stack | undefined): string[] {
    const requiredAddons = pkg ? getRequiredAddons(pkg) : [];
    const defaultAddons = (stackObj?.optionalAddons || [])
        .filter((a) => a.default)
        .map((a) => a.id);
    return [...new Set([...requiredAddons, ...defaultAddons])];
}

/**
 * Drop an integration's free Console-API picks from the keyed map.
 * Returns the map without the key, or undefined when there is nothing to drop
 * (so callers can skip the state write entirely — no churn).
 */
function consoleApisWithoutKey(
    apis: Record<string, string[]> | undefined,
    id: string,
): Record<string, string[]> | undefined {
    if (!apis || !(id in apis)) return undefined;
    const next = { ...apis };
    delete next[id];
    return next;
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
    const nativeIds = getNativeBlockLibraries(stackObj, packageId).map((l) => l.id);
    // Package-declared defaults (defaultForPackages): seeded checked but
    // DESELECTABLE — they stay in the selectable list, unlike locked natives.
    const packageDefaults = getPackageDefaultBlockLibraryIds(stackObj, packageId);
    const customLibraries =
        stateCustomLibraries && stateCustomLibraries.length > 0
            ? stateCustomLibraries
            : (customBlockLibraryDefaults ?? []);
    return {
        blockLibraries: [...new Set([...nativeIds, ...packageDefaults, ...defaults])],
        customLibraries,
    };
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
    const {
        packages,
        stacks,
        onArchitectureChange,
        blockLibraryDefaults,
        customBlockLibraryDefaults,
    } = deps;
    const selectedPackage = state.selectedPackage;
    const stateCustomBlockLibraries = state.customBlockLibraries;
    const selectedStack = state.selectedStack;
    const selectedAppBuilderComponents = state.selectedAppBuilderComponents ?? EMPTY_STRING_ARRAY;

    const onStackSelect = useCallback(
        (stackId: string) => {
            const selectedStackObj = stacks.find((s) => s.id === stackId);
            const currentPkg = packages.find((p) => p.id === selectedPackage);
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
            // reset the org-dependent downstream steps.
            if (selectedStack && selectedStack !== stackId) {
                onArchitectureChange?.(selectedStack, stackId);
            }

            // Reconcile the mesh inside selectedAppBuilderComponents on an ACTUAL
            // stack change: strip mesh ids (the old stack's mesh must not leak) and
            // seed the new stack's mesh when the package requires it. A same-stack
            // re-select (the edit walk-through invites re-clicking the already
            // selected backend card) must preserve the current selection — the
            // unconditional reset wiped the edit-seeded mesh and silently dropped
            // it on Finish.
            const isSameStack = selectedStack === stackId;
            const meshReconciledComponents = isSameStack
                ? undefined
                : [
                      ...selectedAppBuilderComponents.filter((id) => !isMeshComponentId(id)),
                      ...(meshDeps ?? []),
                  ];

            updateState({
                selectedStack: stackId,
                ...(meshReconciledComponents !== undefined
                    ? { selectedAppBuilderComponents: meshReconciledComponents }
                    : {}),
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
            selectedAppBuilderComponents,
            state.edsConfig,
            stateCustomBlockLibraries,
            blockLibraryDefaults,
            customBlockLibraryDefaults,
            onArchitectureChange,
            updateState,
        ],
    );

    /**
     * True when the package's resolved requirement locks this component into
     * the build — the required mesh (`requiresMesh`, storefront override
     * honoured) or a `nativeForPackages` catalog entry. One predicate for both
     * removal doors below.
     */
    const isRequiredComponent = useCallback(
        (id: string): boolean => {
            const pkg = packages.find((p) => p.id === state.selectedPackage);
            const stack = stacks.find((s) => s.id === state.selectedStack);
            if (!pkg || !stack) return false;
            const entry = getSelectableAppBuilderComponents(
                pkg,
                stack.backend,
                stack.frontend,
                stack.id,
            ).find((candidate) => candidate.id === id);
            return entry?.requirement === 'required';
        },
        [packages, stacks, state.selectedPackage, state.selectedStack],
    );

    const onAppBuilderComponentToggle = useCallback(
        (id: string, isSelected: boolean) => {
            // A required component cannot be toggled OFF. The card layer
            // already hides Remove on it; this guard is defense in depth so a
            // second door found later cannot reopen the hole — dropping a
            // required mesh silently pointed the storefront at the bare
            // Commerce endpoint, rendering 200s with empty product blocks.
            if (!isSelected && isRequiredComponent(id)) {
                return;
            }
            const nextComponents = withSelectedAppBuilderComponent(
                selectedAppBuilderComponents,
                id,
                isSelected,
            );
            const update: Partial<WizardState> = {
                selectedAppBuilderComponents: nextComponents,
            };
            // Toggle-off also drops the integration's free Console-API picks so
            // stale picks never survive a re-add or serialize into creation.
            if (!isSelected) {
                const nextApis = consoleApisWithoutKey(state.selectedConsoleApis, id);
                if (nextApis !== undefined) update.selectedConsoleApis = nextApis;
            }

            updateState(update);
        },
        [selectedAppBuilderComponents, state.selectedConsoleApis, isRequiredComponent, updateState],
    );

    const onAddCustomAppBuilderComponent = useCallback(
        (source: { owner: string; repo: string; branch?: string }, instance?: BlankInstance) => {
            const id = instance?.id ?? `${source.owner}-${source.repo}`;
            const record = { owner: source.owner, repo: source.repo, branch: source.branch };
            const nextComponents = withSelectedAppBuilderComponent(
                selectedAppBuilderComponents,
                id,
                true,
            );
            updateState({
                selectedAppBuilderComponents: nextComponents,
                appBuilderComponentSources: {
                    ...(state.appBuilderComponentSources ?? {}),
                    [id]: instance ? { ...record, name: instance.name } : record,
                },
            });
        },
        [selectedAppBuilderComponents, state.appBuilderComponentSources, updateState],
    );

    const onRenameAppBuilderComponent = useCallback(
        (id: string, name: string) => {
            const sources = state.appBuilderComponentSources ?? {};
            const record = sources[id];
            // Only sourced rows (AI-built instances) carry a renamable name.
            if (!record) return;
            updateState({
                appBuilderComponentSources: { ...sources, [id]: { ...record, name } },
            });
        },
        [state.appBuilderComponentSources, updateState],
    );

    const onRemoveAppBuilderComponent = useCallback(
        (id: string) => {
            // Same lock as the toggle: a package-required component cannot be
            // removed from the build through ANY door.
            if (isRequiredComponent(id)) {
                return;
            }
            const next = withSelectedAppBuilderComponent(selectedAppBuilderComponents, id, false);
            const sources = { ...(state.appBuilderComponentSources ?? {}) };
            delete sources[id];
            const update: Partial<WizardState> = {
                selectedAppBuilderComponents: next,
                appBuilderComponentSources: sources,
            };
            // Remove is state cleanup only: the integration's free Console-API
            // picks go with it (its selection keys already do).
            const nextApis = consoleApisWithoutKey(state.selectedConsoleApis, id);
            if (nextApis !== undefined) update.selectedConsoleApis = nextApis;
            updateState(update);
        },
        [
            selectedAppBuilderComponents,
            state.appBuilderComponentSources,
            state.selectedConsoleApis,
            isRequiredComponent,
            updateState,
        ],
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

    return {
        onStackSelect,
        onAddonsChange,
        onBlockLibrariesChange,
        onCustomBlockLibrariesChange,
        onAppBuilderComponentToggle,
        onAddCustomAppBuilderComponent,
        onRemoveAppBuilderComponent,
        onRenameAppBuilderComponent,
    };
}
