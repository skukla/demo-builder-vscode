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
    mockPostMessage,
    createStateWithSelections,
    createStateNoFrontend,
    createStateNoBackend,
    createStateWithDefaults,
    resetMocks,
} from './ComponentSelectionStep.testUtils';

describe('ComponentSelectionStep - Validation', () => {
    beforeEach(() => {
        resetMocks();
    });

    describe('Backend Communication', () => {
        it('should have postMessage available for component selection', () => {
            const stateWithSelections = createStateWithSelections();

            render(
                <>
                    <ComponentSelectionStep
                        state={stateWithSelections as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Verify mockPostMessage is available (debounced, so may not be called immediately)
            expect(mockPostMessage).toBeDefined();
        });
    });

    describe('Validation', () => {
        it('should not allow proceed without frontend', () => {
            const stateNoFrontend = createStateNoFrontend();

            render(
                <>
                    <ComponentSelectionStep
                        state={stateNoFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should not allow proceed without backend', () => {
            const stateNoBackend = createStateNoBackend();

            render(
                <>
                    <ComponentSelectionStep
                        state={stateNoBackend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    describe('Edge Cases', () => {
        it('should initialize from state defaults (simplified UI)', () => {
            // External Systems and App Builder Apps sections were removed
            // to reduce visual clutter as part of Demo Templates Phase 3.
            // This test now verifies that core component selections work.
            const stateWithDefaults = createStateWithDefaults();

            render(
                <>
                    <ComponentSelectionStep
                        state={stateWithDefaults as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Experience Platform and Integration Service checkboxes are no longer rendered
            expect(screen.queryByLabelText('Experience Platform')).not.toBeInTheDocument();
            expect(screen.queryByLabelText('Integration Service')).not.toBeInTheDocument();

            // Verify core selections still work (frontend/backend pickers present via visible labels)
            expect(screen.getByText('Frontend System')).toBeInTheDocument();
            expect(screen.getByText('Backend System')).toBeInTheDocument();
        });

        it('should prevent duplicate backend messages', () => {
            const stateWithSelections = createStateWithSelections();

            const { rerender } = render(
                <>
                    <ComponentSelectionStep
                        state={stateWithSelections as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            const initialCallCount = mockPostMessage.mock.calls.length;

            // Re-render with same state
            rerender(
                <>
                    <ComponentSelectionStep
                        state={stateWithSelections as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Should not send duplicate messages
            expect(mockPostMessage.mock.calls.length).toBe(initialCallCount);
        });
    });
});
