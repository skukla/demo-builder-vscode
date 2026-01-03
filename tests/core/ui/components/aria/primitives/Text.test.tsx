/**
 * Text Component Tests
 *
 * Tests the Text primitive component that renders text content
 * with CSS Module styling and Spectrum-compatible class props.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Text } from '@/core/ui/components/aria/primitives';

describe('Text', () => {
    describe('children rendering', () => {
        it('should render children correctly', () => {
            // Given: Text component with string children
            // When: Component renders
            render(<Text>Hello World</Text>);

            // Then: Children are visible
            expect(screen.getByText('Hello World')).toBeInTheDocument();
        });

        it('should render complex children', () => {
            // Given: Text component with nested elements
            render(
                <Text>
                    <strong>Bold</strong> and <em>italic</em>
                </Text>
            );

            // Then: All nested content is visible
            expect(screen.getByText('Bold')).toBeInTheDocument();
            expect(screen.getByText('italic')).toBeInTheDocument();
        });
    });

    describe('element rendering', () => {
        it('should render as span by default', () => {
            // Given: Text component without elementType prop
            // When: Component renders
            const { container } = render(<Text>Default span</Text>);

            // Then: Renders as span element
            const span = container.querySelector('span');
            expect(span).toBeInTheDocument();
            expect(span).toHaveTextContent('Default span');
        });

        it('should render as specified elementType', () => {
            // Given: Text component with elementType="p"
            const { container } = render(
                <Text elementType="p">Paragraph text</Text>
            );

            // Then: Renders as p element
            const paragraph = container.querySelector('p');
            expect(paragraph).toBeInTheDocument();
            expect(paragraph).toHaveTextContent('Paragraph text');
        });
    });

    describe('CSS Module classes', () => {
        it('should apply CSS Module classes (scoped class names)', () => {
            // Given: Text component
            // When: Component renders
            const { container } = render(<Text>Styled text</Text>);

            // Then: Has the base CSS module class
            // Note: styleMock returns the class name as-is
            const span = container.querySelector('span');
            expect(span).toHaveClass('text');
        });
    });

    describe('className prop', () => {
        it('should pass className prop to element', () => {
            // Given: Text with custom className
            const { container } = render(
                <Text className="custom-class">Custom styled</Text>
            );

            // Then: Custom class is applied
            const span = container.querySelector('span');
            expect(span).toHaveClass('custom-class');
        });

        it('should merge className with CSS Module classes', () => {
            // Given: Text with custom className
            const { container } = render(
                <Text className="my-class">Merged styles</Text>
            );

            // Then: Both classes are applied
            const span = container.querySelector('span');
            expect(span).toHaveClass('text');
            expect(span).toHaveClass('my-class');
        });
    });

    describe('React DevTools', () => {
        it('should have displayName set for DevTools', () => {
            // Then: Component has displayName
            expect(Text.displayName).toBe('Text');
        });
    });

    describe('ref forwarding', () => {
        it('should forward ref to underlying element', () => {
            // Given: Ref object
            const ref = React.createRef<HTMLSpanElement>();

            // When: Render with ref
            render(<Text ref={ref}>Ref test</Text>);

            // Then: Ref points to span element
            expect(ref.current).toBeInstanceOf(HTMLSpanElement);
            expect(ref.current?.textContent).toBe('Ref test');
        });
    });

    describe('edge cases', () => {
        it('should handle undefined className gracefully', () => {
            // Given: Text with explicit undefined className
            const { container } = render(
                <Text className={undefined}>Undefined class</Text>
            );

            // Then: Renders correctly with only base class
            const span = container.querySelector('span');
            expect(span).toHaveClass('text');
        });

        it('should render with no optional props', () => {
            // Given: Text with only required children
            const { container } = render(<Text>Minimal</Text>);

            // Then: Renders correctly
            const span = container.querySelector('span');
            expect(span).toBeInTheDocument();
            expect(span).toHaveClass('text');
        });

        it('should render with empty string className', () => {
            // Given: Text with empty string className
            const { container } = render(
                <Text className="">Empty class</Text>
            );

            // Then: Renders correctly
            const span = container.querySelector('span');
            expect(span).toBeInTheDocument();
        });
    });
});
