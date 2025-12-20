/**
 * StackSelector Component Tests
 *
 * Tests for stack selection cards in the Welcome step.
 * Follows TDD methodology - tests written before implementation.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StackSelector } from '@/features/project-creation/ui/components/StackSelector';
import { Stack } from '@/types/stacks';

// Mock stack data matching templates/stacks.json structure
const mockStacks: Stack[] = [
    {
        id: 'headless',
        name: 'Headless',
        description: 'NextJS storefront with API Mesh and Commerce PaaS',
        icon: 'nextjs',
        frontend: 'citisignal-nextjs',
        backend: 'adobe-commerce-paas',
        dependencies: ['commerce-mesh', 'demo-inspector'],
        features: ['Server-side rendering', 'API Mesh integration', 'Full customization'],
    },
    {
        id: 'edge-delivery',
        name: 'Edge Delivery',
        description: 'EDS storefront with Commerce Drop-ins and ACCS',
        icon: 'eds',
        frontend: 'eds-storefront',
        backend: 'adobe-commerce-accs',
        dependencies: ['demo-inspector'],
        features: ['Ultra-fast delivery', 'DA.live content', 'Commerce Drop-ins'],
        requiresGitHub: true,
        requiresDaLive: true,
    },
];

describe('StackSelector', () => {
    const mockOnSelect = jest.fn();

    beforeEach(() => {
        mockOnSelect.mockClear();
    });

    describe('Rendering', () => {
        it('should render all stacks', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            expect(screen.getByText('Headless')).toBeInTheDocument();
            expect(screen.getByText('Edge Delivery')).toBeInTheDocument();
        });

        it('should render stack descriptions', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            expect(screen.getByText('NextJS storefront with API Mesh and Commerce PaaS')).toBeInTheDocument();
            expect(screen.getByText('EDS storefront with Commerce Drop-ins and ACCS')).toBeInTheDocument();
        });

        it('should render stack cards with data-testid', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            expect(screen.getAllByTestId('stack-card')).toHaveLength(2);
        });
    });

    describe('Feature Bullets', () => {
        it('should show feature bullets for each stack', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            // Headless features
            expect(screen.getByText('Server-side rendering')).toBeInTheDocument();
            expect(screen.getByText('API Mesh integration')).toBeInTheDocument();
            expect(screen.getByText('Full customization')).toBeInTheDocument();

            // Edge Delivery features
            expect(screen.getByText('Ultra-fast delivery')).toBeInTheDocument();
            expect(screen.getByText('DA.live content')).toBeInTheDocument();
            expect(screen.getByText('Commerce Drop-ins')).toBeInTheDocument();
        });

        it('should render features as list items', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            // Each stack should have its features in a list
            const listItems = screen.getAllByRole('listitem');
            expect(listItems.length).toBeGreaterThanOrEqual(6);
        });
    });

    describe('Selection State', () => {
        it('should show selected state for selected stack with aria-selected', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack="headless"
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('stack-card');
            const headlessCard = cards.find(card =>
                card.textContent?.includes('Headless')
            );

            expect(headlessCard).toHaveAttribute('aria-selected', 'true');
        });

        it('should not show selected state for unselected stacks', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack="headless"
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('stack-card');
            const edgeDeliveryCard = cards.find(card =>
                card.textContent?.includes('Edge Delivery')
            );

            expect(edgeDeliveryCard).toHaveAttribute('aria-selected', 'false');
        });

        it('should show no selected state when selectedStack is undefined', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('stack-card');
            cards.forEach(card => {
                expect(card).toHaveAttribute('aria-selected', 'false');
            });
        });
    });

    describe('Requirements Indicator', () => {
        it('should indicate when stack requires additional setup with data-requires-setup', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('stack-card');
            const headlessCard = cards.find(card =>
                card.textContent?.includes('Headless')
            );
            const edgeDeliveryCard = cards.find(card =>
                card.textContent?.includes('Edge Delivery')
            );

            // Edge Delivery requires GitHub and DA.live
            expect(edgeDeliveryCard).toHaveAttribute('data-requires-setup', 'true');
            // Headless has no special requirements
            expect(headlessCard).toHaveAttribute('data-requires-setup', 'false');
        });
    });

    describe('Interaction', () => {
        it('should call onSelect when stack is clicked', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('stack-card');
            const headlessCard = cards.find(card =>
                card.textContent?.includes('Headless')
            );

            fireEvent.click(headlessCard!);

            expect(mockOnSelect).toHaveBeenCalledTimes(1);
            expect(mockOnSelect).toHaveBeenCalledWith('headless');
        });

        it('should call onSelect with correct stack id for each card', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('stack-card');
            const edgeDeliveryCard = cards.find(card =>
                card.textContent?.includes('Edge Delivery')
            );

            fireEvent.click(edgeDeliveryCard!);

            expect(mockOnSelect).toHaveBeenCalledWith('edge-delivery');
        });
    });

    describe('Keyboard Accessibility', () => {
        it('should be keyboard accessible with Enter key', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('stack-card');
            const headlessCard = cards.find(card =>
                card.textContent?.includes('Headless')
            );

            fireEvent.keyDown(headlessCard!, { key: 'Enter' });

            expect(mockOnSelect).toHaveBeenCalledTimes(1);
            expect(mockOnSelect).toHaveBeenCalledWith('headless');
        });

        it('should be keyboard accessible with Space key', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('stack-card');
            const edgeDeliveryCard = cards.find(card =>
                card.textContent?.includes('Edge Delivery')
            );

            fireEvent.keyDown(edgeDeliveryCard!, { key: ' ' });

            expect(mockOnSelect).toHaveBeenCalledWith('edge-delivery');
        });

        it('should not trigger selection for other keys', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('stack-card');
            const headlessCard = cards.find(card =>
                card.textContent?.includes('Headless')
            );

            fireEvent.keyDown(headlessCard!, { key: 'Escape' });
            fireEvent.keyDown(headlessCard!, { key: 'Tab' });
            fireEvent.keyDown(headlessCard!, { key: 'ArrowDown' });

            expect(mockOnSelect).not.toHaveBeenCalled();
        });

        it('should have proper role and tabIndex for accessibility', () => {
            render(
                <StackSelector
                    stacks={mockStacks}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            const cards = screen.getAllByTestId('stack-card');
            cards.forEach(card => {
                expect(card).toHaveAttribute('role', 'button');
                expect(card).toHaveAttribute('tabIndex', '0');
            });
        });
    });

    describe('Empty State', () => {
        it('should handle empty stacks array gracefully', () => {
            render(
                <StackSelector
                    stacks={[]}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            expect(screen.queryAllByTestId('stack-card')).toHaveLength(0);
        });
    });

    describe('Stack without features', () => {
        it('should handle stack with no features gracefully', () => {
            const stackWithoutFeatures: Stack[] = [
                {
                    id: 'minimal',
                    name: 'Minimal',
                    description: 'A minimal stack',
                    frontend: 'basic-frontend',
                    backend: 'basic-backend',
                    dependencies: [],
                },
            ];

            render(
                <StackSelector
                    stacks={stackWithoutFeatures}
                    selectedStack={undefined}
                    onSelect={mockOnSelect}
                />
            );

            expect(screen.getByText('Minimal')).toBeInTheDocument();
            expect(screen.getByText('A minimal stack')).toBeInTheDocument();
        });
    });
});
