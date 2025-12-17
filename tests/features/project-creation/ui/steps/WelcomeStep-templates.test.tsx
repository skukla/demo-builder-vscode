/**
 * WelcomeStep Template Selection Tests
 *
 * Tests for the template card grid functionality added in Demo Templates Phase 3.
 * Covers template rendering, selection, deselection, and proceed validation.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import { WizardState } from '@/types/webview';
import { DemoTemplate } from '@/types/templates';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

// Mock useSelectableDefault hook
jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: () => ({}),
}));

describe('WelcomeStep - Template Selection', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();
    const mockOnNext = jest.fn();
    const mockOnBack = jest.fn();

    const baseState: Partial<WizardState> = {
        currentStep: 'welcome',
        projectName: 'my-demo-project',
        projectTemplate: 'citisignal',
        componentConfigs: {},
        adobeAuth: {
            isAuthenticated: false,
            isChecking: false,
        },
    };

    const mockTemplates: DemoTemplate[] = [
        {
            id: 'citisignal',
            name: 'CitiSignal Storefront',
            description: 'Next.js headless storefront with Adobe Commerce API Mesh integration',
            icon: 'nextjs',
            featured: true,
            tags: ['headless', 'nextjs', 'storefront'],
            defaults: {
                frontend: 'citisignal-nextjs',
                backend: 'adobe-commerce-paas',
                dependencies: ['commerce-mesh', 'demo-inspector'],
            },
        },
        {
            id: 'blank',
            name: 'Blank Project',
            description: 'Start with an empty project and manually select components',
            icon: 'blank',
            featured: false,
            tags: ['custom'],
            defaults: {},
        },
    ];

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

    describe('Template Card Rendering', () => {
        it('should render template cards when templates are provided', () => {
            // Given: A WelcomeStep with templates
            renderWithProvider(
                <WelcomeStep
                    state={baseState as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    templates={mockTemplates}
                />
            );

            // Then: Template cards should be rendered
            expect(screen.getByText('CitiSignal Storefront')).toBeInTheDocument();
            expect(screen.getByText('Blank Project')).toBeInTheDocument();
        });

        it('should display template descriptions', () => {
            // Given: A WelcomeStep with templates that have descriptions
            renderWithProvider(
                <WelcomeStep
                    state={baseState as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    templates={mockTemplates}
                />
            );

            // Then: Template descriptions should be displayed
            expect(screen.getByText('Next.js headless storefront with Adobe Commerce API Mesh integration')).toBeInTheDocument();
            expect(screen.getByText('Start with an empty project and manually select components')).toBeInTheDocument();
        });

        it('should show fallback message when no templates available', () => {
            // Given: A WelcomeStep with empty templates array
            renderWithProvider(
                <WelcomeStep
                    state={baseState as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    templates={[]}
                />
            );

            // Then: A fallback message should be shown
            expect(screen.getByText(/no templates available/i)).toBeInTheDocument();
        });
    });

    describe('Template Selection', () => {
        it('should highlight selected template card with data-selected attribute', () => {
            // Given: A WelcomeStep with templates and a selected template
            const stateWithSelection = {
                ...baseState,
                selectedTemplate: 'citisignal',
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    templates={mockTemplates}
                />
            );

            // Then: The selected template card should have data-selected="true"
            const selectedCard = screen.getByText('CitiSignal Storefront').closest('[data-selected]');
            expect(selectedCard).toHaveAttribute('data-selected', 'true');

            // And: The unselected template card should have data-selected="false"
            const unselectedCard = screen.getByText('Blank Project').closest('[data-selected]');
            expect(unselectedCard).toHaveAttribute('data-selected', 'false');
        });

        it('should call updateState with selectedTemplate when card is clicked', () => {
            // Given: A WelcomeStep with templates and no selection
            const stateWithNoSelection = {
                ...baseState,
                selectedTemplate: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithNoSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    templates={mockTemplates}
                />
            );

            // When: Clicking on a template card
            const citisignalCard = screen.getByText('CitiSignal Storefront').closest('[role="button"]');
            fireEvent.click(citisignalCard!);

            // Then: updateState should be called with the template id
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedTemplate: 'citisignal' })
            );
        });

        it('should allow template deselection by clicking the same card', () => {
            // Given: A WelcomeStep with a selected template
            const stateWithSelection = {
                ...baseState,
                selectedTemplate: 'citisignal',
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    templates={mockTemplates}
                />
            );

            // When: Clicking on the already selected template card
            const citisignalCard = screen.getByText('CitiSignal Storefront').closest('[role="button"]');
            fireEvent.click(citisignalCard!);

            // Then: updateState should be called with undefined to deselect
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedTemplate: undefined })
            );
        });
    });

    describe('Proceed Validation with Templates', () => {
        it('should NOT allow proceeding with valid project name but NO template selected', () => {
            // Given: A valid project name but no template selected
            const stateWithValidNameNoTemplate = {
                ...baseState,
                projectName: 'valid-project',
                selectedTemplate: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithValidNameNoTemplate as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    templates={mockTemplates}
                />
            );

            // Then: setCanProceed should be called with false
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should allow proceeding with valid project name AND template selected', () => {
            // Given: A valid project name and a template selected
            const stateWithValidNameAndTemplate = {
                ...baseState,
                projectName: 'valid-project',
                selectedTemplate: 'citisignal',
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithValidNameAndTemplate as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    templates={mockTemplates}
                />
            );

            // Then: setCanProceed should be called with true
            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should NOT allow proceeding with template selected but INVALID project name', () => {
            // Given: An invalid project name but a template selected
            const stateWithInvalidNameAndTemplate = {
                ...baseState,
                projectName: 'AB', // Too short (< 3 chars)
                selectedTemplate: 'citisignal',
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithInvalidNameAndTemplate as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    templates={mockTemplates}
                />
            );

            // Then: setCanProceed should be called with false
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should NOT allow proceeding with template selected but project name with invalid characters', () => {
            // Given: A project name with uppercase letters and a template selected
            const stateWithInvalidCharsAndTemplate = {
                ...baseState,
                projectName: 'MyProject', // Has uppercase
                selectedTemplate: 'citisignal',
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithInvalidCharsAndTemplate as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    templates={mockTemplates}
                />
            );

            // Then: setCanProceed should be called with false
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    describe('Backward Compatibility', () => {
        it('should still work when no templates prop is provided', () => {
            // Given: A WelcomeStep without templates prop (backward compatibility)
            renderWithProvider(
                <WelcomeStep
                    state={baseState as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Then: The step should render without crashing (showing project name input)
            expect(screen.getByLabelText(/name/i)).toBeInTheDocument();

            // And: Should allow proceeding if project name is valid (no template requirement)
            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });
    });

    describe('Keyboard Accessibility', () => {
        it('should select template when Enter key is pressed on card', () => {
            // Given: A WelcomeStep with templates
            const stateWithNoSelection = {
                ...baseState,
                selectedTemplate: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithNoSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    templates={mockTemplates}
                />
            );

            // When: Pressing Enter on a template card
            const citisignalCard = screen.getByText('CitiSignal Storefront').closest('[role="button"]');
            fireEvent.keyDown(citisignalCard!, { key: 'Enter' });

            // Then: updateState should be called with the template id
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedTemplate: 'citisignal' })
            );
        });

        it('should select template when Space key is pressed on card', () => {
            // Given: A WelcomeStep with templates
            const stateWithNoSelection = {
                ...baseState,
                selectedTemplate: undefined,
            };

            renderWithProvider(
                <WelcomeStep
                    state={stateWithNoSelection as WizardState}
                    updateState={mockUpdateState}
                    onNext={mockOnNext}
                    onBack={mockOnBack}
                    setCanProceed={mockSetCanProceed}
                    templates={mockTemplates}
                />
            );

            // When: Pressing Space on a template card
            const citisignalCard = screen.getByText('CitiSignal Storefront').closest('[role="button"]');
            fireEvent.keyDown(citisignalCard!, { key: ' ' });

            // Then: updateState should be called with the template id
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedTemplate: 'citisignal' })
            );
        });
    });
});
