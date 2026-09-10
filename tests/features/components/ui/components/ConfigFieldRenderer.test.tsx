/**
 * ConfigFieldRenderer Component Tests
 *
 * Tests the form field renderer component that handles 5 field types:
 * text, url, password, select, boolean, plus special MESH_ENDPOINT handling.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { ConfigFieldRenderer } from '@/features/components/ui/components/ConfigFieldRenderer';
import { UniqueField } from '@/features/components/ui/hooks/useComponentConfig';

// Helper to render with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme}>
            {ui}
        </Provider>
    );
};

describe('ConfigFieldRenderer', () => {
    const mockOnUpdate = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('text field type', () => {
        const textField: UniqueField = {
            key: 'TEST_FIELD',
            componentIds: ['test-component'],
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
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

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

        it('does NOT normalize on blur — normalization is url-only', () => {
            const onNormalizeUrl = jest.fn();
            renderWithProvider(
                <ConfigFieldRenderer
                    field={textField}
                    value="trailing/"
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                    onNormalizeUrl={onNormalizeUrl}
                />
            );

            fireEvent.blur(screen.getByLabelText(/Test Field/i));

            expect(onNormalizeUrl).not.toHaveBeenCalled();
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
            componentIds: ['test-component'],
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

        it('normalizes THIS field on blur, naming it to the caller', () => {
            const onNormalizeUrl = jest.fn();
            renderWithProvider(
                <ConfigFieldRenderer
                    field={urlField}
                    value="https://api.example.com/"
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                    onNormalizeUrl={onNormalizeUrl}
                />
            );

            fireEvent.blur(screen.getByLabelText(/API URL/i));

            // Which field is normalized is the whole content of the call.
            expect(onNormalizeUrl).toHaveBeenCalledWith(urlField);
        });

        it('blurs harmlessly when no normalizer was handed in', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={urlField}
                    value="https://api.example.com/"
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(() => fireEvent.blur(screen.getByLabelText(/API URL/i))).not.toThrow();
        });
    });

    describe('password field type', () => {
        const passwordField: UniqueField = {
            key: 'API_KEY',
            componentIds: ['test-component'],
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

        it('reports a typed password to onUpdate against its own field', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

            renderWithProvider(
                <ConfigFieldRenderer
                    field={passwordField}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            await user.type(screen.getByLabelText(/API Key/i), 'x');

            expect(mockOnUpdate).toHaveBeenCalledWith(passwordField, 'x');
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
            componentIds: ['test-component'],
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

        it('reports the chosen option key to onUpdate', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={selectField}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            fireEvent.change(screen.getByTestId('spectrum-picker-select'), {
                target: { value: 'dev' },
            });

            // The VALUE, not the label, and not a stringified boolean.
            expect(mockOnUpdate).toHaveBeenCalledWith(selectField, 'dev');
        });

        it('renders a select whose options key is absent entirely', () => {
            const fieldWithNoOptionsKey: UniqueField = {
                key: 'NO_OPTIONS',
                componentIds: ['test-component'],
                label: 'No Options',
                type: 'select',
                required: false,
            };

            const { container } = renderWithProvider(
                <ConfigFieldRenderer
                    field={fieldWithNoOptionsKey}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(container.querySelector('button[type="button"]')).toBeInTheDocument();
            // And offers NOTHING to choose — the empty-list fallback must stay
            // empty rather than become a phantom option.
            expect(container.querySelectorAll('option')).toHaveLength(0);
        });

        it('handles select without options gracefully', () => {
            const fieldWithoutOptions: UniqueField = {
                key: 'EMPTY_SELECT',
                componentIds: ['test-component'],
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
            componentIds: ['test-component'],
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
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

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
            componentIds: ['test-component'],
            label: 'Store Code',
            type: 'text',
            default: 'default_store',
            required: false,
        };

        /**
         * useSelectableDefault's whole contract is an onFocus that selects the
         * field's text, so the only honest question is whether focusing the
         * input reaches `select()`. The hook itself is REAL here — mocking it
         * meant asserting an invented prop shape it never returns.
         */
        const selectableDefaultApplied = (container: HTMLElement) => {
            const input = container.querySelector('input')!;
            const select = jest.spyOn(input, 'select');
            fireEvent.focus(input);
            const applied = select.mock.calls.length > 0;
            select.mockRestore();
            return applied;
        };

        it('applies selectable default props when value equals default', () => {
            const { container } = renderWithProvider(
                <ConfigFieldRenderer
                    field={fieldWithDefault}
                    value="default_store"
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(container.querySelector('input')).toHaveValue('default_store');
            expect(selectableDefaultApplied(container)).toBe(true);
        });

        it('does not apply selectable default props when value differs from default', () => {
            const { container } = renderWithProvider(
                <ConfigFieldRenderer
                    field={fieldWithDefault}
                    value="custom_store"
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(container.querySelector('input')).toHaveValue('custom_store');
            expect(selectableDefaultApplied(container)).toBe(false);
        });

        it('does not apply them to a field that declares no default at all', () => {
            const noDefault: UniqueField = {
                key: 'FREE_TEXT',
                componentIds: ['test-component'],
                label: 'Free Text',
                type: 'text',
                required: false,
            };

            const { container } = renderWithProvider(
                <ConfigFieldRenderer
                    field={noDefault}
                    value="anything"
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(selectableDefaultApplied(container)).toBe(false);
        });

        it('an empty value is never the default, even when the default is empty', () => {
            const emptyDefault: UniqueField = {
                key: 'EMPTY_DEFAULT',
                componentIds: ['test-component'],
                label: 'Empty Default',
                type: 'text',
                default: '',
                required: false,
            };

            const { container } = renderWithProvider(
                <ConfigFieldRenderer
                    field={emptyDefault}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(selectableDefaultApplied(container)).toBe(false);
        });

        it('applies them to a password field on its default too', () => {
            const passwordWithDefault: UniqueField = {
                key: 'SEEDED_SECRET',
                componentIds: ['test-component'],
                label: 'Seeded Secret',
                type: 'password',
                default: 'seed',
                required: false,
            };

            const { container } = renderWithProvider(
                <ConfigFieldRenderer
                    field={passwordWithDefault}
                    value="seed"
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(selectableDefaultApplied(container)).toBe(true);
        });
    });

    describe('help content', () => {
        const fieldWithHelp: UniqueField = {
            key: 'HELPED_FIELD',
            componentIds: ['test-component'],
            label: 'Helped Field',
            type: 'text',
            required: false,
            help: { title: 'Where to find it', text: 'Look in the console.' },
        };

        it('renders a help button beside the label when the field carries help', () => {
            renderWithProvider(
                <ConfigFieldRenderer
                    field={fieldWithHelp}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(screen.getByRole('button', { name: /Helped Field/i })).toBeInTheDocument();
        });

        it('renders no help button for a field without help', () => {
            const plain: UniqueField = { ...fieldWithHelp, help: undefined };

            renderWithProvider(
                <ConfigFieldRenderer
                    field={plain}
                    value=""
                    error={undefined}
                    isTouched={false}
                    onUpdate={mockOnUpdate}
                />
            );

            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });
    });

    describe('unknown field type', () => {
        it('returns null for unknown field type', () => {
            const unknownField: UniqueField = {
                key: 'UNKNOWN',
                componentIds: ['test-component'],
                label: 'Unknown',
                type: 'unknown' as unknown as UniqueField['type'],
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
