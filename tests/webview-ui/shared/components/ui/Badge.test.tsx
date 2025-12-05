import React from 'react';
import { renderWithProviders, screen } from "../../../../helpers/react-test-utils";
import { Badge } from '@/core/ui/components/ui/Badge';

describe('Badge', () => {
    describe('Rendering', () => {
        it('renders with text content', () => {
            renderWithProviders(<Badge>Test Badge</Badge>);
            expect(screen.getByText('Test Badge')).toBeInTheDocument();
        });

        it('renders with default neutral variant', () => {
            renderWithProviders(<Badge>Neutral</Badge>);
            const badge = screen.getByText('Neutral');
            expect(badge).toBeInTheDocument();
        });

        it('renders with custom className', () => {
            renderWithProviders(<Badge className="custom-class">Badge</Badge>);
            const badge = screen.getByText('Badge');
            expect(badge).toHaveClass('custom-class');
        });
    });

    describe('Variants', () => {
        it('renders success variant with CSS variables', () => {
            renderWithProviders(<Badge variant="success">Success</Badge>);
            const badge = screen.getByText('Success');
            expect(badge).toHaveStyle({
                backgroundColor: 'var(--db-badge-success-bg)',
                color: 'var(--db-badge-success-text)'
            });
        });

        it('renders error variant with CSS variables', () => {
            renderWithProviders(<Badge variant="error">Error</Badge>);
            const badge = screen.getByText('Error');
            expect(badge).toHaveStyle({
                backgroundColor: 'var(--db-badge-error-bg)',
                color: 'var(--db-badge-error-text)'
            });
        });

        it('renders warning variant with CSS variables', () => {
            renderWithProviders(<Badge variant="warning">Warning</Badge>);
            const badge = screen.getByText('Warning');
            expect(badge).toHaveStyle({
                backgroundColor: 'var(--db-badge-warning-bg)',
                color: 'var(--db-badge-warning-text)'
            });
        });

        it('renders info variant with CSS variables', () => {
            renderWithProviders(<Badge variant="info">Info</Badge>);
            const badge = screen.getByText('Info');
            expect(badge).toHaveStyle({
                backgroundColor: 'var(--db-badge-info-bg)',
                color: 'var(--db-badge-info-text)'
            });
        });

        it('renders neutral variant with CSS variables', () => {
            renderWithProviders(<Badge variant="neutral">Neutral</Badge>);
            const badge = screen.getByText('Neutral');
            expect(badge).toHaveStyle({
                backgroundColor: 'var(--db-badge-neutral-bg)',
                color: 'var(--db-badge-neutral-text)'
            });
        });
    });

    describe('Base Styles', () => {
        it('applies base styles to all variants', () => {
            renderWithProviders(<Badge>Test</Badge>);
            const badge = screen.getByText('Test');
            expect(badge).toHaveStyle({
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                lineHeight: '16px'
            });
        });
    });

    describe('Content', () => {
        it('renders complex children', () => {
            renderWithProviders(
                <Badge>
                    <span>Complex</span> Content
                </Badge>
            );
            expect(screen.getByText('Complex')).toBeInTheDocument();
            expect(screen.getByText('Content')).toBeInTheDocument();
        });

        it('renders numeric content', () => {
            renderWithProviders(<Badge>42</Badge>);
            expect(screen.getByText('42')).toBeInTheDocument();
        });
    });
});
