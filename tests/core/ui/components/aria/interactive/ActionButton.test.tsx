/**
 * ActionButton Component Tests
 *
 * Tests the ActionButton interactive component built with React Aria.
 * ActionButton is a quiet button variant optimized for icon-only or icon+text patterns.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActionButton } from '@/core/ui/components/aria/interactive';

describe('ActionButton', () => {
    describe('default rendering', () => {
        it('should render as quiet button by default', () => {
            // Given: ActionButton with text
            const { container } = render(
                <ActionButton>Action</ActionButton>
            );

            // Then: Button has quiet data attribute
            const button = container.querySelector('button');
            expect(button).toHaveAttribute('data-quiet');
        });

        it('should render with base CSS Module class', () => {
            // Given: ActionButton
            const { container } = render(
                <ActionButton>Styled Action</ActionButton>
            );

            // Then: Button has CSS Module class
            const button = container.querySelector('button');
            expect(button).toHaveClass('actionButton');
        });
    });

    describe('icon patterns', () => {
        it('should support icon + text pattern', () => {
            // Given: ActionButton with icon and text
            render(
                <ActionButton>
                    <span data-testid="icon" aria-hidden="true">+</span>
                    <span>Add Item</span>
                </ActionButton>
            );

            // Then: Both icon and text are rendered
            expect(screen.getByTestId('icon')).toBeInTheDocument();
            expect(screen.getByText('Add Item')).toBeInTheDocument();
        });

        it('should support icon-only with aria-label', () => {
            // Given: Icon-only ActionButton with aria-label
            render(
                <ActionButton aria-label="Close">
                    <span aria-hidden="true">X</span>
                </ActionButton>
            );

            // Then: Button is accessible via label
            expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
        });

        it('should render custom icon components', () => {
            // Given: ActionButton with SVG icon
            const IconComponent = () => (
                <svg data-testid="svg-icon" viewBox="0 0 24 24">
                    <path d="M12 2L12 22" />
                </svg>
            );

            render(
                <ActionButton aria-label="Settings">
                    <IconComponent />
                </ActionButton>
            );

            // Then: SVG icon is rendered
            expect(screen.getByTestId('svg-icon')).toBeInTheDocument();
        });
    });

    describe('onPress callback', () => {
        it('should handle onPress callback on click', () => {
            // Given: ActionButton with onPress handler
            const onPressMock = jest.fn();
            render(
                <ActionButton onPress={onPressMock}>
                    Click Action
                </ActionButton>
            );

            // When: Button is clicked
            fireEvent.click(screen.getByRole('button'));

            // Then: Handler is called
            expect(onPressMock).toHaveBeenCalledTimes(1);
        });

        it('should handle keyboard activation', () => {
            // Given: ActionButton with onPress handler
            const onPressMock = jest.fn();
            render(
                <ActionButton onPress={onPressMock}>
                    Keyboard Action
                </ActionButton>
            );

            // When: Enter key is pressed
            const button = screen.getByRole('button');
            fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
            fireEvent.keyUp(button, { key: 'Enter', code: 'Enter' });

            // Then: Handler is called
            expect(onPressMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('isDisabled prop', () => {
        it('should support isDisabled prop', () => {
            // Given: ActionButton with isDisabled
            render(<ActionButton isDisabled>Disabled</ActionButton>);

            // Then: Button is disabled
            const button = screen.getByRole('button');
            expect(button).toBeDisabled();
        });

        it('should not fire onPress when disabled', () => {
            // Given: Disabled ActionButton with onPress
            const onPressMock = jest.fn();
            render(
                <ActionButton isDisabled onPress={onPressMock}>
                    Disabled Action
                </ActionButton>
            );

            // When: Attempting to click
            fireEvent.click(screen.getByRole('button'));

            // Then: Handler is NOT called
            expect(onPressMock).not.toHaveBeenCalled();
        });
    });

    describe('accessibility', () => {
        it('should use React Aria Button for accessibility', () => {
            // Given: ActionButton
            render(<ActionButton>Accessible</ActionButton>);

            // Then: Renders as accessible button
            const button = screen.getByRole('button', { name: 'Accessible' });
            expect(button).toBeInTheDocument();
            expect(button.tagName.toLowerCase()).toBe('button');
        });

        it('should support aria-label attribute', () => {
            // Given: ActionButton with aria-label
            render(
                <ActionButton aria-label="Refresh data">
                    <span aria-hidden="true">Refresh</span>
                </ActionButton>
            );

            // Then: Button has correct accessible name
            expect(screen.getByRole('button', { name: 'Refresh data' })).toBeInTheDocument();
        });

        it('should be keyboard focusable', () => {
            // Given: ActionButton
            render(<ActionButton>Focusable</ActionButton>);
            const button = screen.getByRole('button');

            // When: Focus
            button.focus();

            // Then: Button is focused
            expect(button).toHaveFocus();
        });
    });

    describe('React DevTools', () => {
        it('should have displayName set for DevTools', () => {
            // Then: Component has displayName
            expect(ActionButton.displayName).toBe('ActionButton');
        });
    });

    describe('ref forwarding', () => {
        it('should forward ref to underlying button element', () => {
            // Given: Ref object
            const ref = React.createRef<HTMLButtonElement>();

            // When: Render with ref
            render(<ActionButton ref={ref}>Ref Action</ActionButton>);

            // Then: Ref points to button element
            expect(ref.current).toBeInstanceOf(HTMLButtonElement);
        });
    });
});
