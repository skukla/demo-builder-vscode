/**
 * BrandGallery Component
 *
 * Hybrid approach: Modal for architecture selection + expanded card for confirmation.
 * 1. Click brand → Modal opens with architecture options (room for descriptions)
 * 2. Select architecture → Modal closes
 * 3. Card expands to show the confirmed selection (at-a-glance confirmation)
 */

import { Text, DialogContainer, Checkbox, Divider } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState, useMemo, useCallback } from 'react';
import { DemoPackage } from '@/types/demoPackages';
import { Stack } from '@/types/stacks';
import { cn } from '@/core/ui/utils/classNames';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { Modal } from '@/core/ui/components/ui/Modal';
import { useArrowKeyNavigation } from '@/core/ui/hooks/useArrowKeyNavigation';
import { filterPackagesBySearchQuery } from './brandGalleryHelpers';

/** Addon metadata for display */
const ADDON_METADATA: Record<string, { name: string; description: string }> = {
    'demo-inspector': {
        name: 'Demo Inspector',
        description: 'Interactive overlay for exploring demo components and features',
    },
    'adobe-commerce-aco': {
        name: 'Adobe Commerce Optimizer',
        description: 'Catalog optimization service for enhanced product discovery',
    },
};

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
    /** Optional content to render above the gallery (e.g., project name field) */
    headerContent?: React.ReactNode;
}

interface PackageCardProps {
    pkg: DemoPackage;
    selectedStack?: Stack;
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
    isSelected,
    isDimmed,
    onCardClick,
}) => {
    const handleCardClick = useCallback(() => {
        onCardClick();
    }, [onCardClick]);

    const handleCardKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onCardClick();
            }
        },
        [onCardClick],
    );

    // Card is "complete" when package is selected AND has a stack
    const isComplete = isSelected && selectedStack;

    const cardClasses = cn(
        'expandable-brand-card',
        isSelected && 'selected',      // Blue border when package selected
        isComplete && 'expanded',       // Expanded when stack also selected
        isComplete && 'complete',
        isDimmed && 'dimmed',
    );

    return (
        <div
            role="button"
            tabIndex={0}
            data-testid="package-card"
            data-selected={isSelected ? 'true' : 'false'}
            data-dimmed={isDimmed ? 'true' : 'false'}
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
            className={cardClasses}
            aria-pressed={isSelected}
            aria-label={`${pkg.name}: ${pkg.description}`}
        >
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
                </div>
            )}
        </div>
    );
};

/**
 * ArchitectureModal - modal for selecting architecture/stack and optional addons
 */
interface ArchitectureModalProps {
    pkg: DemoPackage;
    stacks: Stack[];
    selectedStackId?: string;
    selectedAddons?: string[];
    onStackSelect: (stackId: string) => void;
    onAddonsChange: (addons: string[]) => void;
    onDone: () => void;
    onClose: () => void;
}

