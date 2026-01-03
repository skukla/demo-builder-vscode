/**
 * Select Component Tests
 *
 * Tests the Select form component built with React Aria
 * for accessibility and CSS Modules for styling.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Select, SelectItem } from '@/core/ui/components/aria/forms';

describe('Select', () => {
    describe('placeholder', () => {
        it('should render with placeholder', () => {
            // Given: Select with placeholder
            render(
                <Select placeholder="Choose option" aria-label="Options">
                    <SelectItem id="opt1">Option 1</SelectItem>
                    <SelectItem id="opt2">Option 2</SelectItem>
                </Select>
            );

            // Then: Placeholder is visible
            expect(screen.getByText('Choose option')).toBeInTheDocument();
        });
    });

    describe('selected value', () => {
        it('should display selected value', () => {
            // Given: Select with selectedKey
            const { container } = render(
                <Select selectedKey="opt1" aria-label="Options">
                    <SelectItem id="opt1">Option 1</SelectItem>
                    <SelectItem id="opt2">Option 2</SelectItem>
                </Select>
            );

            // Then: Selected option text is displayed in the trigger button
            const trigger = screen.getByRole('button');
            expect(trigger).toHaveTextContent('Option 1');
        });
    });

    describe('dropdown interaction', () => {
        it('should open dropdown on click', async () => {
            // Given: Select with options
            const user = userEvent.setup();
            render(
                <Select placeholder="Choose" aria-label="Options">
                    <SelectItem id="opt1">Option 1</SelectItem>
                    <SelectItem id="opt2">Option 2</SelectItem>
                </Select>
            );

            // When: User clicks the trigger
            const trigger = screen.getByRole('button');
            await user.click(trigger);

            // Then: Dropdown opens with options visible
            await waitFor(() => {
                expect(screen.getByRole('listbox')).toBeInTheDocument();
            });
        });

        it('should handle onSelectionChange', async () => {
            // Given: Select with onSelectionChange handler
            const user = userEvent.setup();
            const onSelectionChange = jest.fn();
            render(
                <Select
                    placeholder="Choose"
                    onSelectionChange={onSelectionChange}
                    aria-label="Options"
                >
                    <SelectItem id="opt1">Option 1</SelectItem>
                    <SelectItem id="opt2">Option 2</SelectItem>
                </Select>
            );

            // When: User opens dropdown and selects option
            const trigger = screen.getByRole('button');
            await user.click(trigger);

            await waitFor(() => {
                expect(screen.getByRole('listbox')).toBeInTheDocument();
            });

            const option = screen.getByRole('option', { name: 'Option 2' });
            await user.click(option);

            // Then: onSelectionChange called with selected key
            expect(onSelectionChange).toHaveBeenCalledWith('opt2');
        });
    });

    describe('isDisabled', () => {
        it('should support isDisabled prop', () => {
            // Given: Disabled Select
            render(
                <Select isDisabled placeholder="Choose" aria-label="Options">
                    <SelectItem id="opt1">Option 1</SelectItem>
                </Select>
            );

            // Then: Trigger is disabled
            const trigger = screen.getByRole('button');
            expect(trigger).toBeDisabled();
        });
    });

    describe('ref forwarding', () => {
        it('should forward ref to trigger element', () => {
            // Given: Ref object
            const ref = React.createRef<HTMLButtonElement>();

            // When: Render with ref
            render(
                <Select ref={ref} placeholder="Choose" aria-label="Options">
                    <SelectItem id="opt1">Option 1</SelectItem>
                </Select>
            );

            // Then: Ref points to button element
            expect(ref.current).toBeInstanceOf(HTMLButtonElement);
        });
    });

    describe('displayName', () => {
        it('should have displayName set for DevTools', () => {
            // Then: Component has displayName
            expect(Select.displayName).toBe('Select');
        });
    });
});
