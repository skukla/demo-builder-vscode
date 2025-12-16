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
    createStateWithSelections,
    resetMocks,
} from './ComponentSelectionStep.testUtils';

describe('ComponentSelectionStep - Selection', () => {
    beforeEach(() => {
        resetMocks();
    });

    describe('Happy Path - Component Selection', () => {
        it('should render with available components (simplified UI)', () => {
            // External Systems and App Builder Apps sections were removed
            // to reduce visual clutter as part of Demo Templates Phase 3
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

            expect(screen.getByText('Frontend')).toBeInTheDocument();
            expect(screen.getByText('Backend')).toBeInTheDocument();
            // External Systems and App Builder Apps are no longer rendered
            expect(screen.queryByText('External Systems')).not.toBeInTheDocument();
            expect(screen.queryByText('App Builder Apps')).not.toBeInTheDocument();
        });

        it('should allow frontend selection', () => {
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

            const frontendPicker = screen.getByLabelText('Select frontend system');
            expect(frontendPicker).toBeInTheDocument();
        });

        it('should allow backend selection', () => {
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

            const backendPicker = screen.getByLabelText('Select backend system');
            expect(backendPicker).toBeInTheDocument();
        });

        it('should enable continue when frontend and backend selected', () => {
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

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should update state when selections change', () => {
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

            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    components: expect.objectContaining({
                        frontend: 'citisignal-nextjs',
                        backend: 'adobe-commerce-paas'
                    })
                })
            );
        });
    });
});
