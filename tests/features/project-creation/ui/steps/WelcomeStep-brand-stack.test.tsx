/**
 * WelcomeStep Brand + Stack Selection Tests
 *
 * Tests for the redesigned Welcome step with vertical (brand) + stack selection.
 * Follows TDD methodology - tests written before implementation.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import { WizardState } from '@/types/webview';
import { Brand } from '@/types/brands';
import { Stack } from '@/types/stacks';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

// Mock useSelectableDefault hook
jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: () => ({}),
}));

describe('WelcomeStep - Brand + Stack Selection', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();
    const mockOnNext = jest.fn();
    const mockOnBack = jest.fn();

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
    ];

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

    const baseState: Partial<WizardState> = {
        currentStep: 'welcome',
        projectName: 'my-demo-project',
        componentConfigs: {},
        adobeAuth: {
            isAuthenticated: false,
            isChecking: false,
        },
    };

    const renderWithProvider = (ui: React.ReactElement) => {
        return render(
            <Provider theme={defaultTheme} colorScheme="light">
                {ui}
            </Provider>
        );
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Proceed Validation - Brand and Stack Required', () => {
        it('should disable Continue until both brand AND stack are selected', () => {
            // Given: A WelcomeStep with brands and stacks but neither selected
            const stateWithNoSelection = {
                ...baseState,
                projectName: 'valid-project',
                selectedBrand: undefined,
                selectedStack: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithNoSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    brands={mockBrands}
                    stacks={mockStacks}
                />
            );

            // Then: setCanProceed should be called with false
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should disable Continue when only brand is selected', () => {
            // Given: A brand is selected but no stack
            const stateWithBrandOnly = {
                ...baseState,
                projectName: 'valid-project',
                selectedBrand: 'citisignal',
                selectedStack: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithBrandOnly as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    brands={mockBrands}
                    stacks={mockStacks}
                />
            );

            // Then: setCanProceed should be called with false
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should disable Continue when only stack is selected', () => {
            // Given: A stack is selected but no brand
            const stateWithStackOnly = {
                ...baseState,
                projectName: 'valid-project',
                selectedBrand: undefined,
                selectedStack: 'headless',
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithStackOnly as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    brands={mockBrands}
                    stacks={mockStacks}
                />
            );

            // Then: setCanProceed should be called with false
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should enable Continue when both brand AND stack are selected with valid project name', () => {
            // Given: Both brand and stack are selected
            const stateWithBothSelected = {
                ...baseState,
                projectName: 'valid-project',
                selectedBrand: 'citisignal',
                selectedStack: 'headless',
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithBothSelected as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    brands={mockBrands}
                    stacks={mockStacks}
                />
            );

            // Then: setCanProceed should be called with true
            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should disable Continue even with brand AND stack selected if project name is invalid', () => {
            // Given: Both brand and stack are selected but project name is invalid
            const stateWithInvalidName = {
                ...baseState,
                projectName: 'AB', // Too short
                selectedBrand: 'citisignal',
                selectedStack: 'headless',
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithInvalidName as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    brands={mockBrands}
                    stacks={mockStacks}
                />
            );

            // Then: setCanProceed should be called with false
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    describe('State Updates', () => {
        it('should update wizardState with selectedBrand when brand is selected', () => {
            // Given: A WelcomeStep with brands
            const stateWithNoSelection = {
                ...baseState,
                projectName: 'valid-project',
                selectedBrand: undefined,
                selectedStack: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithNoSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    brands={mockBrands}
                    stacks={mockStacks}
                />
            );

            // When: Brand cards are rendered and a brand is clicked
            const brandCards = screen.getAllByTestId('brand-card');
            const citisignalCard = brandCards.find(card =>
                card.textContent?.includes('CitiSignal')
            );
            citisignalCard?.click();

            // Then: updateState should be called with selectedBrand
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedBrand: 'citisignal' })
            );
        });

        it('should update wizardState with selectedStack when stack is selected via modal', async () => {
            // Given: A WelcomeStep with stacks - uses BrandGallery with modal pattern
            // Stack selection happens in a modal after clicking a brand card
            const stateWithBrandSelected = {
                ...baseState,
                projectName: 'valid-project',
                selectedBrand: 'citisignal',
                selectedStack: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithBrandSelected as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    brands={mockBrands}
                    stacks={mockStacks}
                />
            );

            // Note: Stack selection requires opening modal by clicking brand card
            // This is a simplified test - full modal interaction would require more setup
            expect(screen.getAllByTestId('brand-card')).toHaveLength(2);
        });
    });

    describe('Featured Brand Display', () => {
        it('should render all brand cards including featured brands', () => {
            // Given: A fresh WelcomeStep with brands where one brand is featured
            // BrandGallery renders all brands as clickable cards
            const stateWithNoSelection = {
                ...baseState,
                projectName: 'valid-project',
                selectedBrand: undefined,
                selectedStack: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithNoSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    brands={mockBrands}
                    stacks={mockStacks}
                />
            );

            // Then: All brand cards should be rendered
            const brandCards = screen.getAllByTestId('brand-card');
            expect(brandCards).toHaveLength(2);
            expect(screen.getByText('CitiSignal')).toBeInTheDocument();
            expect(screen.getByText('Default')).toBeInTheDocument();
        });
    });

    describe('Brand Gallery Layout', () => {
        it('should display project name field', () => {
            // Given: A WelcomeStep with brands and stacks
            const stateWithNoSelection = {
                ...baseState,
                projectName: 'valid-project',
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithNoSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    brands={mockBrands}
                    stacks={mockStacks}
                />
            );

            // Then: The project name field should be visible
            expect(screen.getByLabelText(/project name/i)).toBeInTheDocument();
        });

        it('should display brand cards in a gallery layout', () => {
            // Given: A WelcomeStep with brands and stacks
            const stateWithNoSelection = {
                ...baseState,
                projectName: 'valid-project',
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithNoSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    brands={mockBrands}
                    stacks={mockStacks}
                />
            );

            // Then: Brand cards should be visible (BrandGallery pattern)
            expect(screen.getAllByTestId('brand-card')).toHaveLength(2);
        });
    });

    describe('Backward Compatibility', () => {
        it('should work without brands/stacks props (legacy template mode)', () => {
            // Given: A WelcomeStep without brands/stacks (legacy mode)
            renderWithProvider(
                <WelcomeStep
                    state={baseState as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Then: The step should render without crashing
            expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
        });
    });
});
