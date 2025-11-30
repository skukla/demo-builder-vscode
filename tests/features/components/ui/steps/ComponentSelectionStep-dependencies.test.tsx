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
    createStateInitial,
    resetMocks,
} from './ComponentSelectionStep.testUtils';

describe('ComponentSelectionStep - Dependencies', () => {
    beforeEach(() => {
        resetMocks();
    });

    describe('Required Dependencies', () => {
        it('should mark required dependencies as checked and disabled', () => {
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

            const meshCheckbox = screen.getByLabelText('API Mesh');
            expect(meshCheckbox).toBeChecked();
            expect(meshCheckbox).toBeDisabled();
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

            const catalogCheckbox = screen.getByLabelText('Catalog Service');
            const liveSearchCheckbox = screen.getByLabelText('Live Search');

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

            const demoInspectorCheckbox = screen.getByLabelText('Demo Inspector');
            expect(demoInspectorCheckbox).not.toBeDisabled();
        });

        it('should allow selecting external integrations', () => {
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

            const platformCheckbox = screen.getByLabelText('Experience Platform');
            expect(platformCheckbox).toBeInTheDocument();
            expect(platformCheckbox).not.toBeChecked();
        });

        it('should allow selecting app builder apps', () => {
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

            const appCheckbox = screen.getByLabelText('Integration Service');
            expect(appCheckbox).toBeInTheDocument();
            expect(appCheckbox).not.toBeChecked();
        });
    });
});
