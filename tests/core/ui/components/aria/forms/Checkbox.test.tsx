/**
 * Checkbox Component Tests
 *
 * Tests the Checkbox form component built with React Aria
 * for accessibility and CSS Modules for styling.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Checkbox } from '@/core/ui/components/aria/forms';

describe('Checkbox', () => {
    describe('label rendering', () => {
        it('should render with label', () => {
            // Given: Checkbox with label as children
            render(<Checkbox>Enable feature</Checkbox>);

            // Then: Label text is visible
            expect(screen.getByText('Enable feature')).toBeInTheDocument();
        });
    });

    describe('isSelected state', () => {
        it('should handle isSelected state', () => {
            // Given: Checkbox with isSelected=true
            render(<Checkbox isSelected>Option</Checkbox>);

            // Then: Checkbox displays checked state
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toBeChecked();
        });

        it('should show unchecked when isSelected=false', () => {
            // Given: Checkbox with isSelected=false
            render(<Checkbox isSelected={false}>Option</Checkbox>);

            // Then: Checkbox is unchecked
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).not.toBeChecked();
        });
    });

    describe('onChange callback', () => {
        it('should handle onChange callback', async () => {
            // Given: Checkbox with onChange handler
            const user = userEvent.setup();
            const onChange = jest.fn();
            render(<Checkbox onChange={onChange}>Toggle me</Checkbox>);

            // When: User clicks checkbox
            const checkbox = screen.getByRole('checkbox');
            await user.click(checkbox);

            // Then: onChange is called with new state
            expect(onChange).toHaveBeenCalledWith(true);
        });
    });

    describe('isDisabled state', () => {
        it('should support isDisabled prop', () => {
            // Given: Disabled checkbox
            render(<Checkbox isDisabled>Disabled option</Checkbox>);

            // Then: Checkbox is disabled
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toBeDisabled();
        });

        it('should not call onChange when disabled', async () => {
            // Given: Disabled checkbox with onChange
            const user = userEvent.setup();
            const onChange = jest.fn();
            render(
                <Checkbox isDisabled onChange={onChange}>
                    Disabled
                </Checkbox>
            );

            // When: Attempting to click
            const checkbox = screen.getByRole('checkbox');
            await user.click(checkbox);

            // Then: onChange is NOT called
            expect(onChange).not.toHaveBeenCalled();
        });
    });

    describe('ref forwarding', () => {
        it('should forward ref to checkbox element', () => {
            // Given: Ref object
            const ref = React.createRef<HTMLLabelElement>();

            // When: Render with ref
            render(<Checkbox ref={ref}>Test</Checkbox>);

            // Then: Ref points to label element (React Aria wraps checkbox in label)
            expect(ref.current).toBeInstanceOf(HTMLLabelElement);
        });
    });

    describe('displayName', () => {
        it('should have displayName set for DevTools', () => {
            // Then: Component has displayName
            expect(Checkbox.displayName).toBe('Checkbox');
        });
    });
});
