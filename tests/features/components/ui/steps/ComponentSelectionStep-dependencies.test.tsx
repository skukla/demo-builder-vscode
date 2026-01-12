import { render, screen, act } from '@testing-library/react';
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
    createStateInitial,
    resetMocks,
} from './ComponentSelectionStep.testUtils';

// NOTE: Fake timers and RAF mocking are handled globally in tests/setup/react.ts
// Individual test files no longer need to set up timer mocking

describe('ComponentSelectionStep - Dependencies', () => {
    beforeEach(() => {
        resetMocks();
    });

    describe('Required Dependencies', () => {
        it('should NOT render mesh dependency as visible checkbox (handled dynamically via stack)', () => {
            // Mesh dependencies are now handled dynamically through the component registry
            // based on selected stack (eds-commerce-mesh or headless-commerce-mesh)
            // They are NOT rendered as visible locked checkboxes
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

            // Flush debounce timers
            act(() => {
                jest.runAllTimers();
            });

            // Mesh checkbox should NOT be visible - it's handled dynamically
            const meshCheckbox = screen.queryByRole('checkbox', { name: /mesh/i });
            expect(meshCheckbox).not.toBeInTheDocument();
        });

        it('should auto-select required dependencies when frontend selected', () => {
            const stateInitial = createStateInitial();

            const { rerender } = render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateInitial as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            act(() => {
                jest.runAllTimers();
            });

            // Simulate frontend selection
            const stateWithFrontend = createStateWithFrontend();

            rerender(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            act(() => {
                jest.runAllTimers();
            });

            expect(mockUpdateState).toHaveBeenCalled();
        });

        it('should auto-select required services when backend selected', () => {
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

            act(() => {
                jest.runAllTimers();
            });

            // Use getByRole with name regex - works better with nested label content
            const catalogCheckbox = screen.getByRole('checkbox', { name: /Catalog Service/i });
            const liveSearchCheckbox = screen.getByRole('checkbox', { name: /Live Search/i });

            expect(catalogCheckbox).toBeChecked();
            expect(catalogCheckbox).toBeDisabled();
            expect(liveSearchCheckbox).toBeChecked();
            expect(liveSearchCheckbox).toBeDisabled();
        });
    });

    describe('Optional Components', () => {
        it('should allow toggling optional dependencies', () => {
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

            act(() => {
                jest.runAllTimers();
            });

            const demoInspectorCheckbox = screen.getByRole('checkbox', { name: /Demo Inspector/i });
            expect(demoInspectorCheckbox).not.toBeDisabled();
        });

        it('should NOT render external integrations (simplified UI)', () => {
            // External Systems section was removed to reduce visual clutter
            // as part of Demo Templates Phase 3
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

            act(() => {
                jest.runAllTimers();
            });

            const platformCheckbox = screen.queryByLabelText('Experience Platform');
            expect(platformCheckbox).not.toBeInTheDocument();
        });

        it('should NOT render app builder apps (simplified UI)', () => {
            // App Builder Apps section was removed to reduce visual clutter
            // as part of Demo Templates Phase 3
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

            act(() => {
                jest.runAllTimers();
            });

            const appCheckbox = screen.queryByLabelText('Integration Service');
            expect(appCheckbox).not.toBeInTheDocument();
        });
    });
});
