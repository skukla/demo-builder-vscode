/**
 * BrandGallery Component
 *
 * Hybrid approach: Modal for architecture selection + detail panel for confirmation.
 * 1. Click brand -> Modal opens with architecture options (room for descriptions)
 * 2. Select architecture -> Modal closes
 * 3. Detail panel below grid shows the confirmed selection (no layout shift)
 */

import { Text, DialogContainer } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
    getNativeBlockLibraries,
    getDefaultBlockLibraryIds,
    getBlockLibraryName,
} from '../../services/blockLibraryLoader';
import { ArchitectureModal } from './ArchitectureModal';
import { sortPackages, filterPackagesBySearchQuery } from './brandGalleryHelpers';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { cn } from '@/core/ui/utils/classNames';
import { vscode } from '@/core/ui/utils/vscode-api';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';

export interface BrandGalleryProps {
    /** Demo packages to display (renamed from brands) */
    packages: DemoPackage[];
    stacks: Stack[];
    selectedPackage?: string;
    selectedStack?: string;
    selectedAddons?: string[];
    onPackageSelect: (packageId: string) => void;
    onStackSelect: (stackId: string) => void;
    onAddonsChange?: (addons: string[]) => void;
    selectedFeaturePacks?: string[];
    onFeaturePacksChange?: (packs: string[]) => void;
    selectedBlockLibraries?: string[];
    onBlockLibrariesChange?: (libraries: string[]) => void;
    /** User's saved block library default preferences (from settings) */
    blockLibraryDefaults?: string[];
    /** Custom block libraries added by URL */
    customBlockLibraries?: CustomBlockLibrary[];
    /** Callback when custom block libraries change */
    onCustomBlockLibrariesChange?: (libs: CustomBlockLibrary[]) => void;
    /** Custom block library defaults from VS Code settings */
    customBlockLibraryDefaults?: CustomBlockLibrary[];
    /** Selected optional dependency IDs (e.g., mesh components from stack.optionalDependencies) */
    selectedOptionalDependencies?: string[];
    /** Callback when optional dependencies change */
    onOptionalDependenciesChange?: (deps: string[]) => void;
    /** Optional content to render above the gallery (e.g., project name field) */
    headerContent?: React.ReactNode;
}

interface PackageCardProps {
    pkg: DemoPackage;
    selectedStack?: Stack;
    selectedBlockLibraries?: string[];
    customBlockLibraries?: CustomBlockLibrary[];
    isSelected: boolean;
    isComplete: boolean;
    isDimmed: boolean;
    onCardClick: () => void;
}

/**
 * PackageCard - displays package info with selection indicator
 */
