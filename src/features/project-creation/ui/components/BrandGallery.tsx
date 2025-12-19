/**
 * BrandGallery Component
 *
 * Hybrid approach: Modal for architecture selection + expanded card for confirmation.
 * 1. Click brand → Modal opens with architecture options (room for descriptions)
 * 2. Select architecture → Modal closes
 * 3. Card expands to show the confirmed selection (at-a-glance confirmation)
 */

import { Text, DialogContainer } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState, useMemo, useCallback } from 'react';
import { Brand } from '@/types/brands';
import { Stack } from '@/types/stacks';
import { cn } from '@/core/ui/utils/classNames';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { Modal } from '@/core/ui/components/ui/Modal';

export interface BrandGalleryProps {
    brands: Brand[];
    stacks: Stack[];
    selectedBrand?: string;
    selectedStack?: string;
    onBrandSelect: (brandId: string) => void;
    onStackSelect: (stackId: string) => void;
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
 * ArchitectureModal - modal for selecting architecture/stack
 */
interface ArchitectureModalProps {
    brand: Brand;
    stacks: Stack[];
    selectedStackId?: string;
    onSelect: (stackId: string) => void;
    onClose: () => void;
}

const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
    brand,
    stacks,
    selectedStackId,
    onSelect,
    onClose,
}) => {
    const handleStackClick = useCallback(
        (stackId: string) => {
            onSelect(stackId);
        },
        [onSelect],
    );

    const handleStackKeyDown = useCallback(
        (e: React.KeyboardEvent, stackId: string) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(stackId);
            }
        },
        [onSelect],
    );

    return (
        <Modal
            title={brand.name}
            onClose={onClose}
            size="M"
        >
            <Text UNSAFE_className="text-gray-600 mb-4 block">
                How should it be built?
            </Text>
            <div className="architecture-modal-options">
                {stacks.map((stack) => {
                    const isSelected = selectedStackId === stack.id;
                    return (
                        <div
                            key={stack.id}
                            role="radio"
                            tabIndex={0}
                            aria-checked={isSelected}
                            data-selected={isSelected ? 'true' : 'false'}
                            className={cn(
                                'architecture-modal-option',
                                isSelected && 'selected',
                            )}
                            onClick={() => handleStackClick(stack.id)}
                            onKeyDown={(e) => handleStackKeyDown(e, stack.id)}
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
        </Modal>
    );
};

export const BrandGallery: React.FC<BrandGalleryProps> = ({
    brands,
    stacks,
    selectedBrand,
    selectedStack,
    onBrandSelect,
    onStackSelect,
    headerContent,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [modalBrandId, setModalBrandId] = useState<string | null>(null);

    const filteredBrands = useMemo(() => {
        if (!searchQuery.trim()) return brands;
        const query = searchQuery.toLowerCase();
        return brands.filter(b =>
            b.name.toLowerCase().includes(query) ||
            b.description.toLowerCase().includes(query)
        );
    }, [brands, searchQuery]);

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

    const handleCardClick = useCallback((brand: Brand) => {
        // Always open modal when clicking a card (allows changing selection)
        onBrandSelect(brand.id);
        setModalBrandId(brand.id);
    }, [onBrandSelect]);

    const handleStackSelect = useCallback((stackId: string) => {
        onStackSelect(stackId);
        setModalBrandId(null); // Close modal after selection
    }, [onStackSelect]);

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
                searchThreshold={5}
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
                        onSelect={handleStackSelect}
                        onClose={handleModalClose}
                    />
                )}
            </DialogContainer>
        </SingleColumnLayout>
    );
};
