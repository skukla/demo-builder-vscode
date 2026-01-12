import { render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ComponentSelectionStep } from '@/features/components/ui/steps/ComponentSelectionStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import {
    baseState,
    mockComponentsData,
    mockUpdateState,
    mockSetCanProceed,
    createStateWithFrontend,
    createStateWithBackend,
    resetMocks,
} from './ComponentSelectionStep.testUtils';

/**
 * Test suite for simplified ComponentSelectionStep
 *
 * Purpose: Verify that External Systems and App Builder sections have been removed,
 * while Frontend and Backend sections with their dependencies remain functional.
 *
 * This is part of Phase 3 of the Demo Templates feature to reduce visual clutter.
 */
describe('ComponentSelectionStep - Simplified (Sections Removed)', () => {
    beforeEach(() => {
        resetMocks();
    });

    describe('Core Sections Present', () => {
        it('should render Frontend section', () => {
            // Given: Component rendered with base state
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Then: Frontend section header should be present
            expect(screen.getByText('Frontend')).toBeInTheDocument();
        });

        it('should render Backend section', () => {
            // Given: Component rendered with base state
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Then: Backend section header should be present
            expect(screen.getByText('Backend')).toBeInTheDocument();
        });

        it('should render frontend picker', () => {
            // Given: Component rendered with base state
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Then: Frontend picker should be present
            expect(screen.getByLabelText('Select frontend system')).toBeInTheDocument();
        });

        it('should render backend picker', () => {
            // Given: Component rendered with base state
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Then: Backend picker should be present
            expect(screen.getByLabelText('Select backend system')).toBeInTheDocument();
        });
    });

    describe('Removed Sections', () => {
        it('should NOT render External Systems section', () => {
            // Given: Component rendered with base state
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Then: External Systems section should NOT be present
            expect(screen.queryByText('External Systems')).not.toBeInTheDocument();
        });

        it('should NOT render App Builder Apps section', () => {
            // Given: Component rendered with base state
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Then: App Builder Apps section should NOT be present
            expect(screen.queryByText('App Builder Apps')).not.toBeInTheDocument();
        });

        it('should NOT render Experience Platform checkbox', () => {
            // Given: Component rendered with base state
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Then: Experience Platform checkbox should NOT be present
            expect(screen.queryByLabelText('Experience Platform')).not.toBeInTheDocument();
        });

        it('should NOT render Integration Service checkbox', () => {
            // Given: Component rendered with base state
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Then: Integration Service checkbox should NOT be present
            expect(screen.queryByLabelText('Integration Service')).not.toBeInTheDocument();
        });
    });

    describe('Frontend Dependencies Still Present', () => {
        it('should NOT render API Mesh checkbox (handled dynamically via stack)', () => {
            // Given: Component rendered with frontend selected
            // Mesh dependencies are now handled dynamically through the component registry
            // based on selected stack - NOT rendered as visible checkboxes
            const stateWithFrontend = createStateWithFrontend();
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Then: API Mesh checkbox should NOT be present (handled dynamically)
            expect(screen.queryByRole('checkbox', { name: /mesh/i })).not.toBeInTheDocument();
        });

        it('should render Demo Inspector checkbox when frontend selected', () => {
            // Given: Component rendered with frontend selected
            const stateWithFrontend = createStateWithFrontend();
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Then: Demo Inspector checkbox should be present
            expect(screen.getByRole('checkbox', { name: /Demo Inspector/i })).toBeInTheDocument();
        });
    });

    describe('Backend Services Still Present', () => {
        it('should render Catalog Service checkbox when backend selected', () => {
            // Given: Component rendered with backend selected
            const stateWithBackend = createStateWithBackend();
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithBackend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Then: Catalog Service checkbox should be present
            expect(screen.getByRole('checkbox', { name: /Catalog Service/i })).toBeInTheDocument();
        });

        it('should render Live Search checkbox when backend selected', () => {
            // Given: Component rendered with backend selected
            const stateWithBackend = createStateWithBackend();
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithBackend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Then: Live Search checkbox should be present
            expect(screen.getByRole('checkbox', { name: /Live Search/i })).toBeInTheDocument();
        });
    });

    describe('Layout', () => {
        it('should NOT render Divider between sections', () => {
            // Given: Component rendered with base state
            const { container } = render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Then: Divider component should NOT be present
            // Spectrum Divider renders as a separator role or hr element
            const dividers = container.querySelectorAll('[class*="Divider"], hr, [role="separator"]');
            expect(dividers.length).toBe(0);
        });
    });
});
