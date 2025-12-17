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
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
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

            // Verify the frontend picker container exists (ref target for focus)
            const frontendSection = container.querySelector('[aria-label="Select frontend system"]');
            expect(frontendSection).toBeInTheDocument();
        });
    });

    describe('Basic Rendering', () => {
        it('should render frontend and backend pickers', () => {
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

            expect(screen.getByLabelText('Select frontend system')).toBeInTheDocument();
            expect(screen.getByLabelText('Select backend system')).toBeInTheDocument();
        });

        it('should NOT render external systems section (simplified UI)', () => {
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

            expect(screen.queryByText('External Systems')).not.toBeInTheDocument();
            expect(screen.queryByText('App Builder Apps')).not.toBeInTheDocument();
        });
    });
});
