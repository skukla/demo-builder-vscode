import React from 'react';
import { renderWithProviders, screen, cleanup } from '../../../../helpers/react-test-utils';
import userEvent from '@testing-library/user-event';
import { SuccessStateDisplay } from '@/core/ui/components/feedback/SuccessStateDisplay';

describe('SuccessStateDisplay', () => {
    afterEach(() => {
        cleanup();
        jest.clearAllMocks();
    });

    describe('Basic Rendering', () => {
        it('should render with required title prop', () => {
            renderWithProviders(<SuccessStateDisplay title="Operation Complete" />);
            expect(screen.getByText('Operation Complete')).toBeInTheDocument();
        });

        it('should render with title and message', () => {
            renderWithProviders(
                <SuccessStateDisplay
                    title="Project Created"
                    message="Your project has been successfully created."
                />
            );
            expect(screen.getByText('Project Created')).toBeInTheDocument();
            expect(screen.getByText('Your project has been successfully created.')).toBeInTheDocument();
        });

        it('should render success checkmark icon', () => {
            const { container } = renderWithProviders(
                <SuccessStateDisplay title="Success" />
            );
            // CheckmarkCircle icon from StatusDisplay variant="success" renders with green color
            const icon = container.querySelector('.text-green-600');
            expect(icon).toBeInTheDocument();
        });

        it('should render with green success icon color', () => {
            const { container } = renderWithProviders(
                <SuccessStateDisplay title="Complete" />
            );
            // Verify the success variant's green icon class
            expect(container.querySelector('.text-green-600')).toBeInTheDocument();
        });
    });

    describe('Details Array', () => {
        it('should render single detail line', () => {
            renderWithProviders(
                <SuccessStateDisplay
                    title="Deployment Complete"
                    details={['Mesh deployed to production']}
                />
            );
            expect(screen.getByText('Mesh deployed to production')).toBeInTheDocument();
        });

        it('should render multiple detail lines', () => {
            renderWithProviders(
                <SuccessStateDisplay
                    title="Setup Complete"
                    details={[
                        'Authentication configured',
                        'Project selected',
                        'Workspace ready'
                    ]}
                />
            );
            expect(screen.getByText('Authentication configured')).toBeInTheDocument();
            expect(screen.getByText('Project selected')).toBeInTheDocument();
            expect(screen.getByText('Workspace ready')).toBeInTheDocument();
        });

        it('should handle empty details array', () => {
            renderWithProviders(
                <SuccessStateDisplay
                    title="Success"
                    details={[]}
                />
            );
            expect(screen.getByText('Success')).toBeInTheDocument();
            // Empty array should not cause errors
        });

        it('should render details alongside message', () => {
            renderWithProviders(
                <SuccessStateDisplay
                    title="Completed"
                    message="All steps finished successfully"
                    details={['Step 1 done', 'Step 2 done']}
                />
            );
            expect(screen.getByText('All steps finished successfully')).toBeInTheDocument();
            expect(screen.getByText('Step 1 done')).toBeInTheDocument();
            expect(screen.getByText('Step 2 done')).toBeInTheDocument();
        });
    });

    describe('Actions', () => {
        it('should render single action button', () => {
            const handleContinue = jest.fn();
            renderWithProviders(
                <SuccessStateDisplay
                    title="Ready"
                    actions={[
                        { label: 'Continue', onPress: handleContinue }
                    ]}
                />
            );
            expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
        });

        it('should render multiple action buttons', () => {
            const handleDone = jest.fn();
            const handleViewLogs = jest.fn();
            renderWithProviders(
                <SuccessStateDisplay
                    title="Complete"
                    actions={[
                        { label: 'Done', onPress: handleDone, variant: 'accent' },
                        { label: 'View Logs', onPress: handleViewLogs, variant: 'secondary' }
                    ]}
                />
            );
            expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'View Logs' })).toBeInTheDocument();
        });

        it('should call onPress handler when action button clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const handlePress = jest.fn();
            renderWithProviders(
                <SuccessStateDisplay
                    title="Complete"
                    actions={[
                        { label: 'Finish', onPress: handlePress }
                    ]}
                />
            );

            await user.click(screen.getByRole('button', { name: 'Finish' }));
            expect(handlePress).toHaveBeenCalledTimes(1);
        });

        it('should handle multiple clicks on action buttons', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const handlePress = jest.fn();
            renderWithProviders(
                <SuccessStateDisplay
                    title="Complete"
                    actions={[
                        { label: 'Click Me', onPress: handlePress }
                    ]}
                />
            );

            const button = screen.getByRole('button', { name: 'Click Me' });
            await user.click(button);
            await user.click(button);
            await user.click(button);
            expect(handlePress).toHaveBeenCalledTimes(3);
        });

        it('should support action button variants', () => {
            renderWithProviders(
                <SuccessStateDisplay
                    title="Done"
                    actions={[
                        { label: 'Primary', onPress: jest.fn(), variant: 'accent' }
                    ]}
                />
            );
            // Button should be rendered with the specified variant
            expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument();
        });
    });

    describe('Height Customization', () => {
        it('should use default height of 350px', () => {
            const { container } = renderWithProviders(
                <SuccessStateDisplay title="Default Height" />
            );
            const heightElement = container.querySelector('[style*="height"]');
            expect(heightElement).toBeInTheDocument();
            expect(heightElement).toHaveStyle({ height: '350px' });
        });

        it('should accept custom height', () => {
            const { container } = renderWithProviders(
                <SuccessStateDisplay title="Custom Height" height="500px" />
            );
            const heightElement = container.querySelector('[style*="height"]');
            expect(heightElement).toBeInTheDocument();
            expect(heightElement).toHaveStyle({ height: '500px' });
        });

        it('should accept different height values', () => {
            const { container } = renderWithProviders(
                <SuccessStateDisplay title="Short" height="200px" />
            );
            const heightElement = container.querySelector('[style*="height"]');
            expect(heightElement).toHaveStyle({ height: '200px' });
        });
    });

    describe('Component Composition', () => {
        it('should render complete success display with all props', () => {
            const handleAction1 = jest.fn();
            const handleAction2 = jest.fn();

            renderWithProviders(
                <SuccessStateDisplay
                    title="Project Setup Complete"
                    message="Your Adobe Commerce demo project is ready to use."
                    details={[
                        'Components installed',
                        'API Mesh deployed',
                        'Environment configured'
                    ]}
                    actions={[
                        { label: 'Open Dashboard', onPress: handleAction1, variant: 'accent' },
                        { label: 'Close', onPress: handleAction2, variant: 'secondary' }
                    ]}
                    height="400px"
                />
            );

            expect(screen.getByText('Project Setup Complete')).toBeInTheDocument();
            expect(screen.getByText('Your Adobe Commerce demo project is ready to use.')).toBeInTheDocument();
            expect(screen.getByText('Components installed')).toBeInTheDocument();
            expect(screen.getByText('API Mesh deployed')).toBeInTheDocument();
            expect(screen.getByText('Environment configured')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Open Dashboard' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
        });

        it('should render without optional props', () => {
            renderWithProviders(
                <SuccessStateDisplay title="Simple Success" />
            );
            // Should render only title without errors
            expect(screen.getByText('Simple Success')).toBeInTheDocument();
        });
    });

    describe('Memoization', () => {
        it('should be a memoized component', () => {
            // React.memo components have $$typeof property
            expect(SuccessStateDisplay).toHaveProperty('$$typeof');
        });

        it('should have displayName set', () => {
            expect(SuccessStateDisplay.displayName).toBe('SuccessStateDisplay');
        });
    });
});
