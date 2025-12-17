import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

        it('should update state when project name changes', async () => {
            const user = userEvent.setup();
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
            await user.click(input);
            // For controlled components, type appends to current value
            await user.type(input, 'x');

            // Verify updateState was called with the typed character appended
            expect(mockUpdateState).toHaveBeenCalledWith(expect.objectContaining({
                projectName: expect.stringContaining('x'),
            }));
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
            expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
        });

        it('should handle rapid input changes', async () => {
            const user = userEvent.setup();
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
            await user.clear(input);

            // Type rapidly (each character triggers onChange in controlled input)
            await user.type(input, 'abcd');

            // Should handle all changes without error (initial default + clear + 4 chars)
            expect(mockUpdateState).toHaveBeenCalled();
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
