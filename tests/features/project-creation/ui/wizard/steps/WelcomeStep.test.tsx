import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import { WizardState } from '@/types/webview';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

// Mock useSelectableDefault hook
jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: () => ({}),
}));

describe('WelcomeStep', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();
    const mockOnNext = jest.fn();
    const mockOnBack = jest.fn();

    const baseState: Partial<WizardState> = {
        currentStep: 'welcome',
        projectName: '',
        projectTemplate: 'citisignal',
        componentConfigs: {},
        adobeAuth: {
            isAuthenticated: false,
            isChecking: false,
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Happy Path - Initial Render', () => {
        it('should render welcome heading and description', () => {
            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText('Welcome to Adobe Demo Builder')).toBeInTheDocument();
            expect(screen.getByText(/Let's create a new demo project/)).toBeInTheDocument();
        });

        it('should render project name input field', () => {
            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
            expect(screen.getByText(/Lowercase letters, numbers, and hyphens only/)).toBeInTheDocument();
        });

        it('should set default project name on mount', () => {
            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // updateState should be called with default project name
            expect(mockUpdateState).toHaveBeenCalledWith({ projectName: 'my-commerce-demo' });
        });
    });

    describe('Happy Path - Input Validation', () => {
        it('should allow valid project name', () => {
            const validState = { ...baseState, projectName: 'my-demo-project' };

            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={validState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            const input = screen.getByLabelText(/name/i) as HTMLInputElement;
            expect(input.value).toBe('my-demo-project');

            // setCanProceed should be called with true for valid name
            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should update state when project name changes', () => {
            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            const input = screen.getByLabelText(/name/i);
            fireEvent.change(input, { target: { value: 'new-project' } });

            expect(mockUpdateState).toHaveBeenCalledWith({ projectName: 'new-project' });
        });

        it('should enable Continue button when name is valid', () => {
            const validState = { ...baseState, projectName: 'valid-project-123' };

            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={validState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // setCanProceed should be true for valid name (3+ chars, valid format)
            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });
    });

    describe('Edge Cases - Validation Rules', () => {
        it('should reject project name with uppercase letters', () => {
            const invalidState = { ...baseState, projectName: 'MyProject' };

            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={invalidState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Should show validation error
            expect(screen.getByText(/Use lowercase letters, numbers, and hyphens only/)).toBeInTheDocument();

            // setCanProceed should be false
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should reject project name with special characters', () => {
            const invalidState = { ...baseState, projectName: 'my_project' };

            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={invalidState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText(/Use lowercase letters, numbers, and hyphens only/)).toBeInTheDocument();
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should reject project name with spaces', () => {
            const invalidState = { ...baseState, projectName: 'my project' };

            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={invalidState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText(/Use lowercase letters, numbers, and hyphens only/)).toBeInTheDocument();
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should reject project name shorter than 3 characters', () => {
            const invalidState = { ...baseState, projectName: 'ab' };

            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={invalidState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText(/Name must be at least 3 characters/)).toBeInTheDocument();
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should reject project name longer than 30 characters', () => {
            const invalidState = { ...baseState, projectName: 'this-is-a-very-long-project-name-that-exceeds-thirty' };

            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={invalidState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText(/Name must be less than 30 characters/)).toBeInTheDocument();
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should reject empty project name', () => {
            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Empty name should show required error
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    describe('Edge Cases - Boundary Values', () => {
        it('should accept project name with exactly 3 characters', () => {
            const validState = { ...baseState, projectName: 'abc' };

            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={validState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should accept project name with exactly 30 characters', () => {
            const validState = { ...baseState, projectName: 'a'.repeat(30) };

            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={validState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should accept project name with only hyphens and numbers', () => {
            const validState = { ...baseState, projectName: '123-456' };

            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={validState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });
    });

    describe('Error Conditions', () => {
        it('should handle missing state properties gracefully', () => {
            const minimalState = {
                currentStep: 'welcome',
                projectName: '',
            } as WizardState;

            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={minimalState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Should render without crashing
            expect(screen.getByText('Welcome to Adobe Demo Builder')).toBeInTheDocument();
        });

        it('should handle rapid input changes', async () => {
            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            const input = screen.getByLabelText(/name/i);

            // Rapidly change input
            fireEvent.change(input, { target: { value: 'a' } });
            fireEvent.change(input, { target: { value: 'ab' } });
            fireEvent.change(input, { target: { value: 'abc' } });
            fireEvent.change(input, { target: { value: 'abcd' } });

            // Should handle all changes without error
            expect(mockUpdateState).toHaveBeenCalledTimes(5); // Including initial default
        });
    });

    describe('Accessibility', () => {
        it('should mark name field as required', () => {
            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            const input = screen.getByLabelText(/name/i);
            expect(input).toBeRequired();
        });

        it('should show validation state visually', () => {
            const invalidState = { ...baseState, projectName: 'AB' };

            render(
                <Provider theme={defaultTheme}>
                    <WelcomeStep
                        state={invalidState as WizardState}
                        updateState={mockUpdateState}
                        onNext={mockOnNext}
                        onBack={mockOnBack}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Validation error should be visible (format error takes precedence for 'AB')
            expect(screen.getByText(/Use lowercase letters, numbers, and hyphens only/)).toBeInTheDocument();
        });
    });
});
