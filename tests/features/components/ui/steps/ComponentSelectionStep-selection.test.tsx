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
                <>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            expect(screen.getByText('Frontend')).toBeInTheDocument();
            expect(screen.getByText('Backend')).toBeInTheDocument();
            // External Systems and App Builder Apps are no longer rendered
            expect(screen.queryByText('External Systems')).not.toBeInTheDocument();
            expect(screen.queryByText('App Builder Apps')).not.toBeInTheDocument();
        });

        it('should allow frontend selection', () => {
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

            const frontendPicker = screen.getByLabelText('Select frontend system');
            expect(frontendPicker).toBeInTheDocument();
        });

        it('should allow backend selection', () => {
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

            const backendPicker = screen.getByLabelText('Select backend system');
            expect(backendPicker).toBeInTheDocument();
        });

        it('should enable continue when frontend and backend selected', () => {
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

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should update state when selections change', () => {
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

            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    components: expect.objectContaining({
                        frontend: 'headless',
                        backend: 'adobe-commerce-paas'
                    })
                })
            );
        });
    });
});
