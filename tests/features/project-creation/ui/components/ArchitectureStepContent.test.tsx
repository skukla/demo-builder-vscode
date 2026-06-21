/**
 * ArchitectureStepContent Component Tests
 *
 * Tests for the extracted architecture step sub-component that renders
 * stack radio options and optional services. The API Mesh toggle moved to
 * AppBuilderComponentsStepContent (D2 Track B), so it is no longer tested here.
 * Uses grouped prop interfaces (stackSelection, addonSelection).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArchitectureStepContent } from '@/features/project-creation/ui/components/ArchitectureStepContent';
import type { Stack, OptionalAddon } from '@/types/stacks';

// Minimal stack fixtures
const stackA: Stack = {
    id: 'eds-paas',
    name: 'EDS + PaaS',
    description: 'Edge Delivery with PaaS backend',
    icon: 'eds',
    frontend: 'eds-storefront',
    backend: 'paas',
    dependencies: [],
    features: [],
};

const stackB: Stack = {
    id: 'venia-paas',
    name: 'Venia + PaaS',
    description: 'Venia storefront with PaaS backend',
    icon: 'venia',
    frontend: 'venia',
    backend: 'paas',
    dependencies: [],
    features: [],
};

const mockAddon: OptionalAddon = { id: 'live-search', default: false };

// Default no-op handlers
const noop = jest.fn();

describe('ArchitectureStepContent', () => {
    const defaultProps = {
        stackSelection: {
            filteredStacks: [stackA, stackB] as { id: string; name: string; description: string }[],
            selectedStackId: undefined as string | undefined,
            getItemProps: (index: number) => ({
                ref: { current: null } as React.RefObject<HTMLDivElement>,
                tabIndex: index === 0 ? 0 : -1,
                onKeyDown: noop,
            }),
            onStackClick: noop,
        },
        addonSelection: {
            availableAddons: [] as OptionalAddon[],
            displayAddons: [] as OptionalAddon[],
            selectedAddons: [] as string[],
            onAddonToggle: noop,
            addonMetadata: {} as Record<string, { name: string; description: string }>,
            requiredAddonIds: [] as string[],
        },
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    // --- Stack Radio Group ---

    describe('stack radio group', () => {
        it('should render all filtered stacks as radio options', () => {
            render(<ArchitectureStepContent {...defaultProps} />);

            expect(screen.getByText('EDS + PaaS')).toBeInTheDocument();
            expect(screen.getByText('Venia + PaaS')).toBeInTheDocument();
        });

        it('should render stack descriptions', () => {
            render(<ArchitectureStepContent {...defaultProps} />);

            expect(screen.getByText('Edge Delivery with PaaS backend')).toBeInTheDocument();
            expect(screen.getByText('Venia storefront with PaaS backend')).toBeInTheDocument();
        });

        it('should mark selected stack with aria-checked', () => {
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    stackSelection={{ ...defaultProps.stackSelection, selectedStackId: 'eds-paas' }}
                />
            );

            const radios = screen.getAllByRole('radio');
            expect(radios[0]).toHaveAttribute('aria-checked', 'true');
            expect(radios[1]).toHaveAttribute('aria-checked', 'false');
        });

        it('should call onStackClick when a stack option is clicked', () => {
            const onStackClick = jest.fn();
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    stackSelection={{ ...defaultProps.stackSelection, onStackClick }}
                />
            );

            fireEvent.click(screen.getByText('Venia + PaaS'));
            expect(onStackClick).toHaveBeenCalledWith('venia-paas');
        });

        it('should render header text "How should it be built?"', () => {
            render(<ArchitectureStepContent {...defaultProps} />);

            expect(screen.getByText('How should it be built?')).toBeInTheDocument();
        });

        it('should render radiogroup with accessible label', () => {
            render(<ArchitectureStepContent {...defaultProps} />);

            expect(screen.getByRole('radiogroup', { name: 'Architecture options' })).toBeInTheDocument();
        });

        it('should apply selected CSS class to the selected stack', () => {
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    stackSelection={{ ...defaultProps.stackSelection, selectedStackId: 'eds-paas' }}
                />
            );

            const radios = screen.getAllByRole('radio');
            expect(radios[0]).toHaveAttribute('data-selected', 'true');
            expect(radios[1]).toHaveAttribute('data-selected', 'false');
        });
    });

    // --- Optional Services (Addons) ---

    describe('optional services section', () => {
        const addonMetadata = {
            'live-search': { name: 'Live Search', description: 'Real-time search' },
        };

        it('should render addons when displayAddons is non-empty', () => {
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    addonSelection={{
                        ...defaultProps.addonSelection,
                        displayAddons: [mockAddon],
                        availableAddons: [mockAddon],
                        addonMetadata,
                    }}
                />
            );

            expect(screen.getByText('Live Search')).toBeInTheDocument();
            expect(screen.getByText('Real-time search')).toBeInTheDocument();
        });

        it('should render "Optional Services" heading when addons exist', () => {
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    addonSelection={{
                        ...defaultProps.addonSelection,
                        displayAddons: [mockAddon],
                        availableAddons: [mockAddon],
                        addonMetadata,
                    }}
                />
            );

            expect(screen.getByText('Optional Services')).toBeInTheDocument();
        });

        it('should call onAddonToggle when an addon checkbox is toggled', () => {
            const onAddonToggle = jest.fn();
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    addonSelection={{
                        ...defaultProps.addonSelection,
                        displayAddons: [mockAddon],
                        availableAddons: [mockAddon],
                        addonMetadata,
                        onAddonToggle,
                    }}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /Live Search/i });
            fireEvent.click(checkbox);
            expect(onAddonToggle).toHaveBeenCalledWith('live-search', true);
        });

        it('should show addon as checked when in selectedAddons', () => {
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    addonSelection={{
                        ...defaultProps.addonSelection,
                        displayAddons: [mockAddon],
                        availableAddons: [mockAddon],
                        selectedAddons: ['live-search'],
                        addonMetadata,
                    }}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /Live Search/i });
            expect(checkbox).toBeChecked();
        });

        it('should show addon as disabled and checked when required', () => {
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    addonSelection={{
                        ...defaultProps.addonSelection,
                        displayAddons: [mockAddon],
                        availableAddons: [mockAddon],
                        addonMetadata,
                        requiredAddonIds: ['live-search'],
                    }}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /Live Search/i });
            expect(checkbox).toBeChecked();
            expect(checkbox).toBeDisabled();
        });

        it('should not render addon with missing metadata', () => {
            const unknownAddon: OptionalAddon = { id: 'unknown-addon' };
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    addonSelection={{
                        ...defaultProps.addonSelection,
                        displayAddons: [unknownAddon],
                        availableAddons: [unknownAddon],
                        addonMetadata: {},
                    }}
                />
            );

            expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        });
    });
});
