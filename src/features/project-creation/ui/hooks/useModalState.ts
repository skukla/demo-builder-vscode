/**
 * useModalState Hook
 *
 * Manages all modal-local state for the ArchitectureModal within BrandGallery.
 * Handles card click initialization, stack change resets, change handlers,
 * done sync to parent, and close/cancel revert.
 *
 * Extracted from BrandGallery.tsx to reduce file size and improve testability.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
    getNativeBlockLibraries,
    getDefaultBlockLibraryIds,
} from '../../services/blockLibraryLoader';
import { getResolvedMeshRequirement } from '../../services/demoPackageLoader';
import { vscode } from '@/core/ui/utils/vscode-api';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';

export interface UseModalStateProps {
    packages: DemoPackage[];
    stacks: Stack[];
    selectedStack?: string;
    selectedAddons: string[];
    selectedFeaturePacks: string[];
    selectedBlockLibraries: string[];
    customBlockLibraries: CustomBlockLibrary[];
    customBlockLibraryDefaults: CustomBlockLibrary[];
    blockLibraryDefaults?: string[];
    selectedOptionalDependencies: string[];
    onPackageSelect: (packageId: string) => void;
    onStackSelect: (stackId: string) => void;
    onAddonsChange?: (addons: string[]) => void;
    onFeaturePacksChange?: (packs: string[]) => void;
    onBlockLibrariesChange?: (libraries: string[]) => void;
    onCustomBlockLibrariesChange?: (libs: CustomBlockLibrary[]) => void;
    onOptionalDependenciesChange?: (deps: string[]) => void;
}

export interface UseModalStateReturn {
    modalPackageId: string | null;
    modalPackage: DemoPackage | null;
    modalAddons: string[];
    modalFeaturePacks: string[];
    modalBlockLibraries: string[];
    modalCustomBlockLibraries: CustomBlockLibrary[];
    modalOptionalDeps: string[];
    handleCardClick: (pkg: DemoPackage) => void;
    handleStackSelect: (stackId: string) => void;
    handleModalAddonsChange: (addons: string[]) => void;
    handleModalFeaturePacksChange: (packs: string[]) => void;
    handleModalBlockLibrariesChange: (libraries: string[]) => void;
    handleModalCustomBlockLibrariesChange: (libs: CustomBlockLibrary[]) => void;
    handleModalOptionalDepsChange: (deps: string[]) => void;
    handleModalDone: () => void;
    handleModalClose: () => void;
}

/** Get required addon IDs from a package's addons config */
function getRequiredAddons(pkg: DemoPackage): string[] {
    if (!pkg.addons) return [];
    return Object.entries(pkg.addons)
        .filter(([, config]) => config === 'required')
        .map(([id]) => id);
}

/** Get required feature pack IDs from a package's featurePacks config */
function getRequiredFeaturePacks(pkg: DemoPackage): string[] {
    if (!pkg.featurePacks) return [];
    return Object.entries(pkg.featurePacks)
        .filter(([, config]) => config === 'required')
        .map(([id]) => id);
}

/**
 * Compute optional mesh dependencies for a given package and stack.
 * Returns the deps array when mesh is required, null when not applicable.
 * Callers handle the null case (fallback deps differ between callsites).
 */
function resolveMeshOptionalDeps(
    pkg: DemoPackage | undefined,
    stackId: string,
    stackObj: { optionalDependencies?: string[] } | undefined,
): string[] | null {
    if (getResolvedMeshRequirement(pkg, stackId) === true) {
        return stackObj?.optionalDependencies ?? [];
    }
    return null;
}

