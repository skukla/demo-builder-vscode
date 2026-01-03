/**
 * ProgressCircle Component Tests
 *
 * Tests the ProgressCircle component which provides circular progress indication
 * with proper ARIA accessibility attributes for both indeterminate and determinate modes.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProgressCircle } from '@/core/ui/components/aria/interactive';

describe('ProgressCircle', () => {
    describe('SVG rendering', () => {
        it('should render SVG element', () => {
            // Given: ProgressCircle component
            const { container } = render(<ProgressCircle />);

            // Then: SVG element is rendered
            const svg = container.querySelector('svg');
            expect(svg).toBeInTheDocument();
        });

        it('should render circle elements within SVG', () => {
            // Given: ProgressCircle component
            const { container } = render(<ProgressCircle />);

            // Then: Circle elements exist for track and fill
            const circles = container.querySelectorAll('circle');
            expect(circles.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('accessibility', () => {
        it('should have correct accessibility role (progressbar)', () => {
            // Given: ProgressCircle component
            render(<ProgressCircle aria-label="Loading content" />);

            // Then: Has progressbar role
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('should support aria-label for screen readers', () => {
            // Given: ProgressCircle with aria-label
            render(<ProgressCircle aria-label="Uploading file" />);

            // Then: aria-label is applied
            const progress = screen.getByRole('progressbar');
            expect(progress).toHaveAttribute('aria-label', 'Uploading file');
        });

        it('should have aria-valuemin and aria-valuemax attributes', () => {
            // Given: Determinate ProgressCircle
            render(
                <ProgressCircle
                    value={50}
                    aria-label="Progress"
                />
            );

            // Then: Has min and max attributes
            const progress = screen.getByRole('progressbar');
            expect(progress).toHaveAttribute('aria-valuemin', '0');
            expect(progress).toHaveAttribute('aria-valuemax', '100');
        });
    });

    describe('size variants', () => {
        it('should support size="S" (16x16)', () => {
            // Given: ProgressCircle with size S
            const { container } = render(
                <ProgressCircle size="S" aria-label="Small" />
            );

            // Then: SVG has 16x16 dimensions
            const svg = container.querySelector('svg');
            expect(svg).toHaveAttribute('width', '16');
            expect(svg).toHaveAttribute('height', '16');
        });

        it('should support size="M" (32x32)', () => {
            // Given: ProgressCircle with size M
            const { container } = render(
                <ProgressCircle size="M" aria-label="Medium" />
            );

            // Then: SVG has 32x32 dimensions
            const svg = container.querySelector('svg');
            expect(svg).toHaveAttribute('width', '32');
            expect(svg).toHaveAttribute('height', '32');
        });

        it('should support size="L" (64x64)', () => {
            // Given: ProgressCircle with size L
            const { container } = render(
                <ProgressCircle size="L" aria-label="Large" />
            );

            // Then: SVG has 64x64 dimensions
            const svg = container.querySelector('svg');
            expect(svg).toHaveAttribute('width', '64');
            expect(svg).toHaveAttribute('height', '64');
        });

        it('should default to size="M" when not specified', () => {
            // Given: ProgressCircle without size prop
            const { container } = render(
                <ProgressCircle aria-label="Default size" />
            );

            // Then: SVG has default 32x32 dimensions
            const svg = container.querySelector('svg');
            expect(svg).toHaveAttribute('width', '32');
            expect(svg).toHaveAttribute('height', '32');
        });
    });

    describe('indeterminate mode', () => {
        it('should show animation when isIndeterminate', () => {
            // Given: Indeterminate ProgressCircle
            const { container } = render(
                <ProgressCircle isIndeterminate aria-label="Loading" />
            );

            // Then: Has indeterminate data attribute for animation
            const wrapper = container.firstChild;
            expect(wrapper).toHaveAttribute('data-indeterminate');
        });

        it('should not have aria-valuenow when indeterminate', () => {
            // Given: Indeterminate ProgressCircle
            render(
                <ProgressCircle isIndeterminate aria-label="Loading" />
            );

            // Then: Does not have aria-valuenow
            const progress = screen.getByRole('progressbar');
            expect(progress).not.toHaveAttribute('aria-valuenow');
        });

        it('should default to indeterminate when no value provided', () => {
            // Given: ProgressCircle without value
            const { container } = render(
                <ProgressCircle aria-label="Loading" />
            );

            // Then: Is indeterminate
            const wrapper = container.firstChild;
            expect(wrapper).toHaveAttribute('data-indeterminate');
        });
    });

    describe('determinate mode', () => {
        it('should show progress with aria-valuenow', () => {
            // Given: Determinate ProgressCircle with value
            render(
                <ProgressCircle value={75} aria-label="Progress" />
            );

            // Then: Has aria-valuenow
            const progress = screen.getByRole('progressbar');
            expect(progress).toHaveAttribute('aria-valuenow', '75');
        });

        it('should clamp value to 0-100 range', () => {
            // Given: ProgressCircle with value > 100
            render(
                <ProgressCircle value={150} aria-label="Over 100" />
            );

            // Then: Value is clamped to 100
            const progress = screen.getByRole('progressbar');
            expect(progress).toHaveAttribute('aria-valuenow', '100');
        });

        it('should handle value of 0', () => {
            // Given: ProgressCircle with value 0
            render(
                <ProgressCircle value={0} aria-label="Zero progress" />
            );

            // Then: Has aria-valuenow of 0
            const progress = screen.getByRole('progressbar');
            expect(progress).toHaveAttribute('aria-valuenow', '0');
        });

        it('should handle value of 100', () => {
            // Given: ProgressCircle with value 100
            render(
                <ProgressCircle value={100} aria-label="Complete" />
            );

            // Then: Has aria-valuenow of 100
            const progress = screen.getByRole('progressbar');
            expect(progress).toHaveAttribute('aria-valuenow', '100');
        });

        it('should not have indeterminate attribute when value is provided', () => {
            // Given: ProgressCircle with value
            const { container } = render(
                <ProgressCircle value={50} aria-label="Half done" />
            );

            // Then: Does not have indeterminate attribute
            const wrapper = container.firstChild;
            expect(wrapper).not.toHaveAttribute('data-indeterminate');
        });
    });

    describe('CSS Module styling', () => {
        it('should apply base CSS Module class', () => {
            // Given: ProgressCircle component
            const { container } = render(
                <ProgressCircle aria-label="Styled" />
            );

            // Then: Has CSS Module class
            const wrapper = container.firstChild;
            expect(wrapper).toHaveClass('progressCircle');
        });
    });

    describe('React DevTools', () => {
        it('should have displayName set for DevTools', () => {
            // Then: Component has displayName
            expect(ProgressCircle.displayName).toBe('ProgressCircle');
        });
    });

    describe('ref forwarding', () => {
        it('should forward ref to wrapper element', () => {
            // Given: Ref object
            const ref = React.createRef<HTMLDivElement>();

            // When: Render with ref
            render(
                <ProgressCircle ref={ref} aria-label="Ref test" />
            );

            // Then: Ref points to wrapper element
            expect(ref.current).toBeInstanceOf(HTMLDivElement);
        });
    });
});
