import React from 'react';
import { renderWithProviders, screen } from '../../../../helpers/react-test-utils';
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
            // The colour is declared by `.status-dot[data-variant='success']` in index.css.
            // jsdom loads no stylesheets, so the checkable contract is the attribute
            // the rule keys on — which the component is what decides.
            expect(dot).toHaveClass('status-dot');
            expect(dot).toHaveAttribute('data-variant', 'success');
        });

        it('renders error variant with CSS variable', () => {
            renderWithProviders(<StatusDot variant="error" />);
            const dot = screen.getByRole('presentation');
            // The colour is declared by `.status-dot[data-variant='error']` in index.css.
            // jsdom loads no stylesheets, so the checkable contract is the attribute
            // the rule keys on — which the component is what decides.
            expect(dot).toHaveClass('status-dot');
            expect(dot).toHaveAttribute('data-variant', 'error');
        });

        it('renders warning variant with CSS variable', () => {
            renderWithProviders(<StatusDot variant="warning" />);
            const dot = screen.getByRole('presentation');
            // The colour is declared by `.status-dot[data-variant='warning']` in index.css.
            // jsdom loads no stylesheets, so the checkable contract is the attribute
            // the rule keys on — which the component is what decides.
            expect(dot).toHaveClass('status-dot');
            expect(dot).toHaveAttribute('data-variant', 'warning');
        });

        it('renders info variant with CSS variable', () => {
            renderWithProviders(<StatusDot variant="info" />);
            const dot = screen.getByRole('presentation');
            // The colour is declared by `.status-dot[data-variant='info']` in index.css.
            // jsdom loads no stylesheets, so the checkable contract is the attribute
            // the rule keys on — which the component is what decides.
            expect(dot).toHaveClass('status-dot');
            expect(dot).toHaveAttribute('data-variant', 'info');
        });

        it('renders neutral variant with CSS variable', () => {
            renderWithProviders(<StatusDot variant="neutral" />);
            const dot = screen.getByRole('presentation');
            // The colour is declared by `.status-dot[data-variant='neutral']` in index.css.
            // jsdom loads no stylesheets, so the checkable contract is the attribute
            // the rule keys on — which the component is what decides.
            expect(dot).toHaveClass('status-dot');
            expect(dot).toHaveAttribute('data-variant', 'neutral');
        });
    });

    describe('Size', () => {
        it('renders with default size of 8px', () => {
            renderWithProviders(<StatusDot variant="success" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                '--status-dot-size': '8px',
            });
        });

        it('renders with custom size', () => {
            renderWithProviders(<StatusDot variant="success" size={12} />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({
                '--status-dot-size': '12px',
            });
        });

        it('renders with large size', () => {
            renderWithProviders(<StatusDot variant="error" size={16} />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveStyle({ '--status-dot-size': '16px' });
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

        // The class list is assembled from entries that are absent most of the time
        // (the pulse marker, a caller className). Those absences must be DROPPED, not
        // stringified: `false` and `undefined` joined into the attribute would ship a
        // literal "false" class and a trailing blank on the majority of dots.
        it('emits exactly the base classes when there is no pulse and no caller class', () => {
            renderWithProviders(<StatusDot variant="success" />);
            const dot = screen.getByRole('presentation');
            expect(dot.getAttribute('class')).toBe('status-dot inline-block rounded-full shrink-0');
        });

        it('appends the caller class after the base classes, with nothing between', () => {
            renderWithProviders(<StatusDot variant="neutral" className="tile-dot" />);
            const dot = screen.getByRole('presentation');
            expect(dot.getAttribute('class')).toBe('status-dot inline-block rounded-full shrink-0 tile-dot');
        });

        it('has flex-shrink of 0 via utility class', () => {
            renderWithProviders(<StatusDot variant="success" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveClass('shrink-0');
        });

        // A bare <span> defaults to display:inline, which ignores width/height, so
        // the dot needs `display: inline-block`. That used to be pinned INLINE, on
        // the argument that the box must survive `.inline-block` failing to reach a
        // webview. ADR-017 §6 already prevents that, verified across all eight
        // bundles — and the argument did not hold anyway, since the colour was a
        // var() needing the same stylesheets. `.status-dot` declares it now.
        it('carries the class that declares its box', () => {
            renderWithProviders(<StatusDot variant="success" />);
            expect(screen.getByRole('presentation')).toHaveClass('status-dot');
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
                <StatusDot variant="warning" size={10} className="custom-status" />
            );
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveClass('custom-status');
            expect(dot).toHaveAttribute('data-variant', 'warning');
            expect(dot).toHaveStyle({ '--status-dot-size': '10px' });
        });
    });

    // THE STANDARD (2026-08-04): an `info` dot means "in progress", and in-progress
    // pulses — on every surface, owned by the component. It used to be a class the
    // CALLER applied (`integration-dot--deploying`), so the integration card
    // pulsed while the dashboard's integrations tile showed the same blue dot
    // sitting perfectly still. Motion is a property of the status, not of the
    // surface that happens to render it.
    describe('in-progress pulse (the standard)', () => {
        it('pulses on the info variant', () => {
            renderWithProviders(<StatusDot variant="info" />);
            expect(screen.getByRole('presentation')).toHaveClass('status-dot--pulse');
        });

        it.each(['success', 'error', 'warning', 'neutral'] as const)(
            'does not pulse on %s',
            (variant) => {
                renderWithProviders(<StatusDot variant={variant} />);
                expect(screen.getByRole('presentation')).not.toHaveClass('status-dot--pulse');
            }
        );

        it('keeps a caller className alongside the pulse', () => {
            renderWithProviders(<StatusDot variant="info" className="integrations-tile-dot" />);
            const dot = screen.getByRole('presentation');
            expect(dot).toHaveClass('integrations-tile-dot');
            expect(dot).toHaveClass('status-dot--pulse');
        });
    });

    // Surfaces need to target one dot among several, and tests need a hook that
    // does not depend on a hand-rolled wrapper span.
    describe('identification', () => {
        it('always exposes its variant as a data attribute', () => {
            renderWithProviders(<StatusDot variant="warning" />);
            expect(screen.getByRole('presentation')).toHaveAttribute('data-variant', 'warning');
        });

        it('takes an optional test id', () => {
            renderWithProviders(<StatusDot variant="success" testId="my-dot" />);
            expect(screen.getByTestId('my-dot')).toBeInTheDocument();
        });
    });
});
