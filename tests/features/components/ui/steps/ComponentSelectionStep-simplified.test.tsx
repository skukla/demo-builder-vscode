import { render, screen } from '@testing-library/react';
import React from 'react';
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
                <>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Then: Frontend section header should be present
            expect(screen.getByText('Frontend')).toBeInTheDocument();
        });

        it('should render Backend section', () => {
            // Given: Component rendered with base state
            render(
                <>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Then: Backend section header should be present
            expect(screen.getByText('Backend')).toBeInTheDocument();
        });

        it('should render frontend picker', () => {
            // Given: Component rendered with base state
            render(
                <>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Then: Frontend picker should be present
            expect(screen.getByLabelText('Select frontend system')).toBeInTheDocument();
        });

        it('should render backend picker', () => {
            // Given: Component rendered with base state
            render(
                <>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Then: Backend picker should be present
            expect(screen.getByLabelText('Select backend system')).toBeInTheDocument();
        });
    });

    describe('Removed Sections', () => {
        it('should NOT render External Systems section', () => {
            // Given: Component rendered with base state
            render(
                <>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Then: External Systems section should NOT be present
            expect(screen.queryByText('External Systems')).not.toBeInTheDocument();
        });

        it('should NOT render App Builder Apps section', () => {
            // Given: Component rendered with base state
            render(
                <>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Then: App Builder Apps section should NOT be present
            expect(screen.queryByText('App Builder Apps')).not.toBeInTheDocument();
        });

        it('should NOT render Experience Platform checkbox', () => {
            // Given: Component rendered with base state
            render(
                <>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Then: Experience Platform checkbox should NOT be present
            expect(screen.queryByLabelText('Experience Platform')).not.toBeInTheDocument();
        });

        it('should NOT render Integration Service checkbox', () => {
            // Given: Component rendered with base state
            render(
                <>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Then: Integration Service checkbox should NOT be present
            expect(screen.queryByLabelText('Integration Service')).not.toBeInTheDocument();
        });
    });

    describe('Frontend Dependencies Still Present', () => {
        it('should render API Mesh checkbox when frontend selected', () => {
            // Given: Component rendered with frontend selected
            const stateWithFrontend = createStateWithFrontend();
            render(
                <>
                    <ComponentSelectionStep
                        state={stateWithFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Then: API Mesh checkbox should be present
            expect(screen.getByLabelText('API Mesh')).toBeInTheDocument();
        });

        it('should render Demo Inspector checkbox when frontend selected', () => {
            // Given: Component rendered with frontend selected
            const stateWithFrontend = createStateWithFrontend();
            render(
                <>
                    <ComponentSelectionStep
                        state={stateWithFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Then: Demo Inspector checkbox should be present
            expect(screen.getByLabelText('Demo Inspector')).toBeInTheDocument();
        });
    });

    describe('Backend Services Still Present', () => {
        it('should render Catalog Service checkbox when backend selected', () => {
            // Given: Component rendered with backend selected
            const stateWithBackend = createStateWithBackend();
            render(
                <>
                    <ComponentSelectionStep
                        state={stateWithBackend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Then: Catalog Service checkbox should be present
            expect(screen.getByLabelText('Catalog Service')).toBeInTheDocument();
        });

        it('should render Live Search checkbox when backend selected', () => {
            // Given: Component rendered with backend selected
            const stateWithBackend = createStateWithBackend();
            render(
                <>
                    <ComponentSelectionStep
                        state={stateWithBackend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Then: Live Search checkbox should be present
            expect(screen.getByLabelText('Live Search')).toBeInTheDocument();
        });
    });

    describe('Layout', () => {
        it('should NOT render Divider between sections', () => {
            // Given: Component rendered with base state
            const { container } = render(
                <>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Then: Divider component should NOT be present
            // Spectrum Divider renders as a separator role or hr element
            const dividers = container.querySelectorAll('[class*="Divider"], hr, [role="separator"]');
            expect(dividers.length).toBe(0);
        });
    });
});
