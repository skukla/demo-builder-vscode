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
import { getBlockLibraryName } from '../../services/blockLibraryLoader';
import { ArchitectureModal } from './ArchitectureModal';
import { sortPackages, filterPackagesBySearchQuery } from './brandGalleryHelpers';
import { useModalState } from '../hooks/useModalState';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { cn } from '@/core/ui/utils/classNames';
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

    const {
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
    } = useModalState({
        packages,
        stacks,
        selectedStack,
        selectedAddons,
        selectedFeaturePacks,
        selectedBlockLibraries,
        customBlockLibraries,
        customBlockLibraryDefaults: customBlockLibraryDefaults ?? [],
        blockLibraryDefaults,
        selectedOptionalDependencies,
        onPackageSelect,
        onStackSelect,
        onAddonsChange,
        onFeaturePacksChange,
        onBlockLibrariesChange,
        onCustomBlockLibrariesChange,
        onOptionalDependenciesChange,
    });

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

    // Get the selected stack object
    const selectedStackObj = useMemo(() => {
        if (!selectedStack) return undefined;
        return stacks.find(s => s.id === selectedStack);
    }, [stacks, selectedStack]);

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
