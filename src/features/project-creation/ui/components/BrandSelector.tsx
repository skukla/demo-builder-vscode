/**
 * BrandSelector Component
 *
 * Compact brand selection cards for the Welcome step.
 * Supports keyboard navigation with arrow keys.
 */

import { Text } from '@adobe/react-spectrum';
import React, { useCallback, useRef } from 'react';
import { Brand } from '@/types/brands';

export interface BrandSelectorProps {
    brands: Brand[];
    selectedBrand?: string;
    onSelect: (brandId: string) => void;
}

interface BrandCardProps {
    brand: Brand;
    isSelected: boolean;
    isFeatured: boolean;
    onSelect: (brandId: string) => void;
    onNavigate: (direction: 'prev' | 'next' | 'first' | 'last') => void;
    cardRef: React.RefObject<HTMLDivElement | null>;
}

const BrandCard: React.FC<BrandCardProps> = ({ brand, isSelected, isFeatured, onSelect, onNavigate, cardRef }) => {
    const handleClick = useCallback(() => {
        onSelect(brand.id);
    }, [brand.id, onSelect]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            switch (e.key) {
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    onSelect(brand.id);
                    break;
                case 'ArrowLeft':
                case 'ArrowUp':
                    e.preventDefault();
                    onNavigate('prev');
                    break;
                case 'ArrowRight':
                case 'ArrowDown':
                    e.preventDefault();
                    onNavigate('next');
                    break;
                case 'Home':
                    e.preventDefault();
                    onNavigate('first');
                    break;
                case 'End':
                    e.preventDefault();
                    onNavigate('last');
                    break;
            }
        },
        [brand.id, onSelect, onNavigate],
    );

    return (
        <div
            ref={cardRef}
            role="button"
            tabIndex={0}
            data-testid="brand-card"
            data-selected={isSelected ? 'true' : 'false'}
            data-featured={isFeatured ? 'true' : 'false'}
            aria-selected={isSelected ? 'true' : 'false'}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="selector-card"
            aria-pressed={isSelected}
            aria-label={`${brand.name}: ${brand.description}`}
        >
            <Text UNSAFE_className="selector-card-name">
                {brand.name}
            </Text>
            <Text UNSAFE_className="selector-card-description">
                {brand.description}
            </Text>
        </div>
    );
};

export const BrandSelector: React.FC<BrandSelectorProps> = ({
    brands,
    selectedBrand,
    onSelect,
}) => {
    // Create refs for each card to manage focus
    const cardRefs = useRef<Array<React.RefObject<HTMLDivElement | null>>>([]);

    // Ensure we have refs for all brands
    if (cardRefs.current.length !== brands.length) {
        cardRefs.current = brands.map(() => React.createRef<HTMLDivElement | null>());
    }

    // Handle keyboard navigation between cards
    const handleNavigate = useCallback((currentIndex: number, direction: 'prev' | 'next' | 'first' | 'last') => {
        let targetIndex: number;

        switch (direction) {
            case 'prev':
                targetIndex = currentIndex > 0 ? currentIndex - 1 : brands.length - 1;
                break;
            case 'next':
                targetIndex = currentIndex < brands.length - 1 ? currentIndex + 1 : 0;
                break;
            case 'first':
                targetIndex = 0;
                break;
            case 'last':
                targetIndex = brands.length - 1;
                break;
        }

        // Focus the target card
        cardRefs.current[targetIndex]?.current?.focus();
    }, [brands.length]);

    return (
        <div className="selector-grid" role="listbox" aria-label="Brand selection">
            {brands.map((brand, index) => (
                <BrandCard
                    key={brand.id}
                    brand={brand}
                    isSelected={selectedBrand === brand.id}
                    isFeatured={brand.featured === true}
                    onSelect={onSelect}
                    onNavigate={(direction) => handleNavigate(index, direction)}
                    cardRef={cardRefs.current[index]}
                />
            ))}
        </div>
    );
};
