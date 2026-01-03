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
    resetMocks,
} from './ComponentSelectionStep.testUtils';

// Mock the useFocusOnMount hook to verify it's being called correctly
const mockUseFocusOnMount = jest.fn();
jest.mock('@/core/ui/hooks', () => ({
    ...jest.requireActual('@/core/ui/hooks'),
    useFocusOnMount: (...args: unknown[]) => mockUseFocusOnMount(...args),
}));

describe('ComponentSelectionStep - Display', () => {
    beforeEach(() => {
        resetMocks();
        mockUseFocusOnMount.mockClear();
    });

    describe('Focus Management', () => {
        it('should use useFocusOnMount hook with correct options', () => {
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

            // Verify useFocusOnMount was called
            expect(mockUseFocusOnMount).toHaveBeenCalledTimes(1);

            // Verify it was called with a ref and the button selector option
            const [refArg, optionsArg] = mockUseFocusOnMount.mock.calls[0];
            expect(refArg).toHaveProperty('current');
            expect(optionsArg).toEqual({ selector: 'button' });
        });

        it('should render frontend picker for focus management', () => {
            // Verify the component renders correctly with the picker that receives focus
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

            // Verify the frontend picker label exists (visible label for the Select)
            expect(screen.getByText('Frontend System')).toBeInTheDocument();
        });
    });

    describe('Basic Rendering', () => {
        it('should render frontend and backend pickers', () => {
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

            // React Aria Select uses visible labels, verify they are rendered
            expect(screen.getByText('Frontend System')).toBeInTheDocument();
            expect(screen.getByText('Backend System')).toBeInTheDocument();
        });

        it('should NOT render external systems section (simplified UI)', () => {
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

            expect(screen.queryByText('External Systems')).not.toBeInTheDocument();
            expect(screen.queryByText('App Builder Apps')).not.toBeInTheDocument();
        });
    });
});
