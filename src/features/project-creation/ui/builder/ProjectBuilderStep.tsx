/**
 * ProjectBuilderStep Component (Slice 2 — Step 5)
 *
 * The hub-and-spoke wizard step that replaces the ArchitectureModal: a fixed,
 * narrow LEFT rail ({@link ProjectBuilderRail}) listing the build areas, and a
 * RIGHT pane ({@link ProjectBuilderDetail}) that swaps to the active area's
 * existing panel. Selections persist in place via {@link useProjectBuilder}
 * (no modal draft/commit lifecycle) — the mesh dual-flow invariant lives in
 * that hook.
 *
 * Data wiring (filtered stacks, addons, selectable App Builder components,
 * native/available block libraries) is replicated VERBATIM from ArchitectureModal
 * so the panels behave identically; only the container changes (modal → step).
 *
 * The custom-App-Builder-component door is wired to an optional callback to mirror
 * the modal's `onAddCustomAppBuilderComponent` prop (currently a no-op upstream;
 * Batch 3 owns the real wiring).
 *
 * @module features/project-creation/ui/builder/ProjectBuilderStep
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import stacksConfig from '../../config/stacks.json';
import {
    getSelectableAppBuilderComponents,
    type SelectableAppBuilderComponent,
} from '../../services/appBuilderComponentSelection';
import {
    getAvailableBlockLibraries,
    getNativeBlockLibraries,
} from '../../services/blockLibraryLoader';
import { filterAddonsByPackage } from '../components/brandGalleryHelpers';
import { buildBuilderAreas, isReadyToProceed, type BuilderAreaId } from './projectBuilderAreas';
import { ProjectBuilderDetail } from './ProjectBuilderDetail';
import { ProjectBuilderRail } from './ProjectBuilderRail';
import { useProjectBuilder } from './useProjectBuilder';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { useArrowKeyNavigation } from '@/core/ui/hooks/useArrowKeyNavigation';
import { vscode } from '@/core/ui/utils/vscode-api';
import type { BlockLibrary, CustomBlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage, AddonSource } from '@/types/demoPackages';
import type { Stack, StacksConfig, OptionalAddon } from '@/types/stacks';
import type { BaseStepProps } from '@/types/wizard';

/** Addon display metadata from stacks.json (id → {name, description}). */
const ADDON_METADATA = (stacksConfig as StacksConfig).addonDefinitions ?? {};

/** The EDS frontend id that gates the block-libraries area. */
const EDS_FRONTEND_ID = 'eds-storefront';

/** Fixed width of the narrow LEFT rail. */
const RAIL_WIDTH = '280px';

/** Stable empty arrays for hook/list props (avoids the infinite-re-render gotcha). */
const EMPTY_STRING_ARRAY: string[] = [];
const EMPTY_LIBRARY_ARRAY: BlockLibrary[] = [];
const EMPTY_CUSTOM_LIBRARY_ARRAY: CustomBlockLibrary[] = [];
const EMPTY_ADDON_ARRAY: OptionalAddon[] = [];
const EMPTY_PACKAGES: DemoPackage[] = [];
const EMPTY_STACKS: Stack[] = [];

export interface ProjectBuilderStepProps extends BaseStepProps {
    /** Available demo packages (catalog data). */
    packages?: DemoPackage[];
    /** Available stacks/architectures (catalog data). */
    stacks?: Stack[];
    /** Block-library default IDs from VS Code settings (seeds EDS selections on stack pick). */
    blockLibraryDefaults?: string[];
    /** Custom block-library defaults from VS Code settings. */
    customBlockLibraryDefaults?: CustomBlockLibrary[];
    /** Add a custom App Builder component from a canonicalized GitHub source. */
    onAddCustomAppBuilderComponent?: (source: AddonSource) => void;
    /**
     * Notifies the wizard when the stack CHANGES so it can reset the
     * org-dependent downstream steps (mirrors WelcomeStep.handleStackSelect).
     */
    onArchitectureChange?: (oldStackId: string, newStackId: string) => void;
}

/**
 * The hub-and-spoke Project Builder step.
 *
 * @param props - Wizard step props plus catalog data + custom-library defaults
 * @returns The two-column rail + active-panel layout
 */
