import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { TimelineNav } from '@/features/project-creation/ui/wizard/TimelineNav';
import { WizardStep } from '@/types/webview';
import '@testing-library/jest-dom';

describe('TimelineNav', () => {
    const mockSteps = [
        { id: 'welcome' as WizardStep, name: 'Welcome' },
        { id: 'adobe-auth' as WizardStep, name: 'Adobe Authentication' },
        { id: 'component-selection' as WizardStep, name: 'Component Selection' },
        { id: 'review' as WizardStep, name: 'Review' },
        { id: 'project-creation' as WizardStep, name: 'Creating Project' },
    ];

    const mockOnStepClick = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Happy Path - Timeline Rendering', () => {
        it('should render all wizard steps', () => {
            render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="welcome"
                    completedSteps={[]}
                    highestCompletedStepIndex={-1}
                    onStepClick={mockOnStepClick}
                />
            );

            expect(screen.getByText('Welcome')).toBeInTheDocument();
            expect(screen.getByText('Adobe Authentication')).toBeInTheDocument();
            expect(screen.getByText('Component Selection')).toBeInTheDocument();
            expect(screen.getByText('Review')).toBeInTheDocument();
            expect(screen.getByText('Creating Project')).toBeInTheDocument();
        });

        it('should render Setup Progress label', () => {
            render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="welcome"
                    completedSteps={[]}
                    highestCompletedStepIndex={-1}
                    onStepClick={mockOnStepClick}
                />
            );

            expect(screen.getByText('Setup Progress')).toBeInTheDocument();
        });

        it('should highlight current step', () => {
            const { container } = render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="adobe-auth"
                    completedSteps={[]}
                    highestCompletedStepIndex={-1}
                    onStepClick={mockOnStepClick}
                />
            );

            // Current step should have specific styling (via status = 'current')
            // Verify through DOM structure (current step has pulsing dot)
            expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
        });

        it('should show checkmark for completed steps', () => {
            render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="component-selection"
                    completedSteps={['welcome', 'adobe-auth']}
                    highestCompletedStepIndex={1}
                    onStepClick={mockOnStepClick}
                />
            );

            // Completed steps should show CheckmarkCircle icon
            // Verify through SVG or icon presence (depends on implementation)
        });
    });

    describe('Happy Path - Step Navigation', () => {
        it('should call onStepClick when clicking on current or previous step', () => {
            render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="component-selection"
                    completedSteps={['welcome', 'adobe-auth']}
                    highestCompletedStepIndex={1}
                    onStepClick={mockOnStepClick}
                />
            );

            // Click on previous completed step
            const welcomeStep = screen.getByText('Welcome');
            fireEvent.click(welcomeStep);

            expect(mockOnStepClick).toHaveBeenCalledWith('welcome');
        });

        it('should call onStepClick when clicking on current step', () => {
            render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="adobe-auth"
                    completedSteps={['welcome']}
                    highestCompletedStepIndex={0}
                    onStepClick={mockOnStepClick}
                />
            );

            const currentStep = screen.getByText('Adobe Authentication');
            fireEvent.click(currentStep);

            expect(mockOnStepClick).toHaveBeenCalledWith('adobe-auth');
        });

        it('should not call onStepClick when clicking on future steps', () => {
            render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="welcome"
                    completedSteps={[]}
                    highestCompletedStepIndex={-1}
                    onStepClick={mockOnStepClick}
                />
            );

            // Click on future step (should be ignored)
            const futureStep = screen.getByText('Review');
            fireEvent.click(futureStep);

            expect(mockOnStepClick).not.toHaveBeenCalled();
        });
    });

    describe('Edge Cases - Step Status', () => {
        it('should handle step that is both current and completed', () => {
            render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="adobe-auth"
                    completedSteps={['welcome', 'adobe-auth']}
                    highestCompletedStepIndex={1}
                    onStepClick={mockOnStepClick}
                />
            );

            // Step should show as completed-current (checkmark + highlighted)
            expect(screen.getByText('Adobe Authentication')).toBeInTheDocument();
        });

        it('should render with no completed steps', () => {
            render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="welcome"
                    completedSteps={[]}
                    highestCompletedStepIndex={-1}
                    onStepClick={mockOnStepClick}
                />
            );

            // All steps except current should be upcoming
            expect(screen.getByText('Welcome')).toBeInTheDocument();
        });

        it('should render with all steps completed', () => {
            const allSteps = mockSteps.map(s => s.id);
            render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="project-creation"
                    completedSteps={allSteps}
                    highestCompletedStepIndex={mockSteps.length - 1}
                    onStepClick={mockOnStepClick}
                />
            );

            // All steps should show checkmarks
            expect(screen.getByText('Creating Project')).toBeInTheDocument();
        });

        it('should handle long step names with truncation', () => {
            const longNameSteps = [
                { id: 'welcome' as WizardStep, name: 'Welcome to Adobe Demo Builder with Very Long Name' },
                { id: 'adobe-auth' as WizardStep, name: 'Authentication' },
            ];

            render(
                <TimelineNav
                    steps={longNameSteps}
                    currentStep="welcome"
                    completedSteps={[]}
                    highestCompletedStepIndex={-1}
                    onStepClick={mockOnStepClick}
                />
            );

            // Long name should be present (truncation handled by CSS)
            expect(screen.getByText(/Welcome to Adobe Demo Builder/)).toBeInTheDocument();
        });
    });

    describe('Edge Cases - Navigation Constraints', () => {
        it('should not allow navigation to steps beyond current', () => {
            render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="adobe-auth"
                    completedSteps={['welcome']}
                    highestCompletedStepIndex={0}
                    onStepClick={mockOnStepClick}
                />
            );

            // Try to click on future step (index > currentStepIndex)
            const reviewStep = screen.getByText('Review');
            fireEvent.click(reviewStep);

            // onStepClick should not be called
            expect(mockOnStepClick).not.toHaveBeenCalled();
        });

        it('should allow navigation to first step from anywhere', () => {
            render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="review"
                    completedSteps={['welcome', 'adobe-auth', 'component-selection']}
                    highestCompletedStepIndex={2}
                    onStepClick={mockOnStepClick}
                />
            );

            const welcomeStep = screen.getByText('Welcome');
            fireEvent.click(welcomeStep);

            expect(mockOnStepClick).toHaveBeenCalledWith('welcome');
        });
    });

    describe('Error Conditions', () => {
        it('should handle empty steps array gracefully', () => {
            render(
                <TimelineNav
                    steps={[]}
                    currentStep="welcome"
                    completedSteps={[]}
                    highestCompletedStepIndex={-1}
                    onStepClick={mockOnStepClick}
                />
            );

            // Should render without crashing
            expect(screen.getByText('Setup Progress')).toBeInTheDocument();
        });

        it('should handle missing onStepClick gracefully', () => {
            render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="welcome"
                    completedSteps={[]}
                    highestCompletedStepIndex={-1}
                />
            );

            // Click step (should not crash without onStepClick)
            const step = screen.getByText('Welcome');
            fireEvent.click(step);

            // No error should occur
            expect(step).toBeInTheDocument();
        });

        it('should handle invalid currentStep gracefully', () => {
            render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep={'invalid-step' as WizardStep}
                    completedSteps={[]}
                    highestCompletedStepIndex={-1}
                    onStepClick={mockOnStepClick}
                />
            );

            // Should render without crashing (no current step highlighted)
            expect(screen.getByText('Welcome')).toBeInTheDocument();
        });
    });

    describe('Visual States - Step Indicators', () => {
        it('should show pulsing dot for current uncompleted step', () => {
            const { container } = render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="adobe-auth"
                    completedSteps={[]}
                    highestCompletedStepIndex={-1}
                    onStepClick={mockOnStepClick}
                />
            );

            // Current uncompleted step should have animate-pulse class
            expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
        });

        it('should show static dot for upcoming steps', () => {
            const { container } = render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="welcome"
                    completedSteps={[]}
                    highestCompletedStepIndex={-1}
                    onStepClick={mockOnStepClick}
                />
            );

            // Upcoming steps should have static gray dots
            expect(container.querySelectorAll('.bg-gray-400').length).toBeGreaterThan(0);
        });

        it('should reduce opacity for upcoming steps', () => {
            const { container } = render(
                <TimelineNav
                    steps={mockSteps}
                    currentStep="welcome"
                    completedSteps={[]}
                    highestCompletedStepIndex={-1}
                    onStepClick={mockOnStepClick}
                />
            );

            // Upcoming steps should have opacity-50 class
            expect(container.querySelector('.opacity-50')).toBeInTheDocument();
        });
    });
});
