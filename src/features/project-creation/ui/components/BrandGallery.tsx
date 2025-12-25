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
import { Brand } from '@/types/brands';
import { Stack } from '@/types/stacks';
import { cn } from '@/core/ui/utils/classNames';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { Modal } from '@/core/ui/components/ui/Modal';
import { useArrowKeyNavigation } from '@/core/ui/hooks/useArrowKeyNavigation';
import { filterBrandsBySearchQuery } from './brandGalleryHelpers';

/** Addon metadata for display */
const ADDON_METADATA: Record<string, { name: string; description: string }> = {
    'adobe-commerce-aco': {
        name: 'Adobe Commerce Optimizer',
        description: 'Catalog optimization service for enhanced product discovery',
    },
};

export interface BrandGalleryProps {
    brands: Brand[];
    stacks: Stack[];
    selectedBrand?: string;
    selectedStack?: string;
    selectedAddons?: string[];
    onBrandSelect: (brandId: string) => void;
    onStackSelect: (stackId: string) => void;
    onAddonsChange?: (addons: string[]) => void;
    /** Optional content to render above the brand gallery (e.g., project name field) */
    headerContent?: React.ReactNode;
}

interface BrandCardProps {
    brand: Brand;
    selectedStack?: Stack;
    isSelected: boolean;
    isDimmed: boolean;
    onCardClick: () => void;
}

/**
 * BrandCard - displays brand info, expands to show selected architecture
 */
const BrandCard: React.FC<BrandCardProps> = ({
    brand,
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

    // Card is "complete" when brand is selected AND has a stack
    const isComplete = isSelected && selectedStack;

    const cardClasses = cn(
        'expandable-brand-card',
        isSelected && 'selected',      // Blue border when brand selected
        isComplete && 'expanded',       // Expanded when stack also selected
        isComplete && 'complete',
        isDimmed && 'dimmed',
    );

    return (
        <div
            role="button"
            tabIndex={0}
            data-testid="brand-card"
            data-selected={isSelected ? 'true' : 'false'}
            data-dimmed={isDimmed ? 'true' : 'false'}
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
            className={cardClasses}
            aria-pressed={isSelected}
            aria-label={`${brand.name}: ${brand.description}`}
        >
            {/* Brand header - always visible */}
            <div className="brand-card-header">
                <div className="brand-card-title-row">
                    <Text UNSAFE_className="brand-card-name">
                        {brand.name}
                    </Text>
                    {isComplete && (
                        <CheckmarkCircle size="S" UNSAFE_className="brand-card-check" />
                    )}
                </div>
                <Text UNSAFE_className="brand-card-description">
                    {brand.description}
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
    brand: Brand;
    stacks: Stack[];
    selectedStackId?: string;
    selectedAddons?: string[];
    onStackSelect: (stackId: string) => void;
    onAddonsChange: (addons: string[]) => void;
    onDone: () => void;
    onClose: () => void;
}

const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
    brand,
    stacks,
    selectedStackId,
    selectedAddons = [],
    onStackSelect,
    onAddonsChange,
    onDone,
    onClose,
}) => {
    // Filter stacks based on brand's compatibleStacks (if defined)
    const filteredStacks = useMemo(() => {
        if (!brand.compatibleStacks || brand.compatibleStacks.length === 0) {
            return stacks; // No restrictions - show all stacks
        }
        return stacks.filter(stack => brand.compatibleStacks!.includes(stack.id));
    }, [stacks, brand.compatibleStacks]);

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

    // Get available addons from brand's addons config (brand-driven, not stack-driven)
    const availableAddons = useMemo(() => {
        return Object.keys(brand.addons || {});
    }, [brand.addons]);

    // Build action buttons - only show Done when a stack is selected
    const actionButtons = selectedStackId
        ? [{ label: 'Done', variant: 'primary' as const, onPress: onDone }]
        : [];

    return (
        <Modal
            title={brand.name}
            onClose={onClose}
            size="M"
            actionButtons={actionButtons}
        >
            <Text UNSAFE_className="text-gray-600 mb-4 block">
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

            {/* Services Section - only shown if stack supports addons */}
            {availableAddons.length > 0 && (
                <>
                    <Divider size="S" marginTop="size-300" marginBottom="size-200" />
                    <Text UNSAFE_className="text-gray-600 text-sm mb-2 block">
                        Optional Services
                    </Text>
                    <div className="architecture-addons">
                        {availableAddons.map((addonId) => {
                            const addon = ADDON_METADATA[addonId];
                            if (!addon) return null;
                            const isRequired = brand.addons?.[addonId] === 'required';
                            const isChecked = isRequired || selectedAddons.includes(addonId);
                            return (
                                <Checkbox
                                    key={addonId}
                                    isSelected={isChecked}
                                    isDisabled={isRequired}
                                    onChange={(isSelected) => handleAddonToggle(addonId, isSelected)}
                                >
                                    <span className="addon-label">
                                        <span className="addon-name">{addon.name}</span>
                                        <span className="addon-description">{addon.description}</span>
                                    </span>
                                </Checkbox>
                            );
                        })}
                    </div>
                </>
            )}
        </Modal>
    );
};

