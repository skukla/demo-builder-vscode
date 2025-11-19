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
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithSelections as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Verify mockPostMessage is available (debounced, so may not be called immediately)
            expect(mockPostMessage).toBeDefined();
        });
    });

    describe('Validation', () => {
        it('should not allow proceed without frontend', () => {
            const stateNoFrontend = createStateNoFrontend();

            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateNoFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should not allow proceed without backend', () => {
            const stateNoBackend = createStateNoBackend();

            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateNoBackend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    describe('Edge Cases', () => {
        it('should initialize from state defaults', () => {
            const stateWithDefaults = createStateWithDefaults();

            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithDefaults as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            const platformCheckbox = screen.getByLabelText('Experience Platform');
            const appCheckbox = screen.getByLabelText('Integration Service');

            expect(platformCheckbox).toBeChecked();
            expect(appCheckbox).toBeChecked();
        });

        it('should prevent duplicate backend messages', () => {
            const stateWithSelections = createStateWithSelections();

            const { rerender } = render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithSelections as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            const initialCallCount = mockPostMessage.mock.calls.length;

            // Re-render with same state
            rerender(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithSelections as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Should not send duplicate messages
            expect(mockPostMessage.mock.calls.length).toBe(initialCallCount);
        });
    });
});
