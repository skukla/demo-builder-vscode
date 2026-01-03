/**
 * Button Component Tests
 *
 * Tests the Button interactive component built with React Aria
 * for accessibility and CSS Modules for styling.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Button } from '@/core/ui/components/aria/interactive';

describe('Button', () => {
    describe('children rendering', () => {
        it('should render children correctly', () => {
            // Given: Button with text children
            // When: Component renders
            render(<Button>Click Me</Button>);

            // Then: Children are visible
            expect(screen.getByRole('button', { name: 'Click Me' })).toBeInTheDocument();
        });

        it('should render complex children', () => {
            // Given: Button with icon and text
            render(
                <Button>
                    <span data-testid="icon">Icon</span>
                    <span>Label</span>
                </Button>
            );

            // Then: All children are rendered
            expect(screen.getByTestId('icon')).toBeInTheDocument();
            expect(screen.getByText('Label')).toBeInTheDocument();
        });
    });

    describe('onPress callback', () => {
        it('should handle onPress callback on click', () => {
            // Given: Button with onPress handler
            const onPressMock = jest.fn();
            render(<Button onPress={onPressMock}>Press Me</Button>);

            // When: Button is clicked
            fireEvent.click(screen.getByRole('button'));

            // Then: Handler is called
            expect(onPressMock).toHaveBeenCalledTimes(1);
        });

        it('should handle keyboard activation with Enter key', () => {
            // Given: Button with onPress handler
            const onPressMock = jest.fn();
            render(<Button onPress={onPressMock}>Enter Key</Button>);

            // When: Enter key is pressed on focused button
            const button = screen.getByRole('button');
            fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
            fireEvent.keyUp(button, { key: 'Enter', code: 'Enter' });

            // Then: Handler is called
            expect(onPressMock).toHaveBeenCalledTimes(1);
        });

        it('should handle keyboard activation with Space key', () => {
            // Given: Button with onPress handler
            const onPressMock = jest.fn();
            render(<Button onPress={onPressMock}>Space Key</Button>);

            // When: Space key is pressed on focused button
            const button = screen.getByRole('button');
            fireEvent.keyDown(button, { key: ' ', code: 'Space' });
            fireEvent.keyUp(button, { key: ' ', code: 'Space' });

            // Then: Handler is called
            expect(onPressMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('variants', () => {
        it('should support variant="accent" (primary action)', () => {
            // Given: Button with accent variant
            const { container } = render(
                <Button variant="accent">Accent</Button>
            );

            // Then: Button has accent variant attribute
            const button = container.querySelector('button');
            expect(button).toHaveAttribute('data-variant', 'accent');
        });

        it('should support variant="secondary"', () => {
            // Given: Button with secondary variant
            const { container } = render(
                <Button variant="secondary">Secondary</Button>
            );

            // Then: Button has secondary variant attribute
            const button = container.querySelector('button');
            expect(button).toHaveAttribute('data-variant', 'secondary');
        });

        it('should support variant="cta"', () => {
            // Given: Button with CTA variant
            const { container } = render(
                <Button variant="cta">Call to Action</Button>
            );

            // Then: Button has cta variant attribute
            const button = container.querySelector('button');
            expect(button).toHaveAttribute('data-variant', 'cta');
        });

        it('should support variant="negative"', () => {
            // Given: Button with negative variant
            const { container } = render(
                <Button variant="negative">Delete</Button>
            );

            // Then: Button has negative variant attribute
            const button = container.querySelector('button');
            expect(button).toHaveAttribute('data-variant', 'negative');
        });
    });

    describe('isDisabled prop', () => {
        it('should support isDisabled prop', () => {
            // Given: Button with isDisabled
            render(<Button isDisabled>Disabled</Button>);

            // Then: Button is disabled
            const button = screen.getByRole('button');
            expect(button).toBeDisabled();
        });

        it('should not fire onPress when isDisabled', () => {
            // Given: Disabled button with onPress handler
            const onPressMock = jest.fn();
            render(
                <Button isDisabled onPress={onPressMock}>
                    Disabled Click
                </Button>
            );

            // When: Attempting to click disabled button
            fireEvent.click(screen.getByRole('button'));

            // Then: Handler is NOT called
            expect(onPressMock).not.toHaveBeenCalled();
        });
    });

    describe('isQuiet variant', () => {
        it('should support isQuiet prop', () => {
            // Given: Button with isQuiet
            const { container } = render(<Button isQuiet>Quiet</Button>);

            // Then: Button has quiet data attribute
            const button = container.querySelector('button');
            expect(button).toHaveAttribute('data-quiet');
        });

        it('should combine isQuiet with variant', () => {
            // Given: Button with both isQuiet and variant
            const { container } = render(
                <Button isQuiet variant="accent">
                    Quiet Accent
                </Button>
            );

            // Then: Button has both attributes
            const button = container.querySelector('button');
            expect(button).toHaveAttribute('data-quiet');
            expect(button).toHaveAttribute('data-variant', 'accent');
        });
    });

    describe('margin props', () => {
        it('should support marginTop prop', () => {
            // Given: Button with marginTop
            const { container } = render(
                <Button marginTop="size-200">Margin Top</Button>
            );

            // Then: Button has marginTop style
            const button = container.querySelector('button');
            expect(button).toHaveStyle({ marginTop: '16px' });
        });

        it('should support marginBottom prop', () => {
            // Given: Button with marginBottom
            const { container } = render(
                <Button marginBottom="size-300">Margin Bottom</Button>
            );

            // Then: Button has marginBottom style
            const button = container.querySelector('button');
            expect(button).toHaveStyle({ marginBottom: '24px' });
        });

        it('should support numeric margin values', () => {
            // Given: Button with numeric margin
            const { container } = render(
                <Button marginTop={12}>Numeric Margin</Button>
            );

            // Then: Button has correct marginTop
            const button = container.querySelector('button');
            expect(button).toHaveStyle({ marginTop: '12px' });
        });
    });

    describe('accessibility', () => {
        it('should have correct accessibility attributes', () => {
            // Given: Button component
            render(<Button>Accessible Button</Button>);

            // Then: Button has correct ARIA role
            const button = screen.getByRole('button', { name: 'Accessible Button' });
            expect(button).toBeInTheDocument();
            expect(button.tagName.toLowerCase()).toBe('button');
        });

        it('should support aria-label for icon-only buttons', () => {
            // Given: Button with aria-label
            render(
                <Button aria-label="Close dialog">
                    <span aria-hidden="true">X</span>
                </Button>
            );

            // Then: Button is accessible by label
            expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
        });
    });

    describe('focus behavior', () => {
        it('should show focus ring on focus', () => {
            // Given: Button component
            const { container } = render(<Button>Focus Test</Button>);
            const button = container.querySelector('button');

            // When: Button receives focus
            button?.focus();

            // Then: Button has focus-visible data attribute (React Aria pattern)
            // Note: In real browser, focus-visible is shown; in JSDOM we verify focusability
            expect(document.activeElement).toBe(button);
        });

        it('should be focusable', () => {
            // Given: Button component
            render(<Button>Focusable</Button>);
            const button = screen.getByRole('button');

            // When: Tab focus
            button.focus();

            // Then: Button is focused
            expect(button).toHaveFocus();
        });

        it('should not be focusable when disabled', () => {
            // Given: Disabled button
            render(<Button isDisabled>Not Focusable</Button>);
            const button = screen.getByRole('button');

            // Then: Button is not focusable (tabIndex is -1 or element is disabled)
            expect(button).toBeDisabled();
        });
    });

    describe('React DevTools', () => {
        it('should have displayName set for DevTools', () => {
            // Then: Component has displayName
            expect(Button.displayName).toBe('Button');
        });
    });

    describe('ref forwarding', () => {
        it('should forward ref to underlying button element', () => {
            // Given: Ref object
            const ref = React.createRef<HTMLButtonElement>();

            // When: Render with ref
            render(<Button ref={ref}>Ref Test</Button>);

            // Then: Ref points to button element
            expect(ref.current).toBeInstanceOf(HTMLButtonElement);
            expect(ref.current?.textContent).toBe('Ref Test');
        });
    });
});
