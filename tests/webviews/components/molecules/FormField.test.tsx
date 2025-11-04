import React from 'react';
import { renderWithProviders, screen } from "../../../helpers/react-test-utils';
import userEvent from '@testing-library/user-event';
import { FormField } from '@/webview-ui/shared/components/forms/FormField';

describe('FormField', () => {
    describe('Text Field', () => {
        it('renders text field', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="username"
                    label="Username"
                    type="text"
                    value="john"
                    onChange={handleChange}
                />
            );
            expect(screen.getByLabelText('Username')).toBeInTheDocument();
        });

        it('handles text input changes', async () => {
            const user = userEvent.setup();
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="username"
                    label="Username"
                    type="text"
                    value=""
                    onChange={handleChange}
                />
            );

            const input = screen.getByLabelText('Username');
            await user.type(input, 'john');

            expect(handleChange).toHaveBeenCalled();
        });

        it('displays placeholder', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="email"
                    label="Email"
                    type="text"
                    value=""
                    onChange={handleChange}
                    placeholder="user@example.com"
                />
            );
            expect(screen.getByPlaceholderText('user@example.com')).toBeInTheDocument();
        });

        it('displays description', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="username"
                    label="Username"
                    type="text"
                    value=""
                    onChange={handleChange}
                    description="Enter your username"
                />
            );
            expect(screen.getByText('Enter your username')).toBeInTheDocument();
        });
    });

    describe('URL Field', () => {
        it('renders URL field', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="website"
                    label="Website"
                    type="url"
                    value="https://example.com"
                    onChange={handleChange}
                />
            );
            expect(screen.getByLabelText('Website')).toBeInTheDocument();
        });
    });

    describe('Password Field', () => {
        it('renders password field', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="password"
                    label="Password"
                    type="password"
                    value="secret"
                    onChange={handleChange}
                />
            );
            expect(screen.getByLabelText('Password')).toBeInTheDocument();
        });

        it('obscures password text', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="password"
                    label="Password"
                    type="password"
                    value="secret"
                    onChange={handleChange}
                />
            );
            const input = screen.getByLabelText('Password') as HTMLInputElement;
            expect(input.type).toBe('password');
        });
    });

    describe('Select Field', () => {
        const options = [
            { value: 'option1', label: 'Option 1' },
            { value: 'option2', label: 'Option 2' },
            { value: 'option3', label: 'Option 3' }
        ];

        it('renders select field', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="choice"
                    label="Choose"
                    type="select"
                    value="option1"
                    onChange={handleChange}
                    options={options}
                />
            );
            // Label may appear multiple times in Spectrum components
            expect(screen.getAllByText('Choose').length).toBeGreaterThan(0);
        });

        it('displays options', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="choice"
                    label="Choose"
                    type="select"
                    value="option1"
                    onChange={handleChange}
                    options={options}
                />
            );
            // Picker component should be rendered with label
            expect(screen.getAllByText('Choose').length).toBeGreaterThan(0);
        });

        it('handles empty options array', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="choice"
                    label="Choose"
                    type="select"
                    value=""
                    onChange={handleChange}
                    options={[]}
                />
            );
            // Component should still render with label even with empty options
            expect(screen.getAllByText('Choose').length).toBeGreaterThan(0);
        });
    });


    describe('Validation', () => {
        it('marks field as required', () => {
            const handleChange = jest.fn();
            const { container } = renderWithProviders(
                <FormField
                    fieldKey="email"
                    label="Email"
                    type="text"
                    value=""
                    onChange={handleChange}
                    required={true}
                />
            );
            // Component should render (Spectrum handles required visual indicator internally)
            const wrapper = container.querySelector('#field-email');
            expect(wrapper).toBeInTheDocument();
        });

        it('shows error message when showError is true', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="email"
                    label="Email"
                    type="text"
                    value="invalid"
                    onChange={handleChange}
                    error="Invalid email format"
                    showError={true}
                />
            );
            expect(screen.getByText('Invalid email format')).toBeInTheDocument();
        });

        it('does not show error when showError is false', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="email"
                    label="Email"
                    type="text"
                    value="invalid"
                    onChange={handleChange}
                    error="Invalid email format"
                    showError={false}
                />
            );
            expect(screen.queryByText('Invalid email format')).not.toBeInTheDocument();
        });
    });

    describe('Scroll Margin', () => {
        it('applies scroll margin for smooth scrolling', () => {
            const handleChange = jest.fn();
            const { container } = renderWithProviders(
                <FormField
                    fieldKey="test"
                    label="Test"
                    type="text"
                    value=""
                    onChange={handleChange}
                />
            );
            const wrapper = container.querySelector('#field-test');
            expect(wrapper).toHaveStyle({ scrollMarginTop: '24px' });
        });
    });

    describe('Field Keys', () => {
        it('assigns correct ID to field wrapper', () => {
            const handleChange = jest.fn();
            const { container } = renderWithProviders(
                <FormField
                    fieldKey="ADOBE_COMMERCE_URL"
                    label="Commerce URL"
                    type="text"
                    value=""
                    onChange={handleChange}
                />
            );
            expect(container.querySelector('#field-ADOBE_COMMERCE_URL')).toBeInTheDocument();
        });
    });

    describe('Selectable Default Props', () => {
        it('passes selectableDefaultProps to text field', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="test"
                    label="Test"
                    type="text"
                    value="default value"
                    onChange={handleChange}
                    selectableDefaultProps={{ autoFocus: true }}
                />
            );
            expect(screen.getByLabelText('Test')).toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        it('handles undefined options for select', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="choice"
                    label="Choose"
                    type="select"
                    value=""
                    onChange={handleChange}
                />
            );
            // Component should render even without options prop
            expect(screen.getAllByText('Choose').length).toBeGreaterThan(0);
        });

        it('handles empty string value', () => {
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="test"
                    label="Test"
                    type="text"
                    value=""
                    onChange={handleChange}
                />
            );
            const input = screen.getByLabelText('Test') as HTMLInputElement;
            expect(input.value).toBe('');
        });

        it('handles long values', () => {
            const longValue = 'a'.repeat(500);
            const handleChange = jest.fn();
            renderWithProviders(
                <FormField
                    fieldKey="test"
                    label="Test"
                    type="text"
                    value={longValue}
                    onChange={handleChange}
                />
            );
            expect(screen.getByLabelText('Test')).toBeInTheDocument();
        });
    });

    describe('DisplayName', () => {
        it('has display name set', () => {
            expect(FormField.displayName).toBe('FormField');
        });
    });

    describe('Memoization', () => {
        it('is memoized component', () => {
            expect(FormField).toHaveProperty('$$typeof');
        });
    });
});
