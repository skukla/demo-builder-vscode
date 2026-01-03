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
                <>
                    <ComponentSelectionStep
                        state={stateWithFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            const meshCheckbox = screen.getByLabelText('API Mesh');
            expect(meshCheckbox).toBeChecked();
            expect(meshCheckbox).toBeDisabled();
        });

        it('should auto-select required dependencies when frontend selected', () => {
            const stateInitial = createStateInitial();

            const { rerender } = render(
                <>
                    <ComponentSelectionStep
                        state={stateInitial as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Simulate frontend selection
            const stateWithFrontend = createStateWithFrontend();

            rerender(
                <>
                    <ComponentSelectionStep
                        state={stateWithFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            expect(mockUpdateState).toHaveBeenCalled();
        });

        it('should auto-select required services when backend selected', () => {
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
                <>
                    <ComponentSelectionStep
                        state={stateWithFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            const demoInspectorCheckbox = screen.getByLabelText('Demo Inspector');
            expect(demoInspectorCheckbox).not.toBeDisabled();
        });

        it('should NOT render external integrations (simplified UI)', () => {
            // External Systems section was removed to reduce visual clutter
            // as part of Demo Templates Phase 3
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

            const platformCheckbox = screen.queryByLabelText('Experience Platform');
            expect(platformCheckbox).not.toBeInTheDocument();
        });

        it('should NOT render app builder apps (simplified UI)', () => {
            // App Builder Apps section was removed to reduce visual clutter
            // as part of Demo Templates Phase 3
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

            const appCheckbox = screen.queryByLabelText('Integration Service');
            expect(appCheckbox).not.toBeInTheDocument();
        });
    });
});
