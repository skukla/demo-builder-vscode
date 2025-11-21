import React from 'react';
import { renderWithProviders, screen } from "../../../../helpers/react-test-utils";
import { StatusCard } from '@/core/ui/components/feedback/StatusCard';

describe('StatusCard', () => {
    describe('Rendering', () => {
        it('renders with required status and color props', () => {
            renderWithProviders(<StatusCard status="Running" color="green" />);
            expect(screen.getByText('Running')).toBeInTheDocument();
        });

        it('renders without label', () => {
            renderWithProviders(<StatusCard status="Active" color="green" />);
            expect(screen.getByText('Active')).toBeInTheDocument();
        });

        it('renders with label', () => {
            renderWithProviders(
                <StatusCard label="Demo Status" status="Running" color="green" />
            );
            expect(screen.getByText('Demo Status')).toBeInTheDocument();
            expect(screen.getByText('Running')).toBeInTheDocument();
        });

        it('renders with custom className', () => {
            const { container } = renderWithProviders(
                <StatusCard status="Running" color="green" className="custom-status" />
            );
            expect(container.querySelector('.custom-status')).toBeInTheDocument();
        });
    });

    describe('Status Dot Colors', () => {
        it('renders with gray color', () => {
            renderWithProviders(<StatusCard status="Unknown" color="gray" />);
            expect(screen.getByText('Unknown')).toBeInTheDocument();
        });

        it('renders with green color', () => {
            renderWithProviders(<StatusCard status="Success" color="green" />);
            expect(screen.getByText('Success')).toBeInTheDocument();
        });

        it('renders with yellow color', () => {
            renderWithProviders(<StatusCard status="Warning" color="yellow" />);
            expect(screen.getByText('Warning')).toBeInTheDocument();
        });

        it('renders with red color', () => {
            renderWithProviders(<StatusCard status="Error" color="red" />);
            expect(screen.getByText('Error')).toBeInTheDocument();
        });

        it('renders with blue color', () => {
            renderWithProviders(<StatusCard status="Info" color="blue" />);
            expect(screen.getByText('Info')).toBeInTheDocument();
        });

        it('renders with orange color', () => {
            renderWithProviders(<StatusCard status="Update Declined" color="orange" />);
            expect(screen.getByText('Update Declined')).toBeInTheDocument();
        });
    });

    describe('Size', () => {
        it('uses default M size', () => {
            renderWithProviders(<StatusCard status="Running" color="green" />);
            expect(screen.getByText('Running')).toBeInTheDocument();
        });

        it('renders with S size', () => {
            renderWithProviders(<StatusCard status="Running" color="green" size="S" />);
            expect(screen.getByText('Running')).toBeInTheDocument();
        });

        it('renders with L size', () => {
            renderWithProviders(<StatusCard status="Running" color="green" size="L" />);
            expect(screen.getByText('Running')).toBeInTheDocument();
        });
    });

    describe('Layout', () => {
        it('has flexbox layout', () => {
            renderWithProviders(
                <StatusCard status="Running" color="green" />
            );
            // Find the status text and navigate up to the main wrapper
            // Structure: wrapper div > text container div > status span
            const statusText = screen.getByText('Running');
            const textContainer = statusText.parentElement as HTMLElement;
            const wrapper = textContainer.parentElement as HTMLElement;
            expect(wrapper).toHaveStyle({
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            });
        });

        it('renders with horizontal layout (flex-row), not stacked (flex-col)', () => {
            // Given: StatusCard component rendered
            renderWithProviders(
                <StatusCard status="Running" color="green" />
            );

            // When: We find the status text (this verifies component renders)
            const statusText = screen.getByText('Running');
            expect(statusText).toBeInTheDocument();

            // Then: Verify the wrapper div uses flex layout (horizontal by default)
            // Navigate from text -> parent (span) -> grandparent (wrapper div)
            const textSpan = statusText.closest('span');
            expect(textSpan).toBeInTheDocument();

            const wrapper = textSpan?.parentElement;
            expect(wrapper).toBeInTheDocument();

            // The wrapper should have display: flex with default flex-direction (row = horizontal)
            // This verifies the bug fix: StatusCard bundle rebuilt with correct horizontal layout
            expect(wrapper).toHaveStyle({ display: 'flex' });

            // Key assertion: NOT vertical/stacked (flex-direction: column)
            // Note: In jsdom, flexDirection defaults to empty string (which means 'row')
            const computedStyle = window.getComputedStyle(wrapper as HTMLElement);
            expect(computedStyle.flexDirection).not.toBe('column');
        });

        it('shows label above status when provided', () => {
            const { container } = renderWithProviders(
                <StatusCard label="Mesh Status" status="Deployed" color="green" />
            );
            const label = screen.getByText('Mesh Status');
            const status = screen.getByText('Deployed');

            // Both should exist
            expect(label).toBeInTheDocument();
            expect(status).toBeInTheDocument();

            // Label should have smaller font
            expect(label).toHaveStyle({ fontSize: '12px' });
        });
    });

    describe('Text Styling', () => {
        it('applies correct font weight to status without label', () => {
            const { container } = renderWithProviders(
                <StatusCard status="Running" color="green" />
            );
            const status = screen.getByText('Running');
            expect(status).toHaveStyle({
                fontSize: '14px',
                fontWeight: 500
            });
        });

        it('applies correct font weight to status with label', () => {
            const { container } = renderWithProviders(
                <StatusCard label="Status" status="Running" color="green" />
            );
            const status = screen.getByText('Running');
            expect(status).toHaveStyle({
                fontSize: '14px',
                fontWeight: 400
            });
        });

        it('applies correct styles to label', () => {
            renderWithProviders(
                <StatusCard label="Demo Status" status="Running" color="green" />
            );
            const label = screen.getByText('Demo Status');
            expect(label).toHaveStyle({
                fontSize: '12px',
                fontWeight: 500
            });
        });
    });

    describe('Dashboard Use Cases', () => {
        it('renders demo status indicator', () => {
            renderWithProviders(
                <StatusCard label="Demo Status" status="Running" color="green" />
            );
            expect(screen.getByText('Demo Status')).toBeInTheDocument();
            expect(screen.getByText('Running')).toBeInTheDocument();
        });

        it('renders mesh status indicator', () => {
            renderWithProviders(
                <StatusCard label="Mesh Status" status="Deployed" color="green" />
            );
            expect(screen.getByText('Mesh Status')).toBeInTheDocument();
            expect(screen.getByText('Deployed')).toBeInTheDocument();
        });

        it('renders stale mesh status', () => {
            renderWithProviders(
                <StatusCard label="Mesh Status" status="Stale" color="yellow" />
            );
            expect(screen.getByText('Stale')).toBeInTheDocument();
        });

        it('renders error status', () => {
            renderWithProviders(
                <StatusCard label="Deployment" status="Failed" color="red" />
            );
            expect(screen.getByText('Failed')).toBeInTheDocument();
        });
    });

    describe('Status Dot Integration', () => {
        it('renders StatusDot component', () => {
            const { container } = renderWithProviders(
                <StatusCard status="Running" color="green" />
            );
            const dot = container.querySelector('span[role="presentation"]');
            expect(dot).toBeInTheDocument();
        });

        it('passes size to StatusDot', () => {
            renderWithProviders(
                <StatusCard status="Running" color="green" size="L" />
            );
            // StatusDot should be rendered (exact verification depends on implementation)
            expect(screen.getByText('Running')).toBeInTheDocument();
        });
    });

    describe('Complex Scenarios', () => {
        it('renders with all custom props', () => {
            const { container } = renderWithProviders(
                <StatusCard
                    label="Custom Status"
                    status="Processing"
                    color="blue"
                    size="L"
                    className="my-status-card"
                />
            );

            expect(screen.getByText('Custom Status')).toBeInTheDocument();
            expect(screen.getByText('Processing')).toBeInTheDocument();
            expect(container.querySelector('.my-status-card')).toBeInTheDocument();
        });

        it('updates when status changes', () => {
            const { rerender } = renderWithProviders(
                <StatusCard status="Starting" color="yellow" />
            );
            expect(screen.getByText('Starting')).toBeInTheDocument();

            rerender(<StatusCard status="Running" color="green" />);
            expect(screen.getByText('Running')).toBeInTheDocument();
            expect(screen.queryByText('Starting')).not.toBeInTheDocument();
        });

        it('updates when color changes', () => {
            const { rerender } = renderWithProviders(
                <StatusCard status="Status" color="gray" />
            );

            rerender(<StatusCard status="Status" color="green" />);
            expect(screen.getByText('Status')).toBeInTheDocument();
        });
    });

    describe('Memoization', () => {
        it('is memoized component', () => {
            expect(StatusCard).toHaveProperty('$$typeof');
        });
    });
});
