/**
 * TextField Component Tests
 *
 * Tests the TextField form component built with React Aria
 * for accessibility and CSS Modules for styling.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { TextField } from '@/core/ui/components/aria/forms';

describe('TextField', () => {
    describe('label rendering', () => {
        it('should render with label', () => {
            // Given: TextField with label
            render(<TextField label="Username" />);

            // Then: Label is visible
            expect(screen.getByText('Username')).toBeInTheDocument();
        });

        it('should render input element', () => {
            // Given: TextField component
            render(<TextField label="Test" />);

            // Then: Input element exists
            expect(screen.getByRole('textbox')).toBeInTheDocument();
        });

        it('should display placeholder', () => {
            // Given: TextField with placeholder
            render(<TextField label="Username" placeholder="Enter username..." />);

            // Then: Input has placeholder
            const input = screen.getByRole('textbox');
            expect(input).toHaveAttribute('placeholder', 'Enter username...');
        });
    });

    describe('value handling', () => {
        it('should handle value and onChange', async () => {
            // Given: TextField with onChange handler
            const user = userEvent.setup();
            const onChange = jest.fn();
            render(<TextField label="Name" value="" onChange={onChange} />);

            // When: User types
            const input = screen.getByRole('textbox');
            await user.type(input, 'hello');

            // Then: onChange called with characters
            expect(onChange).toHaveBeenCalled();
        });

        it('should handle onBlur callback', async () => {
            // Given: TextField with onBlur handler
            const user = userEvent.setup();
            const onBlur = jest.fn();
            render(<TextField label="Name" onBlur={onBlur} />);

            // When: Input loses focus
            const input = screen.getByRole('textbox');
            await user.click(input);
            await user.tab();

            // Then: onBlur is called
            expect(onBlur).toHaveBeenCalled();
        });
    });

    describe('description and error messages', () => {
        it('should display description', () => {
            // Given: TextField with description
            render(
                <TextField
                    label="Username"
                    description="Must be at least 3 characters"
                />
            );

            // Then: Description is visible
            expect(screen.getByText('Must be at least 3 characters')).toBeInTheDocument();
        });

        it('should display errorMessage when invalid', () => {
            // Given: Invalid TextField with error message
            render(
                <TextField
                    label="Name"
                    validationState="invalid"
                    errorMessage="Name is required"
                />
            );

            // Then: Error message is visible
            expect(screen.getByText('Name is required')).toBeInTheDocument();
        });

        it('should hide errorMessage when valid', () => {
            // Given: Valid TextField with error message prop
            render(
                <TextField
                    label="Name"
                    validationState="valid"
                    errorMessage="Name is required"
                />
            );

            // Then: Error message is NOT visible
            expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
        });
    });

    describe('validation states', () => {
        it('should support validationState="valid"', () => {
            // Given: TextField with valid state
            const { container } = render(
                <TextField label="Email" validationState="valid" />
            );

            // Then: Has valid styling
            const textField = container.querySelector('[class*="textField"]');
            expect(textField).toHaveClass('valid');
        });

        it('should support validationState="invalid"', () => {
            // Given: TextField with invalid state
            const { container } = render(
                <TextField label="Email" validationState="invalid" />
            );

            // Then: Has invalid styling
            const textField = container.querySelector('[class*="textField"]');
            expect(textField).toHaveClass('invalid');
        });
    });

    describe('disabled and required states', () => {
        it('should support isDisabled prop', () => {
            // Given: Disabled TextField
            render(<TextField label="Name" isDisabled />);

            // Then: Input is disabled
            const input = screen.getByRole('textbox');
            expect(input).toBeDisabled();
        });

        it('should support isRequired prop', () => {
            // Given: Required TextField
            render(<TextField label="Email" isRequired />);

            // Then: Input has required attribute (React Aria uses native required)
            const input = screen.getByRole('textbox');
            expect(input).toBeRequired();
        });

        it('should show required indicator in label', () => {
            // Given: Required TextField
            render(<TextField label="Email" isRequired />);

            // Then: Label includes asterisk
            expect(screen.getByText('*')).toBeInTheDocument();
        });
    });

    describe('autoFocus', () => {
        it('should support autoFocus prop', () => {
            // Given: TextField with autoFocus
            render(<TextField label="Name" autoFocus />);

            // Then: Input is focused
            const input = screen.getByRole('textbox');
            expect(input).toHaveFocus();
        });
    });

    describe('width prop', () => {
        it('should support width prop with Spectrum tokens', () => {
            // Given: TextField with width token
            const { container } = render(
                <TextField label="Name" width="size-6000" />
            );

            // Then: Has width style (480px for size-6000)
            const textField = container.querySelector('[class*="textField"]');
            expect(textField).toHaveStyle({ width: '480px' });
        });
    });

    describe('accessibility', () => {
        it('should have label and input associated via aria', () => {
            // Given: TextField with label
            render(<TextField label="Password" />);

            // Then: Input is accessible by label
            expect(screen.getByRole('textbox', { name: 'Password' })).toBeInTheDocument();
        });

        it('should have error message with proper aria association', () => {
            // Given: Invalid TextField with error message
            render(
                <TextField
                    label="Email"
                    validationState="invalid"
                    errorMessage="Invalid email"
                />
            );

            // Then: Input has aria-describedby pointing to error
            const input = screen.getByRole('textbox');
            expect(input).toHaveAttribute('aria-describedby');
            // The error message should be in the document
            expect(screen.getByText('Invalid email')).toBeInTheDocument();
        });
    });

    describe('ref forwarding', () => {
        it('should forward ref to input element', () => {
            // Given: Ref object
            const ref = React.createRef<HTMLInputElement>();

            // When: Render with ref
            render(<TextField label="Test" ref={ref} />);

            // Then: Ref points to input
            expect(ref.current).toBeInstanceOf(HTMLInputElement);
        });
    });

    describe('displayName', () => {
        it('should have displayName set for DevTools', () => {
            // Then: Component has displayName
            expect(TextField.displayName).toBe('TextField');
        });
    });
});
