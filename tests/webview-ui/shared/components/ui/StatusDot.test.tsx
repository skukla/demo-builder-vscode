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
        it('renders success variant with green color', () => {
            renderWithProviders(<StatusDot variant="success" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                backgroundColor: '#10b981'
            });
        });

        it('renders error variant with red color', () => {
            renderWithProviders(<StatusDot variant="error" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                backgroundColor: '#ef4444'
            });
        });

        it('renders warning variant with amber color', () => {
            renderWithProviders(<StatusDot variant="warning" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                backgroundColor: '#f59e0b'
            });
        });

        it('renders info variant with blue color', () => {
            renderWithProviders(<StatusDot variant="info" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                backgroundColor: '#3b82f6'
            });
        });

        it('renders neutral variant with gray color', () => {
            renderWithProviders(<StatusDot variant="neutral" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                backgroundColor: '#6b7280'
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
        it('has circular shape', () => {
            renderWithProviders(<StatusDot variant="success" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                borderRadius: '50%'
            });
        });

        it('is inline-block display', () => {
            renderWithProviders(<StatusDot variant="success" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                display: 'inline-block'
            });
        });

        it('has flex-shrink of 0', () => {
            renderWithProviders(<StatusDot variant="success" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                flexShrink: 0
            });
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
                backgroundColor: '#f59e0b',
                width: '10px',
                height: '10px'
            });
        });
    });
});
