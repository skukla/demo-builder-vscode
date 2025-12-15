import React from 'react';
import { renderWithProviders, screen } from '../../../../helpers/react-test-utils';
import { LoadingOverlay } from '@/core/ui/components/feedback/LoadingOverlay';

describe('LoadingOverlay', () => {
    describe('rendering', () => {
        it('renders when isVisible is true', () => {
            renderWithProviders(<LoadingOverlay isVisible={true} />);

            expect(screen.getByRole('status')).toBeInTheDocument();
        });

        it('does not render when isVisible is false', () => {
            renderWithProviders(<LoadingOverlay isVisible={false} />);

            expect(screen.queryByRole('status')).not.toBeInTheDocument();
        });

        it('renders spinner element', () => {
            const { container } = renderWithProviders(<LoadingOverlay isVisible={true} />);

            // Spinner should be visible within the overlay
            expect(container.querySelector('[data-testid="loading-spinner"]')).toBeInTheDocument();
        });
    });

    describe('optional message', () => {
        it('renders message when provided', () => {
            renderWithProviders(<LoadingOverlay isVisible={true} message="Loading projects..." />);

            expect(screen.getByText('Loading projects...')).toBeInTheDocument();
        });

        it('does not render message element when not provided', () => {
            const { container } = renderWithProviders(<LoadingOverlay isVisible={true} />);

            // Only spinner, no message text
            const messageElement = container.querySelector('[data-testid="loading-message"]');
            expect(messageElement).not.toBeInTheDocument();
        });
    });

    describe('accessibility', () => {
        it('has role="status" for screen readers', () => {
            renderWithProviders(<LoadingOverlay isVisible={true} />);

            expect(screen.getByRole('status')).toBeInTheDocument();
        });

        it('has aria-busy="true" when visible', () => {
            renderWithProviders(<LoadingOverlay isVisible={true} />);

            expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
        });

        it('has default aria-label when no message', () => {
            renderWithProviders(<LoadingOverlay isVisible={true} />);

            expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading');
        });

        it('uses message as aria-label when provided', () => {
            renderWithProviders(<LoadingOverlay isVisible={true} message="Saving..." />);

            expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Saving...');
        });
    });

    describe('styling', () => {
        it('applies container CSS class for positioning and layout', () => {
            const { container } = renderWithProviders(<LoadingOverlay isVisible={true} />);

            const overlay = container.querySelector('[data-testid="loading-overlay"]');
            // SOP §11: Styles moved to CSS classes - verify class is applied
            expect(overlay).toHaveClass('loading-overlay-container');
        });

        it('applies opaque class when opaque prop is true', () => {
            const { container } = renderWithProviders(<LoadingOverlay isVisible={true} opaque />);

            const overlay = container.querySelector('[data-testid="loading-overlay"]');
            expect(overlay).toHaveClass('loading-overlay-container');
            expect(overlay).toHaveClass('loading-overlay-container-opaque');
        });

        it('does not apply opaque class by default', () => {
            const { container } = renderWithProviders(<LoadingOverlay isVisible={true} />);

            const overlay = container.querySelector('[data-testid="loading-overlay"]');
            expect(overlay).not.toHaveClass('loading-overlay-container-opaque');
        });

        it('applies spinner container CSS class', () => {
            const { container } = renderWithProviders(<LoadingOverlay isVisible={true} />);

            const spinnerContainer = container.querySelector('[role="status"]');
            expect(spinnerContainer).toHaveClass('loading-overlay-spinner-container');
        });

        it('applies spinner CSS class', () => {
            const { container } = renderWithProviders(<LoadingOverlay isVisible={true} />);

            const spinner = container.querySelector('[data-testid="loading-spinner"]');
            expect(spinner).toHaveClass('loading-overlay-spinner');
        });
    });

    describe('edge cases', () => {
        it('handles toggling visibility', () => {
            const { rerender } = renderWithProviders(<LoadingOverlay isVisible={true} />);
            expect(screen.getByRole('status')).toBeInTheDocument();

            rerender(<LoadingOverlay isVisible={false} />);
            expect(screen.queryByRole('status')).not.toBeInTheDocument();

            rerender(<LoadingOverlay isVisible={true} />);
            expect(screen.getByRole('status')).toBeInTheDocument();
        });

        it('handles changing message while visible', () => {
            const { rerender } = renderWithProviders(
                <LoadingOverlay isVisible={true} message="Loading..." />
            );
            expect(screen.getByText('Loading...')).toBeInTheDocument();

            rerender(<LoadingOverlay isVisible={true} message="Almost done..." />);
            expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
            expect(screen.getByText('Almost done...')).toBeInTheDocument();
        });
    });
});
