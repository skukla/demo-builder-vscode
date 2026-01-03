/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { WizardProgress } from '@/features/sidebar/ui/components/WizardProgress';
import { DEFAULT_WIZARD_STEPS } from '../../testUtils';

// Wrap component with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => render(ui); // Simplified - no Provider needed

describe('WizardProgress', () => {
    describe('rendering', () => {
        it('should render correct number of steps', () => {
            renderWithProvider(
                <WizardProgress
                    steps={DEFAULT_WIZARD_STEPS}
                    currentStep={0}
                    completedSteps={[]}
                />
            );

            DEFAULT_WIZARD_STEPS.forEach((step) => {
                expect(screen.getByText(step.label)).toBeInTheDocument();
            });
        });

        it('should show completed steps with checkmark', () => {
            renderWithProvider(
                <WizardProgress
                    steps={DEFAULT_WIZARD_STEPS}
                    currentStep={2}
                    completedSteps={[0, 1]}
                />
            );

            // Completed steps should have checkmark
            const checkmarks = screen.getAllByText('✓');
            expect(checkmarks).toHaveLength(2);
        });

        it('should show current step with filled indicator', () => {
            renderWithProvider(
                <WizardProgress
                    steps={DEFAULT_WIZARD_STEPS}
                    currentStep={2}
                    completedSteps={[0, 1]}
                />
            );

            // Current step should have filled dot
            const currentIndicator = screen.getByText('●');
            expect(currentIndicator).toBeInTheDocument();
        });

        it('should show future steps with empty indicator', () => {
            renderWithProvider(
                <WizardProgress
                    steps={DEFAULT_WIZARD_STEPS}
                    currentStep={1}
                    completedSteps={[0]}
                />
            );

            // Future steps should have empty dot
            const emptyIndicators = screen.getAllByText('○');
            expect(emptyIndicators.length).toBeGreaterThan(0);
        });
    });

    describe('interactions', () => {
        it('should call onStepClick when step is clicked', () => {
            const onStepClick = jest.fn();
            renderWithProvider(
                <WizardProgress
                    steps={DEFAULT_WIZARD_STEPS}
                    currentStep={2}
                    completedSteps={[0, 1]}
                    onStepClick={onStepClick}
                />
            );

            fireEvent.click(screen.getByText('Sign In'));

            expect(onStepClick).toHaveBeenCalledWith(0);
        });

        it('should not call onStepClick if not provided', () => {
            renderWithProvider(
                <WizardProgress
                    steps={DEFAULT_WIZARD_STEPS}
                    currentStep={2}
                    completedSteps={[0, 1]}
                />
            );

            // Should not throw when clicking without handler
            fireEvent.click(screen.getByText('Sign In'));
        });
    });

    describe('accessibility', () => {
        it('should have proper aria labels', () => {
            renderWithProvider(
                <WizardProgress
                    steps={DEFAULT_WIZARD_STEPS}
                    currentStep={1}
                    completedSteps={[0]}
                />
            );

            // Progress container should have aria-label
            expect(screen.getByRole('list')).toHaveAttribute('aria-label');
        });
    });
});
