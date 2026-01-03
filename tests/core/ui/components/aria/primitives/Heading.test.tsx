/**
 * Heading Component Tests
 *
 * Tests the Heading primitive component that renders semantic headings (h1-h6)
 * with CSS Module styling and Spectrum-compatible props.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Heading } from '@/core/ui/components/aria/primitives';

describe('Heading', () => {
    describe('heading levels', () => {
        it('should render with correct level h1', () => {
            // Given: Heading with level 1
            // When: Component renders
            render(<Heading level={1}>Main Title</Heading>);

            // Then: Renders as h1 element
            const heading = screen.getByRole('heading', { level: 1 });
            expect(heading).toBeInTheDocument();
            expect(heading.tagName).toBe('H1');
            expect(heading).toHaveTextContent('Main Title');
        });

        it('should render with correct level h2', () => {
            // Given: Heading with level 2
            render(<Heading level={2}>Section Title</Heading>);

            // Then: Renders as h2 element
            const heading = screen.getByRole('heading', { level: 2 });
            expect(heading).toBeInTheDocument();
            expect(heading.tagName).toBe('H2');
        });

        it('should render with correct level h3', () => {
            render(<Heading level={3}>Subsection</Heading>);
            const heading = screen.getByRole('heading', { level: 3 });
            expect(heading.tagName).toBe('H3');
        });

        it('should render with correct level h4', () => {
            render(<Heading level={4}>Minor Section</Heading>);
            const heading = screen.getByRole('heading', { level: 4 });
            expect(heading.tagName).toBe('H4');
        });

        it('should render with correct level h5', () => {
            render(<Heading level={5}>Small Title</Heading>);
            const heading = screen.getByRole('heading', { level: 5 });
            expect(heading.tagName).toBe('H5');
        });

        it('should render with correct level h6', () => {
            render(<Heading level={6}>Smallest Title</Heading>);
            const heading = screen.getByRole('heading', { level: 6 });
            expect(heading.tagName).toBe('H6');
        });
    });

    describe('default level', () => {
        it('should default to h2 when level omitted', () => {
            // Given: Heading without level prop
            // When: Component renders
            render(<Heading>Default Heading</Heading>);

            // Then: Renders as h2 element (Spectrum default)
            const heading = screen.getByRole('heading', { level: 2 });
            expect(heading).toBeInTheDocument();
            expect(heading.tagName).toBe('H2');
        });
    });

    describe('marginBottom prop', () => {
        it('should apply marginBottom from Spectrum-style prop', () => {
            // Given: Heading with marginBottom
            // When: Component renders
            const { container } = render(
                <Heading marginBottom="size-200">Spaced Heading</Heading>
            );

            // Then: marginBottom style is applied (size-200 = 16px)
            const heading = container.querySelector('h2');
            expect(heading).toHaveStyle({ marginBottom: '16px' });
        });

        it('should apply marginBottom with pixel value', () => {
            // Given: Heading with pixel marginBottom
            const { container } = render(
                <Heading marginBottom={24}>Pixel Margin</Heading>
            );

            // Then: marginBottom style is applied
            const heading = container.querySelector('h2');
            expect(heading).toHaveStyle({ marginBottom: '24px' });
        });

        it('should not apply marginBottom when not specified', () => {
            // Given: Heading without marginBottom
            const { container } = render(
                <Heading>No Margin</Heading>
            );

            // Then: No inline marginBottom style
            const heading = container.querySelector('h2');
            expect(heading?.style.marginBottom).toBe('');
        });
    });

    describe('CSS Module classes', () => {
        it('should apply CSS Module classes', () => {
            // Given: Heading component
            const { container } = render(<Heading>Styled Heading</Heading>);

            // Then: Has the base CSS module class
            const heading = container.querySelector('h2');
            expect(heading).toHaveClass('heading');
        });
    });

    describe('className prop', () => {
        it('should pass className prop to element', () => {
            // Given: Heading with custom className
            const { container } = render(
                <Heading className="custom-heading">Custom</Heading>
            );

            // Then: Custom class is applied
            const heading = container.querySelector('h2');
            expect(heading).toHaveClass('custom-heading');
            expect(heading).toHaveClass('heading');
        });
    });

    describe('React DevTools', () => {
        it('should have displayName set for DevTools', () => {
            expect(Heading.displayName).toBe('Heading');
        });
    });

    describe('ref forwarding', () => {
        it('should forward ref to underlying element', () => {
            // Given: Ref object
            const ref = React.createRef<HTMLHeadingElement>();

            // When: Render with ref
            render(<Heading ref={ref}>Ref Heading</Heading>);

            // Then: Ref points to heading element
            expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
            expect(ref.current?.tagName).toBe('H2');
        });
    });
});
