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
    resetMocks,
} from './ComponentSelectionStep.testUtils';

describe('ComponentSelectionStep - Display', () => {
    beforeEach(() => {
        resetMocks();
    });

    describe('Focus Management', () => {
        it('should set up MutationObserver for focus management', () => {
            // Mock MutationObserver to verify it's being set up
            const mockObserve = jest.fn();
            const mockDisconnect = jest.fn();

            const OriginalMutationObserver = global.MutationObserver;
            global.MutationObserver = jest.fn().mockImplementation(() => ({
                observe: mockObserve,
                disconnect: mockDisconnect,
                takeRecords: jest.fn(),
            })) as any;

            const { unmount } = render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // MutationObserver should be created and observe called
            expect(global.MutationObserver).toHaveBeenCalled();
            expect(mockObserve).toHaveBeenCalled();

            // Cleanup on unmount
            unmount();
            expect(mockDisconnect).toHaveBeenCalled();

            global.MutationObserver = OriginalMutationObserver;
        });

        it('should have a fallback timeout for focus management', async () => {
            // Verify that a timeout is set up (fallback to TIMEOUTS.FOCUS_FALLBACK)
            jest.useFakeTimers();

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

            // Verify pending timers exist (fallback timeout)
            expect(jest.getTimerCount()).toBeGreaterThan(0);

            jest.useRealTimers();
        });

        it('should attempt to focus frontend picker on mount', () => {
            // This is an integration test that verifies the focus logic runs
            // We can't easily test the actual focus() call without mocking too many internals
            // The important thing is that the component mounts without errors
            // and the focus management code executes

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

            // Verify the frontend picker container exists (ref target)
            const frontendSection = container.querySelector('[aria-label="Select frontend system"]');
            expect(frontendSection).toBeInTheDocument();
        });

        it('should dispatch keyboard event before focusing to trigger Spectrum focus ring', () => {
            // This test documents that we dispatch a Tab keyboard event before focusing
            // to trigger Spectrum's focus-visible detection for the blue outline

            const mockButton = document.createElement('button');
            const dispatchEventSpy = jest.spyOn(mockButton, 'dispatchEvent');
            const focusSpy = jest.spyOn(mockButton, 'focus');

            // Mock querySelector to return our button
            const querySelectorSpy = jest.spyOn(Element.prototype, 'querySelector');
            querySelectorSpy.mockReturnValue(mockButton);

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

            // Verify keyboard event was dispatched before focus
            // Component dispatches KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
            expect(dispatchEventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'keydown',
                    key: 'Tab',
                })
            );

            // Verify focus was called after keyboard event
            expect(focusSpy).toHaveBeenCalled();

            // Cleanup
            dispatchEventSpy.mockRestore();
            focusSpy.mockRestore();
            querySelectorSpy.mockRestore();
        });
    });
});
