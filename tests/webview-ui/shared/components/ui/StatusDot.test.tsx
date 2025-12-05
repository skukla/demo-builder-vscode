import React from 'react';
import { renderWithProviders, screen } from "../../../../helpers/react-test-utils";
import { StatusDot } from '@/core/ui/components/ui/StatusDot';

describe('StatusDot', () => {
    describe('Rendering', () => {
        it('renders status dot', () => {
            const { container } = renderWithProviders(<StatusDot variant="success" />);
            const dot = container.querySelector('span[role="presentation"]');
            expect(dot).toBeInTheDocument();
        });

        it('renders with custom className', () => {
            renderWithProviders(<StatusDot variant="success" className="custom-dot" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveClass('custom-dot');
        });
    });

    describe('Variants', () => {
        it('renders success variant with CSS variable', () => {
            renderWithProviders(<StatusDot variant="success" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                backgroundColor: 'var(--db-status-dot-success)'
            });
        });

        it('renders error variant with CSS variable', () => {
            renderWithProviders(<StatusDot variant="error" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                backgroundColor: 'var(--db-status-dot-error)'
            });
        });

        it('renders warning variant with CSS variable', () => {
            renderWithProviders(<StatusDot variant="warning" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                backgroundColor: 'var(--db-status-dot-warning)'
            });
        });

        it('renders info variant with CSS variable', () => {
            renderWithProviders(<StatusDot variant="info" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                backgroundColor: 'var(--db-status-dot-info)'
            });
        });

        it('renders neutral variant with CSS variable', () => {
            renderWithProviders(<StatusDot variant="neutral" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                backgroundColor: 'var(--db-status-dot-neutral)'
            });
        });
    });

    describe('Size', () => {
        it('renders with default size of 8px', () => {
            renderWithProviders(<StatusDot variant="success" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                width: '8px',
                height: '8px'
            });
        });

        it('renders with custom size', () => {
            renderWithProviders(<StatusDot variant="success" size={12} />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                width: '12px',
                height: '12px'
            });
        });

        it('renders with large size', () => {
            renderWithProviders(<StatusDot variant="error" size={16} />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                width: '16px',
                height: '16px'
            });
        });
    });

    describe('Base Styles', () => {
        // SOP §11: Static styles now use utility classes instead of inline styles
        it('has circular shape via utility class', () => {
            renderWithProviders(<StatusDot variant="success" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveClass('rounded-full');
        });

        it('is inline-block display via utility class', () => {
            renderWithProviders(<StatusDot variant="success" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveClass('inline-block');
        });

        it('has flex-shrink of 0 via utility class', () => {
            renderWithProviders(<StatusDot variant="success" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveClass('shrink-0');
        });
    });

    describe('Accessibility', () => {
        it('has presentation role', () => {
            renderWithProviders(<StatusDot variant="success" />);
            expect(screen.getByRole('presentation')).toBeInTheDocument();
        });
    });

    describe('Props Combination', () => {
        it('renders with all custom props', () => {
            renderWithProviders(
                <StatusDot
                    variant="warning"
                    size={10}
                    className="custom-status"
                />
            );
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveClass('custom-status');
            expect(dot).toHaveStyle({
                backgroundColor: 'var(--db-status-dot-warning)',
                width: '10px',
                height: '10px'
            });
        });
    });
});
