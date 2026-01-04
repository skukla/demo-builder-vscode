/**
 * BrandGallery Component
 *
 * Hybrid approach: Modal for architecture selection + expanded card for confirmation.
 * 1. Click brand → Modal opens with architecture options (room for descriptions)
 * 2. Select architecture → Modal closes
 * 3. Card expands to show the confirmed selection (at-a-glance confirmation)
 */

import React, { useState, useMemo, useCallback } from 'react';
import stylesImport from '../styles/project-creation.module.css';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};

import type { DemoPackage } from '@/types/demoPackages';

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filters packages based on a search query.
 * Matches packages where the name OR description contains the query (case-insensitive).
 */
function filterPackagesBySearchQuery(packages: DemoPackage[], searchQuery: string): DemoPackage[] {
    if (!searchQuery.trim()) {
        return packages;
    }
    const query = searchQuery.toLowerCase();
    return packages.filter(
        (p) =>
            p.name.toLowerCase().includes(query) ||
            p.description.toLowerCase().includes(query),
    );
}
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import { Text, Checkbox, Divider } from '@/core/ui/components/aria';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { Modal } from '@/core/ui/components/ui/Modal';
import { useArrowKeyNavigation } from '@/core/ui/hooks/useArrowKeyNavigation';
import { cn } from '@/core/ui/utils/classNames';
import { Stack } from '@/types/stacks';

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
        styles.expandableBrandCard,
        isSelected && styles.selected,      // Blue border when package selected
        isComplete && styles.expanded,       // Expanded when stack also selected
        isComplete && 'complete',
        isDimmed && styles.dimmed,
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
            <div className={styles.brandCardHeader}>
                <div className={styles.brandCardTitleRow}>
                    <Text className={styles.brandCardName}>
                        {pkg.name}
                    </Text>
                    {isComplete && (
                        <CheckmarkCircle size="S" />
                    )}
                </div>
                <Text className={styles.brandCardDescription}>
                    {pkg.description}
                </Text>
            </div>

            {/* Selected architecture - shown when complete */}
            {isComplete && (
                <div className={styles.brandCardSelection}>
                    <Text className={styles.brandCardSelectionLabel}>
                        Architecture
                    </Text>
                    <Text className={styles.brandCardSelectionValue}>
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
            <Text className="description-block">
                How should it be built?
            </Text>
            <div className={styles.architectureModalOptions} role="radiogroup" aria-label="Architecture options">
                {filteredStacks.map((stack, index) => {
                    const isStackSelected = selectedStackId === stack.id;
                    const itemProps = getItemProps(index);
                    return (
                        <div
                            key={stack.id}
                            ref={itemProps.ref}
                            role="radio"
                            tabIndex={itemProps.tabIndex}
                            aria-checked={isStackSelected}
                            data-selected={isStackSelected ? 'true' : 'false'}
                            className={cn(
                                styles.architectureModalOption,
                                isStackSelected && styles.selected,
                            )}
                            onClick={() => handleStackClick(stack.id)}
                            onKeyDown={itemProps.onKeyDown}
                        >
                            <div className={styles.architectureRadio}>
                                {isStackSelected && <div className={styles.architectureRadioDot} />}
                            </div>
                            <div className={styles.architectureContent}>
                                <Text className={styles.architectureName}>
                                    {stack.name}
                                </Text>
                                <Text className={styles.architectureDescription}>
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
                    <Divider size="S" className={styles.servicesDivider} />
                    <Text className="description-block-sm">
                        Optional Services
                    </Text>
                    <div className={styles.architectureAddons}>
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
                                    onChange={(isAddonSelected) => handleAddonToggle(optionalAddon.id, isAddonSelected)}
                                >
                                    <span className={styles.addonLabel}>
                                        <span className={styles.addonName}>{addonMeta.name}</span>
                                        <span className={styles.addonDescription}>{addonMeta.description}</span>
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
                <Text className="text-gray-600">
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

            <div className={styles.expandableBrandGrid}>
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
                <Text className="empty-state-text">
                    No packages match "{searchQuery}"
                </Text>
            )}

            {/* Architecture selection modal */}
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
        </SingleColumnLayout>
    );
};
