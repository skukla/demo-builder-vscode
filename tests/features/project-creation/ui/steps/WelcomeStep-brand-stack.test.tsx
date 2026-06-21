/**
 * WelcomeStep Package + Stack Selection Tests
 *
 * Tests for the redesigned Welcome step with package (vertical) + stack selection.
 * Follows TDD methodology - tests written before implementation.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import { WizardState } from '@/types/webview';
import { DemoPackage } from '@/types/demoPackages';
import { Stack } from '@/types/stacks';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

// Mock useSelectableDefault hook
jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: () => ({}),
}));

describe('WelcomeStep - Package + Stack Selection', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();
    const mockOnNext = jest.fn();
    const mockOnBack = jest.fn();

    const mockPackages: DemoPackage[] = [
        {
            id: 'default',
            name: 'Default',
            description: 'Generic storefront with default content',
            icon: 'default',
            configDefaults: {},
            storefronts: {
                'headless': {
                    name: 'Default Headless',
                    description: 'Default NextJS storefront',
                    source: { type: 'git', url: 'https://github.com/test/default', branch: 'main', gitOptions: { shallow: true } },
                },
            },
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
            storefronts: {
                'headless': {
                    name: 'CitiSignal Headless',
                    description: 'CitiSignal NextJS storefront',
                    source: { type: 'git', url: 'https://github.com/test/citisignal', branch: 'main', gitOptions: { shallow: true } },
                },
            },
        },
    ];

    const mockStacks: Stack[] = [
        {
            id: 'headless',
            name: 'Headless',
            description: 'NextJS storefront with API Mesh and Commerce PaaS',
            icon: 'nextjs',
            frontend: 'headless',
            backend: 'adobe-commerce-paas',
            dependencies: ['commerce-mesh'],
            features: ['Server-side rendering', 'API Mesh integration', 'Full customization'],
        },
        {
            id: 'edge-delivery',
            name: 'Edge Delivery',
            description: 'EDS storefront with Commerce Drop-ins and ACCS',
            icon: 'eds',
            frontend: 'eds-storefront',
            backend: 'adobe-commerce-accs',
            dependencies: [],
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

    describe('Proceed Validation - Package Required (stack chosen on Project Builder step)', () => {
        it('should disable Continue until a package is selected', () => {
            // Given: A WelcomeStep with packages but none selected
            const stateWithNoSelection = {
                ...baseState,
                projectName: 'valid-project',
                selectedPackage: undefined,
                selectedStack: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithNoSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    packages={mockPackages}
                    stacks={mockStacks}
                />
            );

            // Then: setCanProceed should be called with false
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should enable Continue when a package is selected (stack NOT required here)', () => {
            // Given: A package is selected, no stack (stack is chosen on the next step)
            const stateWithPackageOnly = {
                ...baseState,
                projectName: 'valid-project',
                selectedPackage: 'citisignal',
                selectedStack: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithPackageOnly as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    packages={mockPackages}
                    stacks={mockStacks}
                />
            );

            // Then: setCanProceed should be called with true (package gate only)
            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should still disable Continue when no package is selected even if a stack is set', () => {
            // Given: A stack is set but no package
            const stateWithStackOnly = {
                ...baseState,
                projectName: 'valid-project',
                selectedPackage: undefined,
                selectedStack: 'headless',
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithStackOnly as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    packages={mockPackages}
                    stacks={mockStacks}
                />
            );

            // Then: setCanProceed should be called with false
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should disable Continue with a package selected if project name is invalid', () => {
            // Given: A package is selected but project name is invalid
            const stateWithInvalidName = {
                ...baseState,
                projectName: 'AB', // Too short
                selectedPackage: 'citisignal',
                selectedStack: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithInvalidName as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    packages={mockPackages}
                    stacks={mockStacks}
                />
            );

            // Then: setCanProceed should be called with false
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    describe('State Updates', () => {
        it('should update wizardState with selectedPackage when package is selected', () => {
            // Given: A WelcomeStep with packages
            const stateWithNoSelection = {
                ...baseState,
                projectName: 'valid-project',
                selectedPackage: undefined,
                selectedStack: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithNoSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    packages={mockPackages}
                    stacks={mockStacks}
                />
            );

            // When: Package cards are rendered and a package is clicked
            const packageCards = screen.getAllByTestId('package-card');
            const citisignalCard = packageCards.find(card =>
                card.textContent?.includes('CitiSignal')
            );
            citisignalCard?.click();

            // Then: updateState should be called with selectedPackage
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedPackage: 'citisignal' })
            );
        });

        it('should NOT open a modal when a package card is clicked (mark-and-Continue)', () => {
            // Given: A WelcomeStep — clicking a package selects it; no architecture modal
            const stateWithNoSelection = {
                ...baseState,
                projectName: 'valid-project',
                selectedPackage: undefined,
                selectedStack: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithNoSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    packages={mockPackages}
                    stacks={mockStacks}
                />
            );

            // When: A package card is clicked
            const packageCards = screen.getAllByTestId('package-card');
            packageCards[0].click();

            // Then: No dialog/modal is rendered (stack selection moved to next step)
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            // And: The package was selected
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedPackage: expect.any(String) })
            );
        });
    });

    describe('Featured Package Display', () => {
        it('should render all package cards including featured packages', () => {
            // Given: A fresh WelcomeStep with packages where one package is featured
            // BrandGallery renders all packages as clickable cards
            const stateWithNoSelection = {
                ...baseState,
                projectName: 'valid-project',
                selectedPackage: undefined,
                selectedStack: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithNoSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    packages={mockPackages}
                    stacks={mockStacks}
                />
            );

            // Then: All package cards should be rendered
            const packageCards = screen.getAllByTestId('package-card');
            expect(packageCards).toHaveLength(2);
            expect(screen.getByText('CitiSignal')).toBeInTheDocument();
            expect(screen.getByText('Default')).toBeInTheDocument();
        });
    });

    describe('Package Gallery Layout', () => {
        it('should display project name field', () => {
            // Given: A WelcomeStep with packages and stacks
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
                    packages={mockPackages}
                    stacks={mockStacks}
                />
            );

            // Then: The project name field should be visible
            expect(screen.getByLabelText(/project name/i)).toBeInTheDocument();
        });

        it('should display package cards in a gallery layout', () => {
            // Given: A WelcomeStep with packages and stacks
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
                    packages={mockPackages}
                    stacks={mockStacks}
                />
            );

            // Then: Package cards should be visible (BrandGallery pattern)
            expect(screen.getAllByTestId('package-card')).toHaveLength(2);
        });
    });

    describe('Backward Compatibility', () => {
        it('should work without packages/stacks props (legacy template mode)', () => {
            // Given: A WelcomeStep without packages/stacks (legacy mode)
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
