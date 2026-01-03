/**
 * View Component Tests
 *
 * Tests the View primitive component that renders a generic container div
 * with CSS Module styling and Spectrum-compatible margin props.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { View } from '@/core/ui/components/aria/primitives';

describe('View', () => {
    describe('element rendering', () => {
        it('should render as div', () => {
            // Given: View component
            // When: Component renders
            const { container } = render(
                <View>
                    <span>Content</span>
                </View>
            );

            // Then: Renders as div element
            const div = container.querySelector('div');
            expect(div).toBeInTheDocument();
        });

        it('should render children', () => {
            // Given: View with children
            render(
                <View>
                    <p>Paragraph content</p>
                    <span>Span content</span>
                </View>
            );

            // Then: All children are visible
            expect(screen.getByText('Paragraph content')).toBeInTheDocument();
            expect(screen.getByText('Span content')).toBeInTheDocument();
        });
    });

    describe('margin props', () => {
        it('should apply marginTop with Spectrum token', () => {
            // Given: View with marginTop
            const { container } = render(
                <View marginTop="size-200">Top margin</View>
            );

            // Then: margin-top style is applied
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ marginTop: '16px' });
        });

        it('should apply marginBottom with Spectrum token', () => {
            // Given: View with marginBottom
            const { container } = render(
                <View marginBottom="size-300">Bottom margin</View>
            );

            // Then: margin-bottom style is applied
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ marginBottom: '24px' });
        });

        it('should apply marginStart with Spectrum token', () => {
            // Given: View with marginStart
            const { container } = render(
                <View marginStart="size-100">Start margin</View>
            );

            // Then: margin-left style is applied (LTR)
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ marginLeft: '8px' });
        });

        it('should apply marginEnd with Spectrum token', () => {
            // Given: View with marginEnd
            const { container } = render(
                <View marginEnd="size-100">End margin</View>
            );

            // Then: margin-right style is applied (LTR)
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ marginRight: '8px' });
        });

        it('should apply multiple margin props', () => {
            // Given: View with multiple margins
            const { container } = render(
                <View
                    marginTop="size-100"
                    marginBottom="size-200"
                    marginStart="size-300"
                    marginEnd="size-400"
                >
                    All margins
                </View>
            );

            // Then: All margin styles are applied
            const div = container.querySelector('div');
            expect(div).toHaveStyle({
                marginTop: '8px',
                marginBottom: '16px',
                marginLeft: '24px',
                marginRight: '32px'
            });
        });

        it('should apply margin props with numeric values', () => {
            // Given: View with numeric margins
            const { container } = render(
                <View marginTop={10} marginBottom={20}>
                    Numeric margins
                </View>
            );

            // Then: margin styles are applied with px
            const div = container.querySelector('div');
            expect(div).toHaveStyle({
                marginTop: '10px',
                marginBottom: '20px'
            });
        });
    });

    describe('padding props', () => {
        it('should apply padding with Spectrum token', () => {
            // Given: View with padding
            const { container } = render(
                <View padding="size-200">Padded content</View>
            );

            // Then: padding style is applied
            const div = container.querySelector('div');
            expect(div).toHaveStyle({ padding: '16px' });
        });
    });

    describe('CSS Module classes', () => {
        it('should apply CSS Module classes', () => {
            // Given: View component
            const { container } = render(<View>Styled view</View>);

            // Then: Has the base CSS module class
            const div = container.querySelector('div');
            expect(div).toHaveClass('view');
        });
    });

    describe('className prop', () => {
        it('should pass className prop to element', () => {
            // Given: View with custom className
            const { container } = render(
                <View className="custom-view">Custom</View>
            );

            // Then: Custom class is applied
            const div = container.querySelector('div');
            expect(div).toHaveClass('custom-view');
            expect(div).toHaveClass('view');
        });
    });

    describe('React DevTools', () => {
        it('should have displayName set for DevTools', () => {
            expect(View.displayName).toBe('View');
        });
    });

    describe('ref forwarding', () => {
        it('should forward ref to underlying element', () => {
            // Given: Ref object
            const ref = React.createRef<HTMLDivElement>();

            // When: Render with ref
            render(<View ref={ref}>Ref view</View>);

            // Then: Ref points to div element
            expect(ref.current).toBeInstanceOf(HTMLDivElement);
        });
    });
});