export function useModalState(props: UseModalStateProps): UseModalStateReturn {
    const {
        packages,
        stacks,
        selectedStack,
        selectedAddons,
        selectedFeaturePacks,
        selectedBlockLibraries,
        customBlockLibraries,
        customBlockLibraryDefaults,
        blockLibraryDefaults,
        selectedOptionalDependencies,
        onPackageSelect,
        onStackSelect,
        onAddonsChange,
        onFeaturePacksChange,
        onBlockLibrariesChange,
        onCustomBlockLibrariesChange,
        onOptionalDependenciesChange,
    } = props;

    // Stable ref to always-current props — lets callbacks use [] or minimal deps
    // without stale-closure risk. Updated synchronously on every render (no effect needed).
    const propsRef = useRef(props);
    propsRef.current = props;

    const [modalPackageId, setModalPackageId] = useState<string | null>(null);
    const [modalAddons, setModalAddons] = useState<string[]>(selectedAddons);
    const [modalFeaturePacks, setModalFeaturePacks] = useState<string[]>(selectedFeaturePacks);
    const [modalBlockLibraries, setModalBlockLibraries] = useState<string[]>(selectedBlockLibraries);
    const [modalCustomBlockLibraries, setModalCustomBlockLibraries] = useState<CustomBlockLibrary[]>(customBlockLibraries);
    const [modalOptionalDeps, setModalOptionalDeps] = useState<string[]>(selectedOptionalDependencies);
    const preModalOptionalDepsRef = useRef<string[]>(selectedOptionalDependencies);

    // Sync custom block libraries when VS Code settings change while modal is open.
    const prevCustomDefaultsRef = useRef(customBlockLibraryDefaults);
    useEffect(() => {
        if (!modalPackageId || !customBlockLibraryDefaults?.length) return;
        if (prevCustomDefaultsRef.current === customBlockLibraryDefaults) return;
        prevCustomDefaultsRef.current = customBlockLibraryDefaults;
        setModalCustomBlockLibraries(prev => {
            const existingKeys = new Set(prev.map(l => `${l.source.owner}/${l.source.repo}`));
            const newLibs = customBlockLibraryDefaults.filter(
                l => !existingKeys.has(`${l.source.owner}/${l.source.repo}`),
            );
            return newLibs.length > 0 ? [...prev, ...newLibs] : prev;
        });
    }, [customBlockLibraryDefaults, modalPackageId]);

    const modalPackage = useMemo(() => {
        if (!modalPackageId) return null;
        return packages.find(p => p.id === modalPackageId) || null;
    }, [packages, modalPackageId]);

    const handleCardClick = useCallback((pkg: DemoPackage) => {
        const {
            onPackageSelect,
            selectedAddons,
            selectedFeaturePacks,
            selectedBlockLibraries,
            customBlockLibraries,
            customBlockLibraryDefaults,
            selectedOptionalDependencies,
            selectedStack,
            stacks,
            onOptionalDependenciesChange,
        } = propsRef.current;
        onPackageSelect(pkg.id);
        // Initialize modal addons with current state + package's required addons
        const requiredAddons = getRequiredAddons(pkg);
        const initialAddons = [...new Set([...selectedAddons, ...requiredAddons])];
        setModalAddons(initialAddons);
        // Initialize modal feature packs with current state + package's required packs
        const requiredPacks = getRequiredFeaturePacks(pkg);
        const initialPacks = [...new Set([...selectedFeaturePacks, ...requiredPacks])];
        setModalFeaturePacks(initialPacks);
        // Initialize modal block libraries from parent state
        setModalBlockLibraries(selectedBlockLibraries);
        // Initialize modal custom block libraries from parent state, falling back to defaults
        const initialCustomLibs = customBlockLibraries.length > 0
            ? customBlockLibraries
            : (customBlockLibraryDefaults ?? []);
        setModalCustomBlockLibraries(initialCustomLibs);
        // Save pre-modal state for cancel/revert
        preModalOptionalDepsRef.current = selectedOptionalDependencies;
        // Initialize modal optional deps: auto-select mesh only when resolved requirement is true
        const currentStack = selectedStack ? stacks.find(s => s.id === selectedStack) : undefined;
        const meshDeps = resolveMeshOptionalDeps(pkg, selectedStack ?? '', currentStack);
        if (meshDeps !== null) {
            setModalOptionalDeps(meshDeps);
            onOptionalDependenciesChange?.(meshDeps);
        } else {
            setModalOptionalDeps(selectedOptionalDependencies);
        }
        setModalPackageId(pkg.id);
    }, []);

    const handleStackSelect = useCallback((stackId: string) => {
        const {
            onStackSelect,
            packages,
            stacks,
            onBlockLibrariesChange,
            blockLibraryDefaults,
            onCustomBlockLibrariesChange,
            onOptionalDependenciesChange,
            customBlockLibraries,
            customBlockLibraryDefaults,
        } = propsRef.current;
        onStackSelect(stackId);
        const selectedStackObj = stacks.find(s => s.id === stackId);
        // When stack changes, reset optional deps based on resolved mesh requirement
        const currentPkg = packages.find(p => p.id === modalPackageId);
        const meshDeps = resolveMeshOptionalDeps(currentPkg, stackId, selectedStackObj);
        if (meshDeps !== null) {
            setModalOptionalDeps(meshDeps);
            onOptionalDependenciesChange?.(meshDeps);
        } else {
            setModalOptionalDeps([]);
            onOptionalDependenciesChange?.([]);
        }
        // When stack changes, set addons to: required (from package) + default (from stack)
        setModalAddons(() => {
            const requiredAddons = currentPkg ? getRequiredAddons(currentPkg) : [];
            const defaultAddons = (selectedStackObj?.optionalAddons || [])
                .filter(addon => addon.default)
                .map(addon => addon.id);
            return [...new Set([...requiredAddons, ...defaultAddons])];
        });
        // When stack changes, reset feature packs to required only
        setModalFeaturePacks(() => {
            return currentPkg ? getRequiredFeaturePacks(currentPkg) : [];
        });
        // When stack changes, compute default block libraries for EDS stacks
        if (selectedStackObj?.frontend === 'eds-storefront' && modalPackageId) {
            const defaults = getDefaultBlockLibraryIds(selectedStackObj, modalPackageId, blockLibraryDefaults);
            const nativeIds = getNativeBlockLibraries(selectedStackObj, modalPackageId).map(l => l.id);
            const allLibraries = [...new Set([...nativeIds, ...defaults])];
            setModalBlockLibraries(allLibraries);
            onBlockLibrariesChange?.(allLibraries);
            // Propagate custom block libraries immediately so the tile count is accurate
            const initialCustomLibs = customBlockLibraries.length > 0
                ? customBlockLibraries
                : (customBlockLibraryDefaults ?? []);
            setModalCustomBlockLibraries(initialCustomLibs);
            onCustomBlockLibrariesChange?.(initialCustomLibs);
        } else {
            setModalBlockLibraries([]);
            onBlockLibrariesChange?.([]);
            setModalCustomBlockLibraries([]);
            onCustomBlockLibrariesChange?.([]);
        }
    }, [modalPackageId]);

    const handleModalAddonsChange = useCallback((addons: string[]) => {
        setModalAddons(addons);
    }, []);

    const handleModalFeaturePacksChange = useCallback((packs: string[]) => {
        setModalFeaturePacks(packs);
    }, []);

    const handleModalBlockLibrariesChange = useCallback((libraries: string[]) => {
        setModalBlockLibraries(libraries);
        onBlockLibrariesChange?.(libraries);
    }, [onBlockLibrariesChange]);

    const handleModalCustomBlockLibrariesChange = useCallback((libs: CustomBlockLibrary[]) => {
        setModalCustomBlockLibraries(libs);
        onCustomBlockLibrariesChange?.(libs);
    }, [onCustomBlockLibrariesChange]);

    const handleModalOptionalDepsChange = useCallback((deps: string[]) => {
        setModalOptionalDeps(deps);
        onOptionalDependenciesChange?.(deps);
    }, [onOptionalDependenciesChange]);

    const handleModalDone = useCallback(() => {
        const {
            onAddonsChange,
            onFeaturePacksChange,
            onBlockLibrariesChange,
            onCustomBlockLibrariesChange,
            onOptionalDependenciesChange,
            packages,
            stacks,
            selectedStack,
        } = propsRef.current;
        const currentPackage = packages.find(p => p.id === modalPackageId);
        const requiredAddons = currentPackage ? getRequiredAddons(currentPackage) : [];
        const finalAddons = [...new Set([...modalAddons, ...requiredAddons])];
        onAddonsChange?.(finalAddons);
        const requiredPacks = currentPackage ? getRequiredFeaturePacks(currentPackage) : [];
        const finalFeaturePacks = [...new Set([...modalFeaturePacks, ...requiredPacks])];
        onFeaturePacksChange?.(finalFeaturePacks);
        const stackObj = stacks.find(s => s.id === selectedStack);
        const nativeIds = stackObj && currentPackage
            ? getNativeBlockLibraries(stackObj, currentPackage.id).map(l => l.id)
            : [];
        const finalBlockLibraries = [...new Set([...nativeIds, ...modalBlockLibraries])];
        onBlockLibrariesChange?.(finalBlockLibraries);
        onCustomBlockLibrariesChange?.(modalCustomBlockLibraries);
        onOptionalDependenciesChange?.(modalOptionalDeps);
        if (modalBlockLibraries.length > 0) {
            vscode.postMessage('offer-save-block-library-defaults', {
                selectedLibraries: modalBlockLibraries,
            });
        }
        setModalPackageId(null);
    }, [modalAddons, modalFeaturePacks, modalBlockLibraries, modalCustomBlockLibraries, modalOptionalDeps, modalPackageId]);

    const handleModalClose = useCallback(() => {
        onOptionalDependenciesChange?.(preModalOptionalDepsRef.current);
        setModalPackageId(null);
    }, [onOptionalDependenciesChange]);

    return {
        modalPackageId,
        modalPackage,
        modalAddons,
        modalFeaturePacks,
        modalBlockLibraries,
        modalCustomBlockLibraries,
        modalOptionalDeps,
        handleCardClick,
        handleStackSelect,
        handleModalAddonsChange,
        handleModalFeaturePacksChange,
        handleModalBlockLibrariesChange,
        handleModalCustomBlockLibrariesChange,
        handleModalOptionalDepsChange,
        handleModalDone,
        handleModalClose,
    };
}
