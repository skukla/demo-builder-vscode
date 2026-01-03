/**
 * ConfigFieldRenderer Component Tests
 *
 * Tests the form field renderer component that handles 5 field types:
 * text, url, password, select, boolean, plus special MESH_ENDPOINT handling.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ConfigFieldRenderer } from '@/features/components/ui/components/ConfigFieldRenderer';
import { UniqueField } from '@/features/components/ui/hooks/useComponentConfig';

// Mock useSelectableDefault hook - returns onFocus handler for selecting text
const mockOnFocus = jest.fn();
jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: () => ({
        onFocus: mockOnFocus,
    }),
}));

// Helper to render with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => render(ui); // Simplified - no Provider needed

describe('ConfigFieldRenderer', () => {
    const mockOnUpdate = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('text field type', () => {
        const textField: UniqueField = {
            key: 'TEST_FIELD',
            label: 'Test Field',
            type: 'text',
            placeholder: 'Enter value',
            description: 'A test field',
            required: true,
        };

        it('renders text field with label', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={textField}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(screen.getByLabelText(/Test Field/i)).toBeInTheDocument();
        });

        it('renders text field with value', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={textField}
                    value="test value"
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(screen.getByDisplayValue('test value')).toBeInTheDocument();
        });

        it('calls onUpdate when value changes', async () => {
            const user = userEvent.setup();

            renderWithProvider(
                <ConfigFieldRenderer
                    field={textField}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            const input = screen.getByLabelText(/Test Field/i);
            await user.type(input, 'new value');

            expect(mockOnUpdate).toHaveBeenCalled();
        });

        it('shows error message when touched and has error', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={textField}
                    value=""
                    error="This field is required"
                    isTouched={true}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(screen.getByText('This field is required')).toBeInTheDocument();
        });

        it('does not show error when not touched', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={textField}
                    value=""
                    error="This field is required"
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(screen.queryByText('This field is required')).not.toBeInTheDocument();
        });

        it('renders field wrapper with correct id', () => {
            const { container } = renderWithProvider(
                <ConfigFieldRenderer
                    field={textField}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(container.querySelector('#field-TEST_FIELD')).toBeInTheDocument();
        });
    });

    describe('url field type', () => {
        const urlField: UniqueField = {
            key: 'API_URL',
            label: 'API URL',
            type: 'url',
            placeholder: 'https://example.com',
            required: true,
        };

        it('renders url field with label', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={urlField}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(screen.getByLabelText(/API URL/i)).toBeInTheDocument();
        });

        it('renders url field with value', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={urlField}
                    value="https://api.example.com"
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(screen.getByDisplayValue('https://api.example.com')).toBeInTheDocument();
        });
    });

    describe('password field type', () => {
        const passwordField: UniqueField = {
            key: 'API_KEY',
            label: 'API Key',
            type: 'password',
            placeholder: 'Enter API key',
            required: true,
        };

        it('renders password field with label', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={passwordField}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
        });

        it('renders password field with masked input', () => {
            const { container } = renderWithProvider(
                <ConfigFieldRenderer
                    field={passwordField}
                    value="secret123"
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            const input = container.querySelector('input[type="password"]');
            expect(input).toBeInTheDocument();
        });
    });

    describe('select field type', () => {
        const selectField: UniqueField = {
            key: 'ENVIRONMENT',
            label: 'Environment',
            type: 'select',
            required: true,
            options: [
                { value: 'dev', label: 'Development' },
                { value: 'staging', label: 'Staging' },
                { value: 'prod', label: 'Production' },
            ],
        };

        it('renders picker with label', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={selectField}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(screen.getByText('Environment')).toBeInTheDocument();
        });

        it('renders picker with selected value', () => {
            const { container } = renderWithProvider(
                <ConfigFieldRenderer
                    field={selectField}
                    value="staging"
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            // Spectrum Picker renders a button with the selected value
            const picker = container.querySelector('button[type="button"]');
            expect(picker).toBeInTheDocument();
            // The picker shows the selected label text
            expect(picker?.textContent).toContain('Staging');
        });

        it('handles select without options gracefully', () => {
            const fieldWithoutOptions: UniqueField = {
                key: 'EMPTY_SELECT',
                label: 'Empty Select',
                type: 'select',
                required: false,
                options: [], // Explicitly empty array
            };

            const { container } = renderWithProvider(
                <ConfigFieldRenderer
                    field={fieldWithoutOptions}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            // Should render the picker (multiple elements contain the label text)
            const labels = screen.getAllByText('Empty Select');
            expect(labels.length).toBeGreaterThan(0);
            // And the picker button should exist
            const picker = container.querySelector('button[type="button"]');
            expect(picker).toBeInTheDocument();
        });
    });

    describe('boolean field type', () => {
        const booleanField: UniqueField = {
            key: 'ENABLE_FEATURE',
            label: 'Enable Feature',
            type: 'boolean',
            required: false,
        };

        it('renders checkbox with label', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={booleanField}
                    value={false}
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(screen.getByRole('checkbox')).toBeInTheDocument();
            expect(screen.getByText('Enable Feature')).toBeInTheDocument();
        });

        it('renders checkbox as checked when value is true', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={booleanField}
                    value={true}
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(screen.getByRole('checkbox')).toBeChecked();
        });

        it('renders checkbox as unchecked when value is false', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={booleanField}
                    value={false}
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(screen.getByRole('checkbox')).not.toBeChecked();
        });

        it('calls onUpdate when checkbox is toggled', async () => {
            const user = userEvent.setup();

            renderWithProvider(
                <ConfigFieldRenderer
                    field={booleanField}
                    value={false}
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            const checkbox = screen.getByRole('checkbox');
            await user.click(checkbox);

            expect(mockOnUpdate).toHaveBeenCalledWith(booleanField, true);
        });
    });

    // Note: MESH_ENDPOINT special handling tests removed
    // MESH_ENDPOINT is now filtered out in useComponentConfig and auto-configured during project creation

    describe('default value highlighting', () => {
        const fieldWithDefault: UniqueField = {
            key: 'STORE_CODE',
            label: 'Store Code',
            type: 'text',
            default: 'default_store',
            required: false,
        };

        beforeEach(() => {
            mockOnFocus.mockClear();
        });

        it('applies selectable default props when value equals default', async () => {
            const user = userEvent.setup();
            renderWithProvider(
                <ConfigFieldRenderer
                    field={fieldWithDefault}
                    value="default_store"
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            // The useSelectableDefault hook provides onFocus handler
            const input = screen.getByLabelText('Store Code');
            await user.click(input);

            // onFocus should be called when input is focused
            expect(mockOnFocus).toHaveBeenCalled();
        });

        it('does not apply selectable default props when value differs from default', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={fieldWithDefault}
                    value="custom_store"
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            // Field should render normally
            expect(screen.getByLabelText('Store Code')).toBeInTheDocument();
        });
    });

    describe('unknown field type', () => {
        it('returns null for unknown field type', () => {
            const unknownField: UniqueField = {
                key: 'UNKNOWN',
                label: 'Unknown',
                type: 'unknown' as any,
                required: false,
            };

            const { container } = renderWithProvider(
                <ConfigFieldRenderer
                    field={unknownField}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            // The Provider wrapper exists, but the field content should be empty
            // (no input, no checkbox, no picker inside the provider)
            expect(container.querySelector('input')).toBeNull();
            expect(container.querySelector('[role="checkbox"]')).toBeNull();
            expect(container.querySelector('[id^="field-"]')).toBeNull();
        });
    });
});
