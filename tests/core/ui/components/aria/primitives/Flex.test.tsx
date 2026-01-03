/**
 * Flex Component Tests
 *
 * Tests the Flex primitive component that provides flexbox layout
 * with CSS Module styling and Spectrum-compatible dimension props.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Flex } from '@/core/ui/components/aria/primitives';

describe('Flex', () => {
    describe('element rendering', () => {
        it('should render as div', () => {
            // Given: Flex component
            // When: Component renders
            const { container } = render(
                <Flex>
                    <span>Child content</span>
                </Flex>
            );

            // Then: Renders as div element
            const div = container.querySelector('div');
            expect(div).toBeInTheDocument();
        });

        it('should render children', () => {
            // Given: Flex with children
            render(
                <Flex>
                    <span>First</span>
                    <span>Second</span>
                </Flex>
            );

            // Then: All children are visible
            expect(screen.getByText('First')).toBeInTheDocument();
            expect(screen.getByText('Second')).toBeInTheDocument();
        });
    });

    describe('flexbox styles', () => {
        it('should apply flexbox styles by default (display: flex)', () => {
            // Given: Flex component
            // When: Component renders
            const { container } = render(<Flex>Content</Flex>);

            // Then: Has display: flex
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ display: 'flex' });
        });
    });

    describe('direction prop', () => {
        it('should support direction prop with column value', () => {
            // Given: Flex with direction="column"
            const { container } = render(
                <Flex direction="column">Column content</Flex>
            );

            // Then: Has flex-direction: column
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ flexDirection: 'column' });
        });

        it('should support direction prop with row value', () => {
            // Given: Flex with direction="row"
            const { container } = render(
                <Flex direction="row">Row content</Flex>
            );

            // Then: Has flex-direction: row
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ flexDirection: 'row' });
        });

        it('should default to row direction', () => {
            // Given: Flex without direction prop
            const { container } = render(<Flex>Default row</Flex>);

            // Then: Has flex-direction: row (default)
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ flexDirection: 'row' });
        });
    });

    describe('gap prop', () => {
        it('should support gap prop with Spectrum tokens (size-100 -> 8px)', () => {
            // Given: Flex with gap="size-100"
            const { container } = render(
                <Flex gap="size-100">Gap content</Flex>
            );

            // Then: Has gap: 8px (size-100 = 8px)
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ gap: '8px' });
        });

        it('should support gap prop with size-200 token (16px)', () => {
            // Given: Flex with gap="size-200"
            const { container } = render(
                <Flex gap="size-200">Gap content</Flex>
            );

            // Then: Has gap: 16px
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ gap: '16px' });
        });

        it('should support gap prop with size-300 token (24px)', () => {
            // Given: Flex with gap="size-300"
            const { container } = render(
                <Flex gap="size-300">Gap content</Flex>
            );

            // Then: Has gap: 24px
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ gap: '24px' });
        });

        it('should support gap prop with numeric value', () => {
            // Given: Flex with numeric gap
            const { container } = render(
                <Flex gap={12}>Numeric gap</Flex>
            );

            // Then: Has gap in pixels
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ gap: '12px' });
        });
    });

    describe('alignItems prop', () => {
        it('should support alignItems prop', () => {
            // Given: Flex with alignItems="center"
            const { container } = render(
                <Flex alignItems="center">Aligned content</Flex>
            );

            // Then: Has align-items: center
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ alignItems: 'center' });
        });

        it('should support alignItems="start"', () => {
            const { container } = render(
                <Flex alignItems="start">Start aligned</Flex>
            );
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ alignItems: 'start' });
        });

        it('should support alignItems="end"', () => {
            const { container } = render(
                <Flex alignItems="end">End aligned</Flex>
            );
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ alignItems: 'end' });
        });
    });

    describe('justifyContent prop', () => {
        it('should support justifyContent prop', () => {
            // Given: Flex with justifyContent="space-between"
            const { container } = render(
                <Flex justifyContent="space-between">Justified content</Flex>
            );

            // Then: Has justify-content: space-between
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ justifyContent: 'space-between' });
        });

        it('should support justifyContent="center"', () => {
            const { container } = render(
                <Flex justifyContent="center">Centered</Flex>
            );
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ justifyContent: 'center' });
        });
    });

    describe('flex prop (flex-grow)', () => {
        it('should support flex prop for flex-grow', () => {
            // Given: Flex with flex prop
            const { container } = render(
                <Flex flex={1}>Flexible content</Flex>
            );

            // Then: Has flex: 1
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ flex: '1' });
        });

        it('should support flex prop with different values', () => {
            const { container } = render(
                <Flex flex={2}>Flex 2</Flex>
            );
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ flex: '2' });
        });
    });

    describe('margin props', () => {
        it('should support marginTop prop', () => {
            // Given: Flex with marginTop
            const { container } = render(
                <Flex marginTop="size-200">Top margin</Flex>
            );

            // Then: Has margin-top: 16px
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ marginTop: '16px' });
        });

        it('should support marginBottom prop', () => {
            // Given: Flex with marginBottom
            const { container } = render(
                <Flex marginBottom="size-300">Bottom margin</Flex>
            );

            // Then: Has margin-bottom: 24px
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ marginBottom: '24px' });
        });

        it('should support numeric margin values', () => {
            const { container } = render(
                <Flex marginTop={16} marginBottom={24}>Numeric margins</Flex>
            );
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ marginTop: '16px' });
            expect(div).toHaveStyle({ marginBottom: '24px' });
        });
    });

    describe('wrap prop', () => {
        it('should support wrap prop', () => {
            // Given: Flex with wrap
            const { container } = render(
                <Flex wrap>Wrapping content</Flex>
            );

            // Then: Has flex-wrap: wrap
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ flexWrap: 'wrap' });
        });
    });

    describe('CSS Module classes', () => {
        it('should apply CSS Module classes', () => {
            // Given: Flex component
            const { container } = render(<Flex>Styled flex</Flex>);

            // Then: Has the base CSS module class
            const div = container.querySelector('div');
            expect(div).toHaveClass('flex');
        });
    });

    describe('className prop', () => {
        it('should pass className prop to element', () => {
            // Given: Flex with custom className
            const { container } = render(
                <Flex className="custom-flex">Custom</Flex>
            );

            // Then: Custom class is applied
            const div = container.querySelector('div');
            expect(div).toHaveClass('custom-flex');
            expect(div).toHaveClass('flex');
        });
    });

    describe('React DevTools', () => {
        it('should have displayName set for DevTools', () => {
            expect(Flex.displayName).toBe('Flex');
        });
    });

    describe('ref forwarding', () => {
        it('should forward ref to underlying element', () => {
            // Given: Ref object
            const ref = React.createRef<HTMLDivElement>();

            // When: Render with ref
            render(<Flex ref={ref}>Ref flex</Flex>);

            // Then: Ref points to div element
            expect(ref.current).toBeInstanceOf(HTMLDivElement);
        });
    });

    describe('edge cases', () => {
        it('should render without optional dimension props', () => {
            // Given: Flex with no gap, margins, or other optional props
            const { container } = render(
                <Flex>Minimal flex</Flex>
            );

            // Then: Renders correctly with defaults
            const div = container.querySelector('div');
            expect(div).toBeInTheDocument();
            expect(div).toHaveStyle({ display: 'flex', flexDirection: 'row' });
        });

        it('should handle undefined gap gracefully', () => {
            // Given: Flex with explicit undefined gap
            const { container } = render(
                <Flex gap={undefined}>No gap</Flex>
            );

            // Then: Renders without gap style
            const div = container.querySelector('div');
            expect(div).toBeInTheDocument();
        });

        it('should handle undefined alignItems and justifyContent', () => {
            // Given: Flex with explicit undefined alignment props
            const { container } = render(
                <Flex alignItems={undefined} justifyContent={undefined}>
                    No alignment
                </Flex>
            );

            // Then: Renders correctly
            const div = container.querySelector('div');
            expect(div).toBeInTheDocument();
        });

        it('should handle wrap=false explicitly', () => {
            // Given: Flex with explicit wrap=false
            const { container } = render(
                <Flex wrap={false}>No wrap</Flex>
            );

            // Then: No flex-wrap style applied
            const div = container.querySelector('div');
            expect(div?.style.flexWrap).toBe('');
        });
    });
});
