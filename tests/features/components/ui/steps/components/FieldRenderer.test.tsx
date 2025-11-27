import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as SpectrumProvider, defaultTheme } from '@adobe/react-spectrum';
import { FieldRenderer } from '@/features/components/ui/steps/components/FieldRenderer';
import { UniqueField } from '@/features/components/ui/steps/ComponentConfigStep';

// Test wrapper for Spectrum components
function renderWithSpectrum(ui: React.ReactElement) {
    return render(
        <SpectrumProvider theme={defaultTheme}>
            {ui}
        </SpectrumProvider>
    );
}

describe('FieldRenderer', () => {
    const mockOnChange = jest.fn();

    beforeEach(() => {
        mockOnChange.mockClear();
    });

    describe('TextField rendering', () => {
        it('renders TextField for text type', () => {
            const field: UniqueField = {
                key: 'API_KEY',
                label: 'API Key',
                type: 'text',
                required: false,
                componentIds: ['test-component'],
            };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value=""
                    onChange={mockOnChange}
                    touchedFields={new Set()}
                    validationErrors={{}}
                />
            );

            expect(screen.getByLabelText('API Key')).toBeInTheDocument();
            expect(screen.getByRole('textbox')).toBeInTheDocument();
        });

        it('renders TextField for url type', () => {
            const field: UniqueField = {
                key: 'API_ENDPOINT',
                label: 'API Endpoint',
                type: 'url',
                required: false,
                componentIds: ['test-component'],
            };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value=""
                    onChange={mockOnChange}
                    touchedFields={new Set()}
                    validationErrors={{}}
                />
            );

            expect(screen.getByLabelText('API Endpoint')).toBeInTheDocument();
            expect(screen.getByRole('textbox')).toBeInTheDocument();
        });

        it('renders password field with type="password"', () => {
            const field: UniqueField = {
                key: 'API_SECRET',
                label: 'API Secret',
                type: 'password',
                required: true,
                componentIds: ['test-component'],
            };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value=""
                    onChange={mockOnChange}
                    touchedFields={new Set()}
                    validationErrors={{}}
                />
            );

            // Spectrum password fields don't expose role="textbox" in jsdom
            // Verify the field container was rendered with correct ID
            const container = document.getElementById('field-API_SECRET');
            expect(container).toBeInTheDocument();

            // Verify password input exists in the DOM
            const passwordInput = container?.querySelector('input[type="password"]');
            expect(passwordInput).toBeTruthy();
        });
    });

    describe('Checkbox rendering', () => {
        it('renders Checkbox for boolean type', () => {
            const field: UniqueField = {
                key: 'ENABLED',
                label: 'Enabled',
                type: 'boolean',
                required: false,
                componentIds: ['test-component'],
            };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value={false}
                    onChange={mockOnChange}
                    touchedFields={new Set()}
                    validationErrors={{}}
                />
            );

            expect(screen.getByRole('checkbox')).toBeInTheDocument();
            expect(screen.getByText('Enabled')).toBeInTheDocument();
        });

        it('renders checked checkbox when value is true', () => {
            const field: UniqueField = {
                key: 'ENABLED',
                label: 'Enabled',
                type: 'boolean',
                required: false,
                componentIds: ['test-component'],
            };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value={true}
                    onChange={mockOnChange}
                    touchedFields={new Set()}
                    validationErrors={{}}
                />
            );

            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toBeChecked();
        });
    });

    describe('Picker (select) rendering', () => {
        it('renders Picker for select type', () => {
            const field: UniqueField = {
                key: 'STORE_VIEW',
                label: 'Store View',
                type: 'select',
                required: true,
                componentIds: ['test-component'],
                options: [
                    { label: 'Default', value: 'default' },
                    { label: 'English', value: 'en' },
                    { label: 'French', value: 'fr' },
                ],
            };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value="default"
                    onChange={mockOnChange}
                    touchedFields={new Set()}
                    validationErrors={{}}
                />
            );

            expect(screen.getByText('Store View')).toBeInTheDocument();
            expect(screen.getByRole('button')).toBeInTheDocument(); // Picker renders as button
        });
    });

    describe('Field interactions', () => {
        it('calls onChange when TextField value changes', () => {
            const field: UniqueField = {
                key: 'API_KEY',
                label: 'API Key',
                type: 'text',
                required: false,
                componentIds: ['test-component'],
            };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value=""
                    onChange={mockOnChange}
                    touchedFields={new Set()}
                    validationErrors={{}}
                />
            );

            const input = screen.getByRole('textbox');
            fireEvent.change(input, { target: { value: 'new-api-key' } });

            expect(mockOnChange).toHaveBeenCalledWith(field, 'new-api-key');
        });

        it('calls onChange when Checkbox is toggled', async () => {
            const user = userEvent.setup();
            const field: UniqueField = {
                key: 'ENABLED',
                label: 'Enabled',
                type: 'boolean',
                required: false,
                componentIds: ['test-component'],
            };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value={false}
                    onChange={mockOnChange}
                    touchedFields={new Set()}
                    validationErrors={{}}
                />
            );

            const checkbox = screen.getByRole('checkbox');
            await user.click(checkbox);

            expect(mockOnChange).toHaveBeenCalledWith(field, true);
        });
    });

    describe('Validation display', () => {
        it('shows validation error when field is touched and has error', () => {
            const field: UniqueField = {
                key: 'API_KEY',
                label: 'API Key',
                type: 'text',
                required: true,
                componentIds: ['test-component'],
            };

            const touchedFields = new Set(['API_KEY']);
            const validationErrors = { 'API_KEY': 'API Key is required' };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value=""
                    onChange={mockOnChange}
                    touchedFields={touchedFields}
                    validationErrors={validationErrors}
                />
            );

            expect(screen.getByText('API Key is required')).toBeInTheDocument();
        });

        it('does not show validation error when field is not touched', () => {
            const field: UniqueField = {
                key: 'API_KEY',
                label: 'API Key',
                type: 'text',
                required: true,
                componentIds: ['test-component'],
            };

            const touchedFields = new Set<string>();
            const validationErrors = { 'API_KEY': 'API Key is required' };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value=""
                    onChange={mockOnChange}
                    touchedFields={touchedFields}
                    validationErrors={validationErrors}
                />
            );

            expect(screen.queryByText('API Key is required')).not.toBeInTheDocument();
        });
    });

    describe('Required field marking', () => {
        it('marks required text fields with isRequired prop', () => {
            const field: UniqueField = {
                key: 'API_KEY',
                label: 'API Key',
                type: 'text',
                required: true,
                componentIds: ['test-component'],
            };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value=""
                    onChange={mockOnChange}
                    touchedFields={new Set()}
                    validationErrors={{}}
                />
            );

            const input = screen.getByRole('textbox');
            // Spectrum uses aria-required instead of required attribute
            expect(input).toHaveAttribute('aria-required', 'true');
        });
    });

    describe('Read-only MESH_ENDPOINT field', () => {
        it('renders MESH_ENDPOINT as read-only TextField', () => {
            const field: UniqueField = {
                key: 'MESH_ENDPOINT',
                label: 'Mesh Endpoint',
                type: 'text',
                required: false,
                componentIds: ['test-component'],
            };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value=""
                    onChange={mockOnChange}
                    touchedFields={new Set()}
                    validationErrors={{}}
                />
            );

            const input = screen.getByRole('textbox');
            expect(input).toHaveAttribute('readonly');
            expect(screen.getByText(/will be set automatically/i)).toBeInTheDocument();
        });

        it('shows auto-filled description when MESH_ENDPOINT has value', () => {
            const field: UniqueField = {
                key: 'MESH_ENDPOINT',
                label: 'Mesh Endpoint',
                type: 'text',
                required: false,
                componentIds: ['test-component'],
            };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value="https://mesh.adobe.io/endpoint"
                    onChange={mockOnChange}
                    touchedFields={new Set()}
                    validationErrors={{}}
                />
            );

            expect(screen.getByText('Auto-filled from API Mesh setup')).toBeInTheDocument();
        });
    });

    describe('Field descriptions and placeholders', () => {
        it('renders field description when provided', () => {
            const field: UniqueField = {
                key: 'API_KEY',
                label: 'API Key',
                type: 'text',
                required: false,
                componentIds: ['test-component'],
                description: 'Enter your API key from the developer portal',
            };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value=""
                    onChange={mockOnChange}
                    touchedFields={new Set()}
                    validationErrors={{}}
                />
            );

            expect(screen.getByText('Enter your API key from the developer portal')).toBeInTheDocument();
        });

        it('renders field placeholder when provided', () => {
            const field: UniqueField = {
                key: 'API_KEY',
                label: 'API Key',
                type: 'text',
                required: false,
                componentIds: ['test-component'],
                placeholder: 'sk_test_...',
            };

            renderWithSpectrum(
                <FieldRenderer
                    field={field}
                    value=""
                    onChange={mockOnChange}
                    touchedFields={new Set()}
                    validationErrors={{}}
                />
            );

            const input = screen.getByRole('textbox');
            expect(input).toHaveAttribute('placeholder', 'sk_test_...');
        });
    });
});