const PackageCard: React.FC<PackageCardProps> = ({
    pkg,
    selectedStack,
    selectedBlockLibraries = [],
    customBlockLibraries,
    isSelected,
    isComplete,
    isDimmed,
    onCardClick,
}) => {
    const isComingSoon = pkg.status === 'coming-soon';

    const handleCardClick = useCallback(() => {
        if (!isComingSoon) {
            onCardClick();
        }
    }, [onCardClick, isComingSoon]);

    const handleCardKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (!isComingSoon && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onCardClick();
            }
        },
        [onCardClick, isComingSoon],
    );

    const libraryCount = selectedBlockLibraries.length + (customBlockLibraries?.length ?? 0);

    const cardClasses = cn(
        'expandable-brand-card',
        isSelected && 'selected',
        isComplete && 'expanded',
        isComplete && 'complete',
        isDimmed && 'dimmed',
        isComingSoon && 'coming-soon',
    );

    return (
        <div
            role="button"
            tabIndex={isComingSoon ? -1 : 0}
            data-testid="package-card"
            data-selected={isSelected ? 'true' : 'false'}
            data-dimmed={isDimmed ? 'true' : 'false'}
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
            className={cardClasses}
            aria-pressed={isComingSoon ? undefined : isSelected}
            aria-disabled={isComingSoon || undefined}
            aria-label={`${pkg.name}: ${pkg.description}`}
        >
            {isComingSoon && (
                <span className="architecture-badge">Coming Soon</span>
            )}
            <div className="brand-card-header">
                <div className="brand-card-title-row">
                    <Text UNSAFE_className="brand-card-name">
                        {pkg.name}
                    </Text>
                    {isComplete && (
                        <CheckmarkCircle size="S" UNSAFE_className="brand-card-check" />
                    )}
                </div>
                <Text UNSAFE_className="brand-card-description">
                    {pkg.description}
                </Text>
            </div>

            {/* Compact selection: architecture name + hover tooltip for libraries */}
            {isComplete && selectedStack && (
                <div className="brand-card-selection">
                    <Text UNSAFE_className="brand-card-selection-label">
                        Architecture
                    </Text>
                    <Text UNSAFE_className="brand-card-selection-value">
                        {selectedStack.name}
                    </Text>
                    {libraryCount > 0 && (
                        <div className="brand-card-detail-trigger">
                            <Text UNSAFE_className="brand-card-detail-link">
                                {libraryCount} block {libraryCount === 1 ? 'library' : 'libraries'}
                            </Text>
                            <div className="brand-card-detail-tooltip">
                                <Text UNSAFE_className="brand-card-selection-label">
                                    Block Libraries
                                </Text>
                                {selectedBlockLibraries.map(id => (
                                    <Text key={id} UNSAFE_className="brand-card-selection-value">
                                        {getBlockLibraryName(id)}
                                    </Text>
                                ))}
                                {customBlockLibraries?.map(lib => (
                                    <Text key={`${lib.source.owner}/${lib.source.repo}`} UNSAFE_className="brand-card-selection-value">
                                        {lib.name}
                                    </Text>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const BrandGallery: React.FC<BrandGalleryProps> = ({
    packages,
    stacks,
    selectedPackage,
    selectedStack,
    selectedAddons = [],
    selectedFeaturePacks = [],
    onPackageSelect,
    onStackSelect,
    onAddonsChange,
    onFeaturePacksChange,
    selectedBlockLibraries = [],
    onBlockLibrariesChange,
    blockLibraryDefaults,
    customBlockLibraries = [],
    onCustomBlockLibrariesChange,
    customBlockLibraryDefaults,
    selectedOptionalDependencies = [],
    onOptionalDependenciesChange,
    headerContent,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [modalPackageId, setModalPackageId] = useState<string | null>(null);
    // Track modal-local addon state (synced to parent on Done)
    const [modalAddons, setModalAddons] = useState<string[]>(selectedAddons);
    // Track modal-local feature pack state (synced to parent on Done)
    const [modalFeaturePacks, setModalFeaturePacks] = useState<string[]>(selectedFeaturePacks);
    // Track modal-local block library state (synced to parent on Done)
    const [modalBlockLibraries, setModalBlockLibraries] = useState<string[]>(selectedBlockLibraries);
    // Track modal-local custom block library state (synced to parent on Done)
    const [modalCustomBlockLibraries, setModalCustomBlockLibraries] = useState<CustomBlockLibrary[]>(customBlockLibraries);
    // Track modal-local optional dependency state (e.g., mesh toggle; synced to parent on Done)
    const [modalOptionalDeps, setModalOptionalDeps] = useState<string[]>(selectedOptionalDependencies);

    // Sync custom block libraries when VS Code settings change while modal is open.
    // Uses a ref to track the previous defaults so we only react to actual changes,
    // not the initial mount (which would override the user's checkbox state).
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

    const filteredPackages = useMemo(
        () => sortPackages(filterPackagesBySearchQuery(packages, searchQuery)),
        [packages, searchQuery],
    );

    // Responsive column count based on container width (matches old grid minmax(220px, 1fr))
    const gridRef = useRef<HTMLDivElement>(null);
    const [columnCount, setColumnCount] = useState(3);
    useEffect(() => {
        const el = gridRef.current;
        if (!el) return;
        const observer = new ResizeObserver(entries => {
            const width = entries[0].contentRect.width;
            const minCardWidth = 220;
            const gap = 20;
            setColumnCount(Math.max(1, Math.floor((width + gap) / (minCardWidth + gap))));
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Distribute packages into columns (left-to-right, then wrap to next row)
    const columns = useMemo(() => {
        const cols: DemoPackage[][] = Array.from({ length: columnCount }, () => []);
        filteredPackages.forEach((pkg, i) => {
            cols[i % columnCount].push(pkg);
        });
        return cols;
    }, [filteredPackages, columnCount]);

    // Get the package object for the modal
    const modalPackage = useMemo(() => {
        if (!modalPackageId) return null;
        return packages.find(p => p.id === modalPackageId) || null;
    }, [packages, modalPackageId]);

    // Get the selected stack object
    const selectedStackObj = useMemo(() => {
        if (!selectedStack) return undefined;
        return stacks.find(s => s.id === selectedStack);
    }, [stacks, selectedStack]);

    // Helper to get required addon IDs from package's addons config
    const getRequiredAddons = useCallback((pkg: DemoPackage): string[] => {
        if (!pkg.addons) return [];
        return Object.entries(pkg.addons)
            .filter(([_, config]) => config === 'required')
            .map(([id]) => id);
    }, []);

    // Helper to get required feature pack IDs from package's featurePacks config
    const getRequiredFeaturePacks = useCallback((pkg: DemoPackage): string[] => {
        if (!pkg.featurePacks) return [];
        return Object.entries(pkg.featurePacks)
            .filter(([_, config]) => config === 'required')
            .map(([id]) => id);
    }, []);

    const handleCardClick = useCallback((pkg: DemoPackage) => {
        // Always open modal when clicking a card (allows changing selection)
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
        // Initialize modal optional deps: auto-select all optionalDependencies if package requires mesh
        if (pkg.requiresMesh) {
            const currentStack = selectedStack ? stacks.find(s => s.id === selectedStack) : undefined;
            setModalOptionalDeps(currentStack?.optionalDependencies ?? []);
        } else {
            setModalOptionalDeps(selectedOptionalDependencies);
        }
        setModalPackageId(pkg.id);
    }, [onPackageSelect, selectedAddons, selectedFeaturePacks, selectedBlockLibraries, customBlockLibraries, customBlockLibraryDefaults, getRequiredAddons, getRequiredFeaturePacks, selectedOptionalDependencies, selectedStack, stacks]);

    const handleStackSelect = useCallback((stackId: string) => {
        onStackSelect(stackId);
        const selectedStackObj = stacks.find(s => s.id === stackId);
        // When stack changes, reset optional deps based on package requiresMesh
        const currentPkg = packages.find(p => p.id === modalPackageId);
        if (currentPkg?.requiresMesh) {
            setModalOptionalDeps(selectedStackObj?.optionalDependencies ?? []);
        } else {
            setModalOptionalDeps([]);
        }
        // When stack changes, set addons to: required (from package) + default (from stack)
        setModalAddons(() => {
            const currentPackage = packages.find(p => p.id === modalPackageId);
            const requiredAddons = currentPackage ? getRequiredAddons(currentPackage) : [];
            const defaultAddons = (selectedStackObj?.optionalAddons || [])
                .filter(addon => addon.default)
                .map(addon => addon.id);
            return [...new Set([...requiredAddons, ...defaultAddons])];
        });
        // When stack changes, reset feature packs to required only
        setModalFeaturePacks(() => {
            const currentPackage = packages.find(p => p.id === modalPackageId);
            return currentPackage ? getRequiredFeaturePacks(currentPackage) : [];
        });
        // When stack changes, compute default block libraries for EDS stacks
        const stackObj = selectedStackObj;
        if (stackObj?.frontend === 'eds-storefront' && modalPackageId) {
            const defaults = getDefaultBlockLibraryIds(stackObj, modalPackageId, blockLibraryDefaults);
            const nativeIds = getNativeBlockLibraries(stackObj, modalPackageId).map(l => l.id);
            const allLibraries = [...new Set([...nativeIds, ...defaults])];
            setModalBlockLibraries(allLibraries);
            onBlockLibrariesChange?.(allLibraries);
            // Custom block libraries persist for EDS stacks (user-provided, not stack-dependent)
        } else {
            setModalBlockLibraries([]);
            onBlockLibrariesChange?.([]);
            // Clear custom block libraries for non-EDS stacks
            setModalCustomBlockLibraries([]);
            onCustomBlockLibrariesChange?.([]);
        }
    }, [onStackSelect, packages, stacks, modalPackageId, getRequiredAddons, getRequiredFeaturePacks, onBlockLibrariesChange, blockLibraryDefaults, onCustomBlockLibrariesChange]);

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
    }, []);

    const handleModalDone = useCallback(() => {
        // Sync addons to parent state (including required addons) and close modal
        const currentPackage = packages.find(p => p.id === modalPackageId);
        const requiredAddons = currentPackage ? getRequiredAddons(currentPackage) : [];
        const finalAddons = [...new Set([...modalAddons, ...requiredAddons])];
        onAddonsChange?.(finalAddons);
        // Sync feature packs to parent state (including required packs)
        const requiredPacks = currentPackage ? getRequiredFeaturePacks(currentPackage) : [];
        const finalFeaturePacks = [...new Set([...modalFeaturePacks, ...requiredPacks])];
        onFeaturePacksChange?.(finalFeaturePacks);
        // Sync block libraries to parent state (including native libraries)
        const stackObj = stacks.find(s => s.id === selectedStack);
        const nativeIds = stackObj && currentPackage
            ? getNativeBlockLibraries(stackObj, currentPackage.id).map(l => l.id)
            : [];
        const finalBlockLibraries = [...new Set([...nativeIds, ...modalBlockLibraries])];
        onBlockLibrariesChange?.(finalBlockLibraries);
        // Sync custom block libraries to parent state
        onCustomBlockLibrariesChange?.(modalCustomBlockLibraries);
        // Sync optional dependencies (mesh toggle) to parent state
        onOptionalDependenciesChange?.(modalOptionalDeps);
        // Offer to save block library defaults (one-time tip handled by extension host)
        if (modalBlockLibraries.length > 0) {
            vscode.postMessage('offer-save-block-library-defaults', {
                selectedLibraries: modalBlockLibraries,
            });
        }
        setModalPackageId(null);
    }, [modalAddons, modalFeaturePacks, modalBlockLibraries, modalCustomBlockLibraries, modalOptionalDeps, onAddonsChange, onFeaturePacksChange, onBlockLibrariesChange, onCustomBlockLibrariesChange, onOptionalDependenciesChange, packages, stacks, selectedStack, modalPackageId, getRequiredAddons, getRequiredFeaturePacks]);

    const handleModalClose = useCallback(() => {
        setModalPackageId(null);
    }, []);

    if (packages.length === 0) {
        return (
            <SingleColumnLayout>
                <Text UNSAFE_className="text-gray-600">
                    No packages available
                </Text>
            </SingleColumnLayout>
        );
    }

    return (
        <SingleColumnLayout>
            {/* Optional header content (e.g., project name field) */}
            {headerContent}

            <SearchHeader
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                searchPlaceholder="Filter packages..."
                searchThreshold={2}
                totalCount={packages.length}
                filteredCount={filteredPackages.length}
                itemNoun="package"
                hasLoadedOnce={true}
            />

            <div ref={gridRef} className="expandable-brand-grid">
                {columns.map((colItems, colIndex) => (
                    <div key={colIndex} className="brand-grid-column">
                        {colItems.map(pkg => {
                            const isSelected = selectedPackage === pkg.id;
                            const isDimmed = selectedPackage !== undefined && !isSelected;
                            return (
                                <PackageCard
                                    key={pkg.id}
                                    pkg={pkg}
                                    selectedStack={isSelected ? selectedStackObj : undefined}
                                    selectedBlockLibraries={isSelected ? selectedBlockLibraries : undefined}
                                    customBlockLibraries={isSelected ? customBlockLibraries : undefined}
                                    isSelected={isSelected}
                                    isComplete={isSelected && !!selectedStackObj}
                                    isDimmed={isDimmed}
                                    onCardClick={() => handleCardClick(pkg)}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>

            {searchQuery && filteredPackages.length === 0 && (
                <Text UNSAFE_className="empty-state-text">
                    No packages match "{searchQuery}"
                </Text>
            )}

            {/* Architecture selection modal */}
            <DialogContainer onDismiss={handleModalClose}>
                {modalPackage && (
                    <ArchitectureModal
                        pkg={modalPackage}
                        stacks={stacks}
                        selectedStackId={selectedPackage === modalPackage.id ? selectedStack : undefined}
                        selectedAddons={modalAddons}
                        selectedFeaturePacks={modalFeaturePacks}
                        selectedBlockLibraries={modalBlockLibraries}
                        customBlockLibraries={modalCustomBlockLibraries}
                        customBlockLibraryDefaults={customBlockLibraryDefaults}
                        onStackSelect={handleStackSelect}
                        onAddonsChange={handleModalAddonsChange}
                        onFeaturePacksChange={handleModalFeaturePacksChange}
                        onBlockLibrariesChange={handleModalBlockLibrariesChange}
                        onCustomBlockLibrariesChange={handleModalCustomBlockLibrariesChange}
                        selectedOptionalDependencies={modalOptionalDeps}
                        onOptionalDependenciesChange={handleModalOptionalDepsChange}
                        onDone={handleModalDone}
                        onClose={handleModalClose}
                    />
                )}
            </DialogContainer>
        </SingleColumnLayout>
    );
};