export function ProjectBuilderStep({
    state,
    updateState,
    setCanProceed,
    packages = EMPTY_PACKAGES,
    stacks = EMPTY_STACKS,
    blockLibraryDefaults = EMPTY_STRING_ARRAY,
    customBlockLibraryDefaults = EMPTY_CUSTOM_LIBRARY_ARRAY,
    onAddCustomAppBuilderComponent,
    onArchitectureChange,
}: ProjectBuilderStepProps) {
    const [activeAreaId, setActiveAreaId] = useState<BuilderAreaId>('architecture');

    const handlers = useProjectBuilder(state, updateState, {
        packages,
        stacks,
        onArchitectureChange,
        blockLibraryDefaults,
        customBlockLibraryDefaults,
    });

    // Drive the wizard Next button: a stack must be chosen (required App Builder
    // components auto-include downstream).
    useEffect(() => {
        setCanProceed(isReadyToProceed(state));
    }, [state.selectedStack, setCanProceed]);

    const areas = useMemo(() => buildBuilderAreas(state), [state]);

    // Resolve the selected package + stack from catalog data.
    const pkg = useMemo(
        () => packages.find(p => p.id === state.selectedPackage),
        [packages, state.selectedPackage],
    );
    const selectedStack = useMemo(
        () => stacks.find(s => s.id === state.selectedStack) ?? null,
        [stacks, state.selectedStack],
    );
    const isEdsStack = selectedStack?.frontend === EDS_FRONTEND_ID;

    // Stacks available for the selected package (storefront keys restrict them).
    const filteredStacks = useMemo(() => {
        const availableStackIds = Object.keys(pkg?.storefronts ?? {});
        if (availableStackIds.length === 0) return stacks;
        return stacks.filter(stack => availableStackIds.includes(stack.id));
    }, [stacks, pkg]);

    const { getItemProps } = useArrowKeyNavigation({
        itemCount: filteredStacks.length,
        onSelect: (index) => handlers.onStackSelect(filteredStacks[index].id),
        wrap: true,
        autoFocusFirst: true,
        orientation: 'both',
    });

    // Catalog-filtered App Builder components for the selected architecture.
    const selectableAppBuilderComponents: SelectableAppBuilderComponent[] = useMemo(() => {
        if (!pkg || !selectedStack) return [];
        return getSelectableAppBuilderComponents(pkg, selectedStack.backend, selectedStack.frontend);
    }, [pkg, selectedStack]);

    // Available + native block libraries (EDS only).
    const availableBlockLibraries = useMemo(() => {
        if (!pkg || !selectedStack || !isEdsStack) return EMPTY_LIBRARY_ARRAY;
        return getAvailableBlockLibraries(selectedStack, pkg.id);
    }, [pkg, selectedStack, isEdsStack]);
    const nativeBlockLibraries = useMemo(() => {
        if (!pkg || !selectedStack || !isEdsStack) return EMPTY_LIBRARY_ARRAY;
        return getNativeBlockLibraries(selectedStack, pkg.id);
    }, [pkg, selectedStack, isEdsStack]);

    // Available addons: stack defines possibilities, package restricts by brand.
    const availableAddons = useMemo(() => {
        if (!pkg || !selectedStack) return EMPTY_ADDON_ARRAY;
        const stackAddons = (selectedStack.optionalAddons ?? []).filter(a => ADDON_METADATA[a.id]);
        return filterAddonsByPackage(stackAddons, pkg);
    }, [pkg, selectedStack]);

    const requiredAddonIds = useMemo(() => {
        if (!pkg?.addons) return EMPTY_STRING_ARRAY;
        return Object.entries(pkg.addons)
            .filter(([, config]) => config === 'required')
            .map(([id]) => id);
    }, [pkg]);

    const handleAddonToggle = useCallback(
        (addonId: string, isSelected: boolean) => {
            const current = state.selectedAddons ?? EMPTY_STRING_ARRAY;
            handlers.onAddonsChange(
                isSelected ? [...current, addonId] : current.filter(id => id !== addonId),
            );
        },
        [state.selectedAddons, handlers],
    );

    const handleBlockLibraryToggle = useCallback(
        (libraryId: string, isSelected: boolean) => {
            const current = state.selectedBlockLibraries ?? EMPTY_STRING_ARRAY;
            handlers.onBlockLibrariesChange(
                isSelected ? [...current, libraryId] : current.filter(id => id !== libraryId),
            );
        },
        [state.selectedBlockLibraries, handlers],
    );

    const handleCustomLibraryToggle = useCallback(
        (lib: CustomBlockLibrary, isSelected: boolean) => {
            const current = state.customBlockLibraries ?? EMPTY_CUSTOM_LIBRARY_ARRAY;
            handlers.onCustomBlockLibrariesChange(
                isSelected
                    ? [...current, lib]
                    : current.filter(
                          c => !(c.source.owner === lib.source.owner && c.source.repo === lib.source.repo),
                      ),
            );
        },
        [state.customBlockLibraries, handlers],
    );

    const handleOpenCustomSettings = useCallback(() => {
        vscode.postMessage('open-block-library-settings');
    }, []);

    const rail = (
        <ProjectBuilderRail
            areas={areas}
            activeAreaId={activeAreaId}
            onSelectArea={setActiveAreaId}
        />
    );

    const detail = (
        <ProjectBuilderDetail
            activeAreaId={activeAreaId}
            architecture={{
                stackSelection: {
                    filteredStacks,
                    selectedStackId: state.selectedStack,
                    getItemProps,
                    onStackClick: handlers.onStackSelect,
                },
                addonSelection: {
                    availableAddons,
                    displayAddons: availableAddons,
                    selectedAddons: state.selectedAddons ?? EMPTY_STRING_ARRAY,
                    onAddonToggle: handleAddonToggle,
                    addonMetadata: ADDON_METADATA,
                    requiredAddonIds,
                },
            }}
            appBuilderComponents={{
                appBuilderComponents: selectableAppBuilderComponents,
                selectedAppBuilderComponents: state.selectedAppBuilderComponents ?? EMPTY_STRING_ARRAY,
                onAppBuilderComponentToggle: handlers.onAppBuilderComponentToggle,
                onAddCustomAppBuilderComponent: onAddCustomAppBuilderComponent ?? (() => {}),
                // Door is inert until creation-side provisioning exists (backlog).
                showCustomDoor: false,
            }}
            blockLibraries={{
                nativeBlockLibraries,
                availableBlockLibraries,
                selectedBlockLibraries: state.selectedBlockLibraries ?? EMPTY_STRING_ARRAY,
                onBlockLibraryToggle: handleBlockLibraryToggle,
                customBlockLibraryDefaults,
                customBlockLibraries: state.customBlockLibraries ?? EMPTY_CUSTOM_LIBRARY_ARRAY,
                onCustomLibraryToggle: handleCustomLibraryToggle,
                onOpenCustomSettings: handleOpenCustomSettings,
            }}
        />
    );

    return (
        <TwoColumnLayout leftWidth={RAIL_WIDTH} leftContent={rail} rightContent={detail} />
    );
}
