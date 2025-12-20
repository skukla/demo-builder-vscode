/**
 * BrandSelector Component
 *
 * Compact brand selection cards for the Welcome step.
 */

import { Text } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
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
}

const BrandCard: React.FC<BrandCardProps> = ({ brand, isSelected, isFeatured, onSelect }) => {
    const handleClick = useCallback(() => {
        onSelect(brand.id);
    }, [brand.id, onSelect]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(brand.id);
            }
        },
        [brand.id, onSelect],
    );

    return (
        <div
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
    return (
        <div className="selector-grid">
            {brands.map((brand) => (
                <BrandCard
                    key={brand.id}
                    brand={brand}
                    isSelected={selectedBrand === brand.id}
                    isFeatured={brand.featured === true}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
};
