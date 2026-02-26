/**
 * BrandGallery Component
 *
 * Hybrid approach: Modal for architecture selection + expanded card for confirmation.
 * 1. Click brand -> Modal opens with architecture options (room for descriptions)
 * 2. Select architecture -> Modal closes
 * 3. Card expands to show the confirmed selection (at-a-glance confirmation)
 */

import { Text, DialogContainer } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState, useMemo, useCallback } from 'react';
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
    /** Optional content to render above the gallery (e.g., project name field) */
    headerContent?: React.ReactNode;
}

interface PackageCardProps {
    pkg: DemoPackage;
    selectedStack?: Stack;
    selectedBlockLibraries?: string[];
    customBlockLibraries?: CustomBlockLibrary[];
    isSelected: boolean;
    isDimmed: boolean;
    onCardClick: () => void;
}

/**
 * PackageCard - displays package info, expands to show selected architecture
 */
const PackageCard: React.FC<PackageCardProps> = ({
    pkg,
    selectedStack,
    selectedBlockLibraries = [],
    customBlockLibraries,
    isSelected,
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

    // Card is "complete" when package is selected AND has a stack
    const isComplete = isSelected && selectedStack;

    const cardClasses = cn(
        'expandable-brand-card',
        isSelected && 'selected',      // Blue border when package selected
        isComplete && 'expanded',       // Expanded when stack also selected
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
            {/* Package header - always visible */}
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

            {/* Selected architecture - shown when complete */}
            {isComplete && (
                <div className="brand-card-selection">
                    <Text UNSAFE_className="brand-card-selection-label">
                        Architecture
                    </Text>
                    <Text UNSAFE_className="brand-card-selection-value">
                        {selectedStack.name}
                    </Text>
                    <div className={cn(
                        'brand-card-libraries-wrapper',
                        (selectedBlockLibraries.length > 0 || (customBlockLibraries?.length ?? 0) > 0) && 'has-libraries',
                    )}>
                        <div className="brand-card-libraries-inner">
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
    onPackageSelect,
    onStackSelect,
    onAddonsChange,
    selectedBlockLibraries = [],
    onBlockLibrariesChange,
    blockLibraryDefaults,
    customBlockLibraries = [],
    onCustomBlockLibrariesChange,
    customBlockLibraryDefaults,
    headerContent,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [modalPackageId, setModalPackageId] = useState<string | null>(null);
    // Track modal-local addon state (synced to parent on Done)
    const [modalAddons, setModalAddons] = useState<string[]>(selectedAddons);
    // Track modal-local block library state (synced to parent on Done)
    const [modalBlockLibraries, setModalBlockLibraries] = useState<string[]>(selectedBlockLibraries);
    // Track modal-local custom block library state (synced to parent on Done)
    const [modalCustomBlockLibraries, setModalCustomBlockLibraries] = useState<CustomBlockLibrary[]>(customBlockLibraries);

    const filteredPackages = useMemo(
        () => sortPackages(filterPackagesBySearchQuery(packages, searchQuery)),
        [packages, searchQuery],
    );

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

    const handleCardClick = useCallback((pkg: DemoPackage) => {
        // Always open modal when clicking a card (allows changing selection)
        onPackageSelect(pkg.id);
        // Initialize modal addons with current state + package's required addons
        const requiredAddons = getRequiredAddons(pkg);
        const initialAddons = [...new Set([...selectedAddons, ...requiredAddons])];
        setModalAddons(initialAddons);
        // Initialize modal block libraries from parent state
        setModalBlockLibraries(selectedBlockLibraries);
        // Initialize modal custom block libraries from parent state, falling back to defaults
        const initialCustomLibs = customBlockLibraries.length > 0
            ? customBlockLibraries
            : (customBlockLibraryDefaults ?? []);
        setModalCustomBlockLibraries(initialCustomLibs);
        setModalPackageId(pkg.id);
    }, [onPackageSelect, selectedAddons, selectedBlockLibraries, customBlockLibraries, customBlockLibraryDefaults, getRequiredAddons]);

    const handleStackSelect = useCallback((stackId: string) => {
        onStackSelect(stackId);
        // When stack changes, set addons to: required (from package) + default (from stack)
        setModalAddons(() => {
            const currentPackage = packages.find(p => p.id === modalPackageId);
            const requiredAddons = currentPackage ? getRequiredAddons(currentPackage) : [];
            const stackObj = stacks.find(s => s.id === stackId);
            const defaultAddons = (stackObj?.optionalAddons || [])
                .filter(addon => addon.default)
                .map(addon => addon.id);
            return [...new Set([...requiredAddons, ...defaultAddons])];
        });
        // When stack changes, compute default block libraries for EDS stacks
        const stackObj = stacks.find(s => s.id === stackId);
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
    }, [onStackSelect, packages, stacks, modalPackageId, getRequiredAddons, onBlockLibrariesChange, blockLibraryDefaults, onCustomBlockLibrariesChange]);

    const handleModalAddonsChange = useCallback((addons: string[]) => {
        setModalAddons(addons);
    }, []);

    const handleModalBlockLibrariesChange = useCallback((libraries: string[]) => {
        setModalBlockLibraries(libraries);
        onBlockLibrariesChange?.(libraries);
    }, [onBlockLibrariesChange]);

    const handleModalCustomBlockLibrariesChange = useCallback((libs: CustomBlockLibrary[]) => {
        setModalCustomBlockLibraries(libs);
        onCustomBlockLibrariesChange?.(libs);
    }, [onCustomBlockLibrariesChange]);

    const handleModalDone = useCallback(() => {
        // Sync addons to parent state (including required addons) and close modal
        const currentPackage = packages.find(p => p.id === modalPackageId);
        const requiredAddons = currentPackage ? getRequiredAddons(currentPackage) : [];
        const finalAddons = [...new Set([...modalAddons, ...requiredAddons])];
        onAddonsChange?.(finalAddons);
        // Sync block libraries to parent state (including native libraries)
        const stackObj = stacks.find(s => s.id === selectedStack);
        const nativeIds = stackObj && currentPackage
            ? getNativeBlockLibraries(stackObj, currentPackage.id).map(l => l.id)
            : [];
        const finalBlockLibraries = [...new Set([...nativeIds, ...modalBlockLibraries])];
        onBlockLibrariesChange?.(finalBlockLibraries);
        // Sync custom block libraries to parent state
        onCustomBlockLibrariesChange?.(modalCustomBlockLibraries);
        // Offer to save block library defaults (one-time tip handled by extension host)
        if (modalBlockLibraries.length > 0) {
            vscode.postMessage('offer-save-block-library-defaults', {
                selectedLibraries: modalBlockLibraries,
            });
        }
        setModalPackageId(null);
    }, [modalAddons, modalBlockLibraries, modalCustomBlockLibraries, onAddonsChange, onBlockLibrariesChange, onCustomBlockLibrariesChange, packages, stacks, selectedStack, modalPackageId, getRequiredAddons]);

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

            <div className="expandable-brand-grid">
                {filteredPackages.map(pkg => {
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
                            isDimmed={isDimmed}
                            onCardClick={() => handleCardClick(pkg)}
                        />
                    );
                })}
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
                        selectedBlockLibraries={modalBlockLibraries}
                        customBlockLibraries={modalCustomBlockLibraries}
                        customBlockLibraryDefaults={customBlockLibraryDefaults}
                        onStackSelect={handleStackSelect}
                        onAddonsChange={handleModalAddonsChange}
                        onBlockLibrariesChange={handleModalBlockLibrariesChange}
                        onCustomBlockLibrariesChange={handleModalCustomBlockLibrariesChange}
                        onDone={handleModalDone}
                        onClose={handleModalClose}
                    />
                )}
            </DialogContainer>
        </SingleColumnLayout>
    );
};
