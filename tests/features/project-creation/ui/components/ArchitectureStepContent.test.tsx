/**
 * ArchitectureStepContent Component Tests
 *
 * Tests for the extracted architecture step sub-component that renders
 * stack radio options, optional services, feature packs, and API mesh sections.
 * Uses grouped prop interfaces (stackSelection, addonSelection, featurePacks, mesh).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArchitectureStepContent } from '@/features/project-creation/ui/components/ArchitectureStepContent';
import type { Stack, OptionalAddon } from '@/types/stacks';
import type { FeaturePack } from '@/types/featurePacks';

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

const mockFeaturePack: FeaturePack = {
    id: 'b2b-commerce',
    name: 'B2B Commerce',
    description: 'B2B commerce features',
    source: { owner: 'adobe', repo: 'b2b', branch: 'main' },
    stackTypes: ['eds-storefront'],
};

const nativeFeaturePack: FeaturePack = {
    id: 'core-pack',
    name: 'Core Pack',
    description: 'Core features included',
    source: { owner: 'adobe', repo: 'core', branch: 'main' },
    stackTypes: ['eds-storefront'],
};

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
        featurePacks: {
            hasFeaturePacks: false,
            nativeFeaturePacks: [] as FeaturePack[],
            availableFeaturePacks: [] as FeaturePack[],
            selectedFeaturePacks: [] as string[],
            onFeaturePackToggle: noop,
        },
        mesh: {
            showMeshToggle: false,
            isMeshAutoIncluded: false,
            isMeshSelected: false,
            onMeshToggle: noop,
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

    // --- Feature Packs ---

    describe('feature packs section', () => {
        it('should render feature packs section when hasFeaturePacks is true', () => {
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    featurePacks={{
                        ...defaultProps.featurePacks,
                        hasFeaturePacks: true,
                        availableFeaturePacks: [mockFeaturePack],
                    }}
                />
            );

            expect(screen.getByText('Feature Packs')).toBeInTheDocument();
            expect(screen.getByText('B2B Commerce')).toBeInTheDocument();
        });

        it('should not render feature packs section when hasFeaturePacks is false', () => {
            render(<ArchitectureStepContent {...defaultProps} />);

            expect(screen.queryByText('Feature Packs')).not.toBeInTheDocument();
        });

        it('should render native feature packs as disabled checked checkboxes', () => {
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    featurePacks={{
                        ...defaultProps.featurePacks,
                        hasFeaturePacks: true,
                        nativeFeaturePacks: [nativeFeaturePack],
                    }}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /Core Pack/i });
            expect(checkbox).toBeChecked();
            expect(checkbox).toBeDisabled();
        });

        it('should call onFeaturePackToggle when a feature pack checkbox is toggled', () => {
            const onFeaturePackToggle = jest.fn();
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    featurePacks={{
                        ...defaultProps.featurePacks,
                        hasFeaturePacks: true,
                        availableFeaturePacks: [mockFeaturePack],
                        onFeaturePackToggle,
                    }}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /B2B Commerce/i });
            fireEvent.click(checkbox);
            expect(onFeaturePackToggle).toHaveBeenCalledWith('b2b-commerce', true);
        });
    });

    // --- API Mesh ---

    describe('API mesh section', () => {
        it('should render mesh toggle when showMeshToggle is true', () => {
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    mesh={{ ...defaultProps.mesh, showMeshToggle: true }}
                />
            );

            expect(screen.getByText('API Mesh')).toBeInTheDocument();
            expect(screen.getByText('Include API Mesh')).toBeInTheDocument();
        });

        it('should render mesh section when isMeshAutoIncluded is true', () => {
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    mesh={{ ...defaultProps.mesh, isMeshAutoIncluded: true }}
                />
            );

            expect(screen.getByText('API Mesh')).toBeInTheDocument();
        });

        it('should show mesh checkbox as disabled when auto-included', () => {
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    mesh={{ ...defaultProps.mesh, isMeshAutoIncluded: true }}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /Include API Mesh/i });
            expect(checkbox).toBeDisabled();
            expect(checkbox).toBeChecked();
        });

        it('should call onMeshToggle when mesh checkbox is toggled', () => {
            const onMeshToggle = jest.fn();
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    mesh={{ ...defaultProps.mesh, showMeshToggle: true, onMeshToggle }}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /Include API Mesh/i });
            fireEvent.click(checkbox);
            expect(onMeshToggle).toHaveBeenCalledWith(true);
        });

        it('should not render mesh section when neither showMeshToggle nor isMeshAutoIncluded', () => {
            render(<ArchitectureStepContent {...defaultProps} />);

            expect(screen.queryByText('API Mesh')).not.toBeInTheDocument();
        });

        it('should show mesh as selected when isMeshSelected is true', () => {
            render(
                <ArchitectureStepContent
                    {...defaultProps}
                    mesh={{ ...defaultProps.mesh, showMeshToggle: true, isMeshSelected: true }}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /Include API Mesh/i });
            expect(checkbox).toBeChecked();
        });
    });
});