export const BrandGallery: React.FC<BrandGalleryProps> = ({
    brands,
    stacks,
    selectedBrand,
    selectedStack,
    selectedAddons = [],
    onBrandSelect,
    onStackSelect,
    onAddonsChange,
    headerContent,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [modalBrandId, setModalBrandId] = useState<string | null>(null);
    // Track modal-local addon state (synced to parent on Done)
    const [modalAddons, setModalAddons] = useState<string[]>(selectedAddons);

    const filteredBrands = useMemo(
        () => filterBrandsBySearchQuery(brands, searchQuery),
        [brands, searchQuery]
    );

    // Get the brand object for the modal
    const modalBrand = useMemo(() => {
        if (!modalBrandId) return null;
        return brands.find(b => b.id === modalBrandId) || null;
    }, [brands, modalBrandId]);

    // Get the selected stack object
    const selectedStackObj = useMemo(() => {
        if (!selectedStack) return undefined;
        return stacks.find(s => s.id === selectedStack);
    }, [stacks, selectedStack]);

    // Helper to get required addon IDs from brand's addons config
    const getRequiredAddons = useCallback((brand: Brand): string[] => {
        if (!brand.addons) return [];
        return Object.entries(brand.addons)
            .filter(([_, mode]) => mode === 'required')
            .map(([id]) => id);
    }, []);

    const handleCardClick = useCallback((brand: Brand) => {
        // Always open modal when clicking a card (allows changing selection)
        onBrandSelect(brand.id);
        // Initialize modal addons with current state + brand's required addons
        const requiredAddons = getRequiredAddons(brand);
        const initialAddons = [...new Set([...selectedAddons, ...requiredAddons])];
        setModalAddons(initialAddons);
        setModalBrandId(brand.id);
    }, [onBrandSelect, selectedAddons, getRequiredAddons]);

    const handleStackSelect = useCallback((stackId: string) => {
        onStackSelect(stackId);
        // When stack changes, keep only required addons (clear optional selections)
        setModalAddons(() => {
            const currentBrand = brands.find(b => b.id === modalBrandId);
            return currentBrand ? getRequiredAddons(currentBrand) : [];
        });
    }, [onStackSelect, brands, modalBrandId, getRequiredAddons]);

    const handleModalAddonsChange = useCallback((addons: string[]) => {
        setModalAddons(addons);
    }, []);

    const handleModalDone = useCallback(() => {
        // Sync addons to parent state (including required addons) and close modal
        const currentBrand = brands.find(b => b.id === modalBrandId);
        const requiredAddons = currentBrand ? getRequiredAddons(currentBrand) : [];
        const finalAddons = [...new Set([...modalAddons, ...requiredAddons])];
        onAddonsChange?.(finalAddons);
        setModalBrandId(null);
    }, [modalAddons, onAddonsChange, brands, modalBrandId, getRequiredAddons]);

    const handleModalClose = useCallback(() => {
        setModalBrandId(null);
    }, []);

    if (brands.length === 0) {
        return (
            <SingleColumnLayout>
                <Text UNSAFE_className="text-gray-600">
                    No brands available
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
                searchPlaceholder="Filter brands..."
                searchThreshold={2}
                totalCount={brands.length}
                filteredCount={filteredBrands.length}
                itemNoun="brand"
                hasLoadedOnce={true}
            />

            <div className="expandable-brand-grid">
                {filteredBrands.map(brand => {
                    const isSelected = selectedBrand === brand.id;
                    const isDimmed = selectedBrand !== undefined && !isSelected;
                    return (
                        <BrandCard
                            key={brand.id}
                            brand={brand}
                            selectedStack={isSelected ? selectedStackObj : undefined}
                            isSelected={isSelected}
                            isDimmed={isDimmed}
                            onCardClick={() => handleCardClick(brand)}
                        />
                    );
                })}
            </div>

            {searchQuery && filteredBrands.length === 0 && (
                <Text UNSAFE_className="text-gray-500 py-4">
                    No brands match "{searchQuery}"
                </Text>
            )}

            {/* Architecture selection modal */}
            <DialogContainer onDismiss={handleModalClose}>
                {modalBrand && (
                    <ArchitectureModal
                        brand={modalBrand}
                        stacks={stacks}
                        selectedStackId={selectedBrand === modalBrand.id ? selectedStack : undefined}
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