const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
    pkg,
    stacks,
    selectedStackId,
    selectedAddons = [],
    onStackSelect,
    onAddonsChange,
    onDone,
    onClose,
}) => {
    // Filter stacks based on package's storefronts (available stacks are the storefront keys)
    const filteredStacks = useMemo(() => {
        const availableStackIds = Object.keys(pkg.storefronts || {});
        if (availableStackIds.length === 0) {
            return stacks; // No restrictions - show all stacks
        }
        return stacks.filter(stack => availableStackIds.includes(stack.id));
    }, [stacks, pkg.storefronts]);

    // Use arrow key navigation hook for stack options
    const { getItemProps } = useArrowKeyNavigation({
        itemCount: filteredStacks.length,
        onSelect: (index) => onStackSelect(filteredStacks[index].id),
        wrap: true,
        autoFocusFirst: true,
        orientation: 'both',
    });

    const handleStackClick = useCallback(
        (stackId: string) => {
            onStackSelect(stackId);
        },
        [onStackSelect],
    );

    const handleAddonToggle = useCallback(
        (addonId: string, isSelected: boolean) => {
            if (isSelected) {
                onAddonsChange([...selectedAddons, addonId]);
            } else {
                onAddonsChange(selectedAddons.filter(id => id !== addonId));
            }
        },
        [selectedAddons, onAddonsChange],
    );

    // Get the selected stack object
    const selectedStack = useMemo(() => {
        if (!selectedStackId) return null;
        return stacks.find(s => s.id === selectedStackId) || null;
    }, [stacks, selectedStackId]);

    // Get available addons from selected stack's optionalAddons (stack-driven)
    const availableAddons = useMemo(() => {
        if (!selectedStack) return [];
        return (selectedStack.optionalAddons || []).filter(addon => ADDON_METADATA[addon.id]);
    }, [selectedStack]);

    // Build action buttons - only show Done when a stack is selected
    const actionButtons = selectedStackId
        ? [{ label: 'Done', variant: 'primary' as const, onPress: onDone }]
        : [];

    return (
        <Modal
            title={pkg.name}
            onClose={onClose}
            size="M"
            actionButtons={actionButtons}
        >
            <Text UNSAFE_className="description-block">
                How should it be built?
            </Text>
            <div className="architecture-modal-options" role="radiogroup" aria-label="Architecture options">
                {filteredStacks.map((stack, index) => {
                    const isSelected = selectedStackId === stack.id;
                    const itemProps = getItemProps(index);
                    return (
                        <div
                            key={stack.id}
                            ref={itemProps.ref}
                            role="radio"
                            tabIndex={itemProps.tabIndex}
                            aria-checked={isSelected}
                            data-selected={isSelected ? 'true' : 'false'}
                            className={cn(
                                'architecture-modal-option',
                                isSelected && 'selected',
                            )}
                            onClick={() => handleStackClick(stack.id)}
                            onKeyDown={itemProps.onKeyDown}
                        >
                            <div className="architecture-radio">
                                {isSelected && <div className="architecture-radio-dot" />}
                            </div>
                            <div className="architecture-content">
                                <Text UNSAFE_className="architecture-name">
                                    {stack.name}
                                </Text>
                                <Text UNSAFE_className="architecture-description">
                                    {stack.description}
                                </Text>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Services Section - only shown if package supports addons */}
            {availableAddons.length > 0 && (
                <div className="animate-fade-in">
                    <Divider size="S" marginTop="size-300" marginBottom="size-200" />
                    <Text UNSAFE_className="description-block-sm">
                        Optional Services
                    </Text>
                    <div className="architecture-addons">
                        {availableAddons.map((optionalAddon) => {
                            const addonMeta = ADDON_METADATA[optionalAddon.id];
                            if (!addonMeta) return null;
                            const isRequired = pkg.addons?.[optionalAddon.id] === 'required';
                            const isChecked = isRequired || selectedAddons.includes(optionalAddon.id);
                            return (
                                <Checkbox
                                    key={optionalAddon.id}
                                    isSelected={isChecked}
                                    isDisabled={isRequired}
                                    onChange={(isSelected) => handleAddonToggle(optionalAddon.id, isSelected)}
                                >
                                    <span className="addon-label">
                                        <span className="addon-name">{addonMeta.name}</span>
                                        <span className="addon-description">{addonMeta.description}</span>
                                    </span>
                                </Checkbox>
                            );
                        })}
                    </div>
                </div>
            )}
        </Modal>
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
    headerContent,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [modalPackageId, setModalPackageId] = useState<string | null>(null);
    // Track modal-local addon state (synced to parent on Done)
    const [modalAddons, setModalAddons] = useState<string[]>(selectedAddons);

    const filteredPackages = useMemo(
        () => filterPackagesBySearchQuery(packages, searchQuery),
        [packages, searchQuery]
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
            .filter(([_, mode]) => mode === 'required')
            .map(([id]) => id);
    }, []);

    const handleCardClick = useCallback((pkg: DemoPackage) => {
        // Always open modal when clicking a card (allows changing selection)
        onPackageSelect(pkg.id);
        // Initialize modal addons with current state + package's required addons
        const requiredAddons = getRequiredAddons(pkg);
        const initialAddons = [...new Set([...selectedAddons, ...requiredAddons])];
        setModalAddons(initialAddons);
        setModalPackageId(pkg.id);
    }, [onPackageSelect, selectedAddons, getRequiredAddons]);

    const handleStackSelect = useCallback((stackId: string) => {
        onStackSelect(stackId);
        // When stack changes, set addons to: required (from package) + default (from stack)
        setModalAddons(() => {
            const currentPackage = packages.find(p => p.id === modalPackageId);
            const requiredAddons = currentPackage ? getRequiredAddons(currentPackage) : [];
            const selectedStack = stacks.find(s => s.id === stackId);
            const defaultAddons = (selectedStack?.optionalAddons || [])
                .filter(addon => addon.default)
                .map(addon => addon.id);
            return [...new Set([...requiredAddons, ...defaultAddons])];
        });
    }, [onStackSelect, packages, stacks, modalPackageId, getRequiredAddons]);

    const handleModalAddonsChange = useCallback((addons: string[]) => {
        setModalAddons(addons);
    }, []);

    const handleModalDone = useCallback(() => {
        // Sync addons to parent state (including required addons) and close modal
        const currentPackage = packages.find(p => p.id === modalPackageId);
        const requiredAddons = currentPackage ? getRequiredAddons(currentPackage) : [];
        const finalAddons = [...new Set([...modalAddons, ...requiredAddons])];
        onAddonsChange?.(finalAddons);
        setModalPackageId(null);
    }, [modalAddons, onAddonsChange, packages, modalPackageId, getRequiredAddons]);

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
                        onStackSelect={handleStackSelect}
                        onAddonsChange={handleModalAddonsChange}
                        onDone={handleModalDone}
                        onClose={handleModalClose}
                    />
                )}
            </DialogContainer>
        </SingleColumnLayout>
    );
};
