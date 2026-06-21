/**
 * BrandGallery Component
 *
 * Package-select only (mark-and-Continue): clicking a card selects the demo
 * package and the wizard advances to the Project Builder step, where the
 * architecture, App Builder components, and block libraries are chosen. The
 * ArchitectureModal was retired in Slice 2 (Project Builder step).
 */

import { Text } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { getBlockLibraryName } from '../../services/blockLibraryLoader';
import { sortPackages, filterPackagesBySearchQuery } from './brandGalleryHelpers';
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
    /** Selected stack id — for the card summary display (chosen on the next step). */
    selectedStack?: string;
    onPackageSelect: (packageId: string) => void;
    /** Selected block library IDs — for the card summary display. */
    selectedBlockLibraries?: string[];
    /** Custom block libraries added by URL — for the card summary display. */
    customBlockLibraries?: CustomBlockLibrary[];
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
    onPackageSelect,
    selectedBlockLibraries = [],
    customBlockLibraries = [],
    headerContent,
}) => {
    const [searchQuery, setSearchQuery] = useState('');

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
                                    onCardClick={() => onPackageSelect(pkg.id)}
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
        </SingleColumnLayout>
    );
};
