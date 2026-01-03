/**
 * Divider Component Tests
 *
 * Tests the Divider primitive component that renders a horizontal rule
 * with CSS Module styling and proper accessibility role.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Divider } from '@/core/ui/components/aria/primitives';

describe('Divider', () => {
    describe('element rendering', () => {
        it('should render as hr element', () => {
            // Given: Divider component
            // When: Component renders
            const { container } = render(<Divider />);

            // Then: Renders as hr element
            const hr = container.querySelector('hr');
            expect(hr).toBeInTheDocument();
        });
    });

    describe('size styling', () => {
        it('should apply size S styling', () => {
            // Given: Divider with size="S"
            const { container } = render(<Divider size="S" />);

            // Then: Has size-S class for thin divider
            const hr = container.querySelector('hr');
            expect(hr).toHaveClass('sizeS');
        });

        it('should apply size M styling (default)', () => {
            // Given: Divider without size prop
            const { container } = render(<Divider />);

            // Then: Has size-M class (default)
            const hr = container.querySelector('hr');
            expect(hr).toHaveClass('sizeM');
        });

        it('should apply size L styling', () => {
            // Given: Divider with size="L"
            const { container } = render(<Divider size="L" />);

            // Then: Has size-L class for thick divider
            const hr = container.querySelector('hr');
            expect(hr).toHaveClass('sizeL');
        });
    });

    describe('marginBottom prop', () => {
        it('should support marginBottom prop with Spectrum token', () => {
            // Given: Divider with marginBottom
            const { container } = render(
                <Divider marginBottom="size-200" />
            );

            // Then: margin-bottom style is applied
            const hr = container.querySelector('hr');
            expect(hr).toHaveStyle({ marginBottom: '16px' });
        });

        it('should support marginBottom with size-300 token', () => {
            // Given: Divider with marginBottom
            const { container } = render(
                <Divider marginBottom="size-300" />
            );

            // Then: margin-bottom style is applied
            const hr = container.querySelector('hr');
            expect(hr).toHaveStyle({ marginBottom: '24px' });
        });

        it('should support marginBottom with numeric value', () => {
            // Given: Divider with numeric marginBottom
            const { container } = render(
                <Divider marginBottom={32} />
            );

            // Then: margin-bottom style is applied
            const hr = container.querySelector('hr');
            expect(hr).toHaveStyle({ marginBottom: '32px' });
        });

        it('should not apply marginBottom when not specified', () => {
            // Given: Divider without marginBottom
            const { container } = render(<Divider />);

            // Then: No inline marginBottom style
            const hr = container.querySelector('hr');
            expect(hr?.style.marginBottom).toBe('');
        });
    });

    describe('marginTop prop', () => {
        it('should support marginTop prop', () => {
            // Given: Divider with marginTop
            const { container } = render(
                <Divider marginTop="size-200" />
            );

            // Then: margin-top style is applied
            const hr = container.querySelector('hr');
            expect(hr).toHaveStyle({ marginTop: '16px' });
        });
    });

    describe('accessibility', () => {
        it('should have correct accessibility role (separator)', () => {
            // Given: Divider component
            // When: Component renders
            render(<Divider />);

            // Then: Has separator role (hr element default)
            const separator = screen.getByRole('separator');
            expect(separator).toBeInTheDocument();
        });

        it('should support aria-orientation', () => {
            // Given: Divider with horizontal orientation (default)
            render(<Divider />);

            // Then: Has separator role
            // Note: hr elements have implicit horizontal orientation
            const separator = screen.getByRole('separator');
            expect(separator).toBeInTheDocument();
        });
    });

    describe('CSS Module classes', () => {
        it('should apply CSS Module classes', () => {
            // Given: Divider component
            const { container } = render(<Divider />);

            // Then: Has the base CSS module class
            const hr = container.querySelector('hr');
            expect(hr).toHaveClass('divider');
        });
    });

    describe('className prop', () => {
        it('should pass className prop to element', () => {
            // Given: Divider with custom className
            const { container } = render(
                <Divider className="custom-divider" />
            );

            // Then: Custom class is applied
            const hr = container.querySelector('hr');
            expect(hr).toHaveClass('custom-divider');
            expect(hr).toHaveClass('divider');
        });
    });

    describe('React DevTools', () => {
        it('should have displayName set for DevTools', () => {
            expect(Divider.displayName).toBe('Divider');
        });
    });

    describe('ref forwarding', () => {
        it('should forward ref to underlying element', () => {
            // Given: Ref object
            const ref = React.createRef<HTMLHRElement>();

            // When: Render with ref
            render(<Divider ref={ref} />);

            // Then: Ref points to hr element
            expect(ref.current).toBeInstanceOf(HTMLHRElement);
        });
    });
});
