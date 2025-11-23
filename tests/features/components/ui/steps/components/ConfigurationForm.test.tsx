import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { Provider as SpectrumProvider, defaultTheme } from '@adobe/react-spectrum';
import { ConfigurationForm } from '@/features/components/ui/steps/components/ConfigurationForm';
import { ServiceGroup } from '@/features/components/ui/steps/ComponentConfigStep';

// Test wrapper for Spectrum components
function renderWithSpectrum(ui: React.ReactElement) {
    return render(
        <SpectrumProvider theme={defaultTheme}>
            {ui}
        </SpectrumProvider>
    );
}

describe('ConfigurationForm', () => {
    const sampleServiceGroups: ServiceGroup[] = [
        {
            id: 'adobe-commerce',
            label: 'Adobe Commerce',
            fields: [
                {
                    key: 'ADOBE_COMMERCE_URL',
                    label: 'Commerce URL',
                    type: 'url',
                    required: true,
                    componentIds: ['frontend'],
                },
                {
                    key: 'ADOBE_COMMERCE_ADMIN_USERNAME',
                    label: 'Admin Username',
                    type: 'text',
                    required: true,
                    componentIds: ['frontend'],
                },
            ],
        },
        {
            id: 'mesh',
            label: 'API Mesh',
            fields: [
                {
                    key: 'MESH_ENDPOINT',
                    label: 'Mesh Endpoint',
                    type: 'text',
                    required: false,
                    componentIds: ['frontend'],
                },
            ],
        },
    ];

    describe('Service group rendering', () => {
        it('renders all service groups', () => {
            const mockRenderField = jest.fn((field) => (
                <div key={field.key} data-testid={`field-${field.key}`}>
                    {field.label}
                </div>
            ));

            renderWithSpectrum(
                <ConfigurationForm
                    serviceGroups={sampleServiceGroups}
                    renderField={mockRenderField}
                    isLoading={false}
                />
            );

            expect(screen.getByText('Adobe Commerce')).toBeInTheDocument();
            expect(screen.getByText('API Mesh')).toBeInTheDocument();
        });

        it('renders all fields within each service group', () => {
            const mockRenderField = jest.fn((field) => (
                <div key={field.key} data-testid={`field-${field.key}`}>
                    {field.label}
                </div>
            ));

            renderWithSpectrum(
                <ConfigurationForm
                    serviceGroups={sampleServiceGroups}
                    renderField={mockRenderField}
                    isLoading={false}
                />
            );

            expect(screen.getByTestId('field-ADOBE_COMMERCE_URL')).toBeInTheDocument();
            expect(screen.getByTestId('field-ADOBE_COMMERCE_ADMIN_USERNAME')).toBeInTheDocument();
            expect(screen.getByTestId('field-MESH_ENDPOINT')).toBeInTheDocument();
        });

        it('calls renderField for each field in service groups', () => {
            const mockRenderField = jest.fn((field) => (
                <div key={field.key}>{field.label}</div>
            ));

            renderWithSpectrum(
                <ConfigurationForm
                    serviceGroups={sampleServiceGroups}
                    renderField={mockRenderField}
                    isLoading={false}
                />
            );

            expect(mockRenderField).toHaveBeenCalledTimes(3); // 3 total fields
            expect(mockRenderField).toHaveBeenCalledWith(
                expect.objectContaining({ key: 'ADOBE_COMMERCE_URL' })
            );
            expect(mockRenderField).toHaveBeenCalledWith(
                expect.objectContaining({ key: 'ADOBE_COMMERCE_ADMIN_USERNAME' })
            );
            expect(mockRenderField).toHaveBeenCalledWith(
                expect.objectContaining({ key: 'MESH_ENDPOINT' })
            );
        });
    });

    describe('Section dividers', () => {
        it('renders dividers between service groups', () => {
            const mockRenderField = jest.fn((field) => (
                <div key={field.key}>{field.label}</div>
            ));

            const { getAllByTestId } = renderWithSpectrum(
                <ConfigurationForm
                    serviceGroups={sampleServiceGroups}
                    renderField={mockRenderField}
                    isLoading={false}
                />
            );

            // Should have 1 divider for 2 service groups
            const dividers = getAllByTestId('service-group-divider');
            expect(dividers.length).toBe(1);
        });

        it('does not render divider before first service group', () => {
            const mockRenderField = jest.fn((field) => (
                <div key={field.key}>{field.label}</div>
            ));

            const singleGroup = [sampleServiceGroups[0]];

            const { queryAllByTestId } = renderWithSpectrum(
                <ConfigurationForm
                    serviceGroups={singleGroup}
                    renderField={mockRenderField}
                    isLoading={false}
                />
            );

            const dividers = queryAllByTestId('service-group-divider');
            expect(dividers.length).toBe(0);
        });
    });

    describe('Section headers', () => {
        it('renders section headers with proper IDs for scroll anchoring', () => {
            const mockRenderField = jest.fn((field) => (
                <div key={field.key}>{field.label}</div>
            ));

            const { container } = renderWithSpectrum(
                <ConfigurationForm
                    serviceGroups={sampleServiceGroups}
                    renderField={mockRenderField}
                    isLoading={false}
                />
            );

            expect(container.querySelector('#section-adobe-commerce')).toBeInTheDocument();
            expect(container.querySelector('#section-mesh')).toBeInTheDocument();
        });

        it('renders section headers as Heading level 3', () => {
            const mockRenderField = jest.fn((field) => (
                <div key={field.key}>{field.label}</div>
            ));

            renderWithSpectrum(
                <ConfigurationForm
                    serviceGroups={sampleServiceGroups}
                    renderField={mockRenderField}
                    isLoading={false}
                />
            );

            // Spectrum Heading components render as h3 by default for level 3
            const headings = screen.getAllByRole('heading', { level: 3 });
            expect(headings.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Loading state', () => {
        it('shows loading display when isLoading is true', () => {
            const mockRenderField = jest.fn();

            renderWithSpectrum(
                <ConfigurationForm
                    serviceGroups={sampleServiceGroups}
                    renderField={mockRenderField}
                    isLoading={true}
                />
            );

            expect(screen.getByText(/loading/i)).toBeInTheDocument();
            expect(mockRenderField).not.toHaveBeenCalled();
        });

        it('hides service groups when loading', () => {
            const mockRenderField = jest.fn();

            renderWithSpectrum(
                <ConfigurationForm
                    serviceGroups={sampleServiceGroups}
                    renderField={mockRenderField}
                    isLoading={true}
                />
            );

            expect(screen.queryByText('Adobe Commerce')).not.toBeInTheDocument();
            expect(screen.queryByText('API Mesh')).not.toBeInTheDocument();
        });
    });

    describe('Empty state', () => {
        it('shows message when no service groups are provided', () => {
            const mockRenderField = jest.fn();

            renderWithSpectrum(
                <ConfigurationForm
                    serviceGroups={[]}
                    renderField={mockRenderField}
                    isLoading={false}
                />
            );

            expect(screen.getByText(/no components requiring configuration/i)).toBeInTheDocument();
            expect(mockRenderField).not.toHaveBeenCalled();
        });
    });

    describe('Form layout', () => {
        it('renders within a Form component for proper Spectrum styling', () => {
            const mockRenderField = jest.fn((field) => (
                <div key={field.key}>{field.label}</div>
            ));

            const { container } = renderWithSpectrum(
                <ConfigurationForm
                    serviceGroups={sampleServiceGroups}
                    renderField={mockRenderField}
                    isLoading={false}
                />
            );

            // Spectrum Form components add specific ARIA roles
            const form = container.querySelector('form');
            expect(form).toBeInTheDocument();
        });

        it('applies scroll margin to section anchors for better UX', () => {
            const mockRenderField = jest.fn((field) => (
                <div key={field.key}>{field.label}</div>
            ));

            const { container } = renderWithSpectrum(
                <ConfigurationForm
                    serviceGroups={sampleServiceGroups}
                    renderField={mockRenderField}
                    isLoading={false}
                />
            );

            const section = container.querySelector('#section-adobe-commerce');
            expect(section).toHaveStyle({ scrollMarginTop: '-16px' });
        });
    });

    describe('Section styling', () => {
        it('applies bottom border to section headers', () => {
            const mockRenderField = jest.fn((field) => (
                <div key={field.key}>{field.label}</div>
            ));

            const { getAllByTestId } = renderWithSpectrum(
                <ConfigurationForm
                    serviceGroups={sampleServiceGroups}
                    renderField={mockRenderField}
                    isLoading={false}
                />
            );

            // Section headers should have a bottom border style
            const sectionHeaders = getAllByTestId('section-header');
            expect(sectionHeaders.length).toBeGreaterThan(0);
            expect(sectionHeaders[0]).toHaveStyle({ borderBottom: '1px solid var(--spectrum-global-color-gray-200)' });
        });
    });
});
