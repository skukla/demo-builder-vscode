/**
 * BrandSelector Component Tests
 *
 * Tests for brand selection cards in the Welcome step.
 * Follows TDD methodology - tests written before implementation.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrandSelector } from '@/features/project-creation/ui/components/BrandSelector';
import { Brand } from '@/types/brands';

// Mock brand data matching templates/brands.json structure
const mockBrands: Brand[] = [
    {
        id: 'default',
        name: 'Default',
        description: 'Generic storefront with default content',
        icon: 'default',
        configDefaults: {},
        contentSources: { eds: 'main--boilerplate--adobe-commerce.aem.live' },
    },
    {
        id: 'citisignal',
        name: 'CitiSignal',
        description: 'Telecommunications demo with CitiSignal branding',
        icon: 'citisignal',
        featured: true,
        configDefaults: {
            ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
            ADOBE_COMMERCE_STORE_CODE: 'citisignal_store',
            ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
        },
        contentSources: { eds: 'main--accs-citisignal--demo-system-stores.aem.live' },
    },
    {
        id: 'buildright',
        name: 'BuildRight',
        description: 'Construction/hardware demo with BuildRight branding',
        icon: 'buildright',
        configDefaults: {
            ADOBE_COMMERCE_WEBSITE_CODE: 'buildright',
            ADOBE_COMMERCE_STORE_CODE: 'buildright_store',
            ADOBE_COMMERCE_STORE_VIEW_CODE: 'buildright_us',
        },
        contentSources: { eds: 'main--accs-buildright--demo-system-stores.aem.live' },
    },
];

describe('BrandSelector', () => {
    const mockOnSelect = jest.fn();

    beforeEach(() => {
        mockOnSelect.mockClear();
    });

    describe('Rendering', () => {
        it('should render all brands', () => {
            render(
                <BrandSelector
                    brands={mockBrands}
                    selectedBrand={undefined}
                    onSelect={mockOnSelect}
                />
            );

            expect(screen.getByText('Default')).toBeInTheDocument();
            expect(screen.getByText('CitiSignal')).toBeInTheDocument();
            expect(screen.getByText('BuildRight')).toBeInTheDocument();
        });

        it('should render brand descriptions', () => {
            render(
                <BrandSelector
                    brands={mockBrands}
                    selectedBrand={undefined}
                    onSelect={mockOnSelect}
                />
            );

            expect(screen.getByText('Generic storefront with default content')).toBeInTheDocument();
            expect(screen.getByText('Telecommunications demo with CitiSignal branding')).toBeInTheDocument();
        });

        it('should render brand cards with data-testid', () => {
            render(
                <BrandSelector
                    brands={mockBrands}
                    selectedBrand={undefined}
                    onSelect={mockOnSelect}
                />
            );

            expect(screen.getAllByTestId('brand-card')).toHaveLength(3);
        });
    });

    describe('Selection State', () => {
        it('should show selected state for selected brand with aria-selected', () => {
            render(
                <BrandSelector
                    brands={mockBrands}
                    selectedBrand="citisignal"
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('brand-card');
            const citisignalCard = cards.find(card =>
                card.textContent?.includes('CitiSignal')
            );

            expect(citisignalCard).toHaveAttribute('aria-selected', 'true');
        });

        it('should not show selected state for unselected brands', () => {
            render(
                <BrandSelector
                    brands={mockBrands}
                    selectedBrand="citisignal"
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('brand-card');
            const defaultCard = cards.find(card =>
                card.textContent?.includes('Default')
            );

            expect(defaultCard).toHaveAttribute('aria-selected', 'false');
        });

        it('should show no selected state when selectedBrand is undefined', () => {
            render(
                <BrandSelector
                    brands={mockBrands}
                    selectedBrand={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('brand-card');
            cards.forEach(card => {
                expect(card).toHaveAttribute('aria-selected', 'false');
            });
        });
    });

    describe('Featured Brands', () => {
        it('should show featured badge for featured brands with data-featured', () => {
            render(
                <BrandSelector
                    brands={mockBrands}
                    selectedBrand={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('brand-card');
            const citisignalCard = cards.find(card =>
                card.textContent?.includes('CitiSignal')
            );
            const defaultCard = cards.find(card =>
                card.textContent?.includes('Default')
            );

            expect(citisignalCard).toHaveAttribute('data-featured', 'true');
            expect(defaultCard).toHaveAttribute('data-featured', 'false');
        });
    });

    describe('Interaction', () => {
        it('should call onSelect when brand is clicked', () => {
            render(
                <BrandSelector
                    brands={mockBrands}
                    selectedBrand={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('brand-card');
            const citisignalCard = cards.find(card =>
                card.textContent?.includes('CitiSignal')
            );

            fireEvent.click(citisignalCard!);

            expect(mockOnSelect).toHaveBeenCalledTimes(1);
            expect(mockOnSelect).toHaveBeenCalledWith('citisignal');
        });

        it('should call onSelect with correct brand id for each card', () => {
            render(
                <BrandSelector
                    brands={mockBrands}
                    selectedBrand={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('brand-card');
            const defaultCard = cards.find(card =>
                card.textContent?.includes('Default')
            );

            fireEvent.click(defaultCard!);

            expect(mockOnSelect).toHaveBeenCalledWith('default');
        });
    });

    describe('Keyboard Accessibility', () => {
        it('should be keyboard accessible with Enter key', () => {
            render(
                <BrandSelector
                    brands={mockBrands}
                    selectedBrand={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('brand-card');
            const citisignalCard = cards.find(card =>
                card.textContent?.includes('CitiSignal')
            );

            fireEvent.keyDown(citisignalCard!, { key: 'Enter' });

            expect(mockOnSelect).toHaveBeenCalledTimes(1);
            expect(mockOnSelect).toHaveBeenCalledWith('citisignal');
        });

        it('should be keyboard accessible with Space key', () => {
            render(
                <BrandSelector
                    brands={mockBrands}
                    selectedBrand={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('brand-card');
            const defaultCard = cards.find(card =>
                card.textContent?.includes('Default')
            );

            fireEvent.keyDown(defaultCard!, { key: ' ' });

            expect(mockOnSelect).toHaveBeenCalledWith('default');
        });

        it('should not trigger selection for other keys', () => {
            render(
                <BrandSelector
                    brands={mockBrands}
                    selectedBrand={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('brand-card');
            const citisignalCard = cards.find(card =>
                card.textContent?.includes('CitiSignal')
            );

            fireEvent.keyDown(citisignalCard!, { key: 'Escape' });
            fireEvent.keyDown(citisignalCard!, { key: 'Tab' });
            fireEvent.keyDown(citisignalCard!, { key: 'ArrowDown' });

            expect(mockOnSelect).not.toHaveBeenCalled();
        });

        it('should have proper role and tabIndex for accessibility', () => {
            render(
                <BrandSelector
                    brands={mockBrands}
                    selectedBrand={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('brand-card');
            cards.forEach(card => {
                expect(card).toHaveAttribute('role', 'button');
                expect(card).toHaveAttribute('tabIndex', '0');
            });
        });
    });

    describe('Empty State', () => {
        it('should handle empty brands array gracefully', () => {
            render(
                <BrandSelector
                    brands={[]}
                    selectedBrand={undefined}
                    onSelect={mockOnSelect}
                />
            );

            expect(screen.queryAllByTestId('brand-card')).toHaveLength(0);
        });
    });
});
