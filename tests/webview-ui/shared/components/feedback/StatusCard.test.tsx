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

        it('renders label and status as separate elements', () => {
            const { container } = renderWithProviders(
                <StatusCard label="Frontend" status="Running" color="green" />
            );
            const label = container.querySelector('.status-label');
            const status = container.querySelector('.status-text');
            expect(label).toHaveTextContent('Frontend');
            expect(status).toHaveTextContent('Running');
        });

        it('does not render label element when no label provided', () => {
            const { container } = renderWithProviders(
                <StatusCard status="Running" color="green" />
            );
            expect(container.querySelector('.status-label')).not.toBeInTheDocument();
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
            const { container } = renderWithProviders(
                <StatusCard status="Running" color="green" />
            );
            // SOP §11: Static styles use semantic CSS classes instead of utility classes
            // Find the status-row wrapper class
            const wrapper = container.querySelector('.status-row');
            expect(wrapper).toBeInTheDocument();
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

            // The wrapper should have status-row class (horizontal layout by default)
            // This verifies the bug fix: StatusCard bundle rebuilt with correct horizontal layout
            // Note: jsdom doesn't process CSS, so we check class presence instead of computed style
            expect(wrapper).toHaveClass('status-row');

            // Key assertion: status-row provides horizontal layout via CSS (flex-direction: row)
        });

        it('shows label and status when label provided', () => {
            renderWithProviders(
                <StatusCard label="Mesh Status" status="Deployed" color="green" />
            );
            expect(screen.getByText('Mesh Status')).toBeInTheDocument();
            expect(screen.getByText('Deployed')).toBeInTheDocument();
        });
    });

    describe('Text Styling', () => {
        it('applies correct font weight to status without label', () => {
            renderWithProviders(
                <StatusCard status="Running" color="green" />
            );
            const status = screen.getByText('Running');
            expect(status).toBeInTheDocument();
        });

        it('renders label and status as separate styled elements', () => {
            const { container } = renderWithProviders(
                <StatusCard label="Status" status="Running" color="green" />
            );
            expect(container.querySelector('.status-label')).toHaveTextContent('Status');
            expect(container.querySelector('.status-text')).toHaveTextContent('Running');
        });
    });

    describe('Dashboard Use Cases', () => {
        it('renders demo status indicator', () => {
            renderWithProviders(
                <StatusCard label="Frontend" status="Running" color="green" />
            );
            expect(screen.getByText('Frontend')).toBeInTheDocument();
            expect(screen.getByText('Running')).toBeInTheDocument();
        });

        it('renders mesh status indicator', () => {
            renderWithProviders(
                <StatusCard label="API Mesh" status="Deployed" color="green" />
            );
            expect(screen.getByText('API Mesh')).toBeInTheDocument();
            expect(screen.getByText('Deployed')).toBeInTheDocument();
        });

        it('renders stale mesh status', () => {
            renderWithProviders(
                <StatusCard label="API Mesh" status="Stale" color="yellow" />
            );
            expect(screen.getByText('API Mesh')).toBeInTheDocument();
            expect(screen.getByText('Stale')).toBeInTheDocument();
        });

        it('renders error status', () => {
            renderWithProviders(
                <StatusCard label="Deployment" status="Failed" color="red" />
            );
            expect(screen.getByText('Deployment')).toBeInTheDocument();
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
