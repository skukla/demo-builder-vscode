/**
 * ProgressBar Component Tests
 *
 * Tests the ProgressBar form component built with React Aria
 * for accessibility and CSS Modules for styling.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProgressBar } from '@/core/ui/components/aria/forms';

describe('ProgressBar', () => {
    describe('value rendering', () => {
        it('should render with value', () => {
            // Given: ProgressBar with value
            const { container } = render(
                <ProgressBar value={50} maxValue={100} aria-label="Loading" />
            );

            // Then: Progress bar shows 50% filled
            const fill = container.querySelector('[class*="fill"]');
            expect(fill).toHaveStyle({ width: '50%' });
        });

        it('should calculate percentage correctly', () => {
            // Given: ProgressBar with custom max value
            const { container } = render(
                <ProgressBar value={25} maxValue={50} aria-label="Loading" />
            );

            // Then: Shows 50% (25/50)
            const fill = container.querySelector('[class*="fill"]');
            expect(fill).toHaveStyle({ width: '50%' });
        });
    });

    describe('label', () => {
        it('should display label', () => {
            // Given: ProgressBar with label
            render(<ProgressBar value={50} label="Loading..." />);

            // Then: Label is visible
            expect(screen.getByText('Loading...')).toBeInTheDocument();
        });
    });

    describe('isIndeterminate', () => {
        it('should support isIndeterminate', () => {
            // Given: Indeterminate ProgressBar
            const { container } = render(
                <ProgressBar isIndeterminate aria-label="Loading" />
            );

            // Then: Has indeterminate styling
            const progressBar = container.querySelector('[class*="progressBar"]');
            expect(progressBar).toHaveAttribute('data-indeterminate');
        });
    });

    describe('size variants', () => {
        it('should support size="S"', () => {
            // Given: Small ProgressBar
            const { container } = render(
                <ProgressBar value={50} size="S" aria-label="Loading" />
            );

            // Then: Has small size attribute
            const progressBar = container.querySelector('[class*="progressBar"]');
            expect(progressBar).toHaveAttribute('data-size', 'S');
        });

        it('should support size="M"', () => {
            // Given: Medium ProgressBar
            const { container } = render(
                <ProgressBar value={50} size="M" aria-label="Loading" />
            );

            // Then: Has medium size attribute
            const progressBar = container.querySelector('[class*="progressBar"]');
            expect(progressBar).toHaveAttribute('data-size', 'M');
        });

        it('should support size="L"', () => {
            // Given: Large ProgressBar
            const { container } = render(
                <ProgressBar value={50} size="L" aria-label="Loading" />
            );

            // Then: Has large size attribute
            const progressBar = container.querySelector('[class*="progressBar"]');
            expect(progressBar).toHaveAttribute('data-size', 'L');
        });
    });

    describe('accessibility', () => {
        it('should have progressbar role', () => {
            // Given: ProgressBar component
            render(<ProgressBar value={50} aria-label="Progress" />);

            // Then: Has progressbar role
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('should have correct aria-valuenow', () => {
            // Given: ProgressBar with value
            render(<ProgressBar value={75} aria-label="Progress" />);

            // Then: Has correct aria-valuenow
            const progressbar = screen.getByRole('progressbar');
            expect(progressbar).toHaveAttribute('aria-valuenow', '75');
        });
    });

    describe('displayName', () => {
        it('should have displayName set for DevTools', () => {
            // Then: Component has displayName
            expect(ProgressBar.displayName).toBe('ProgressBar');
        });
    });
});
