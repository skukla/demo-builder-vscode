import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Provider as SpectrumProvider, defaultTheme } from '@adobe/react-spectrum';
import { ConfigNavigationPanel } from '@/features/components/ui/steps/components/ConfigNavigationPanel';
import { ServiceGroup } from '@/features/components/ui/steps/ComponentConfigStep';

// Test wrapper for Spectrum components
function renderWithSpectrum(ui: React.ReactElement) {
    return render(
        <SpectrumProvider theme={defaultTheme}>
            {ui}
        </SpectrumProvider>
    );
}

describe('ConfigNavigationPanel', () => {
    const mockNavigateToSection = jest.fn();
    const mockNavigateToField = jest.fn();
    const mockToggleNavSection = jest.fn();

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
                {
                    key: 'ADOBE_COMMERCE_ADMIN_PASSWORD',
                    label: 'Admin Password',
                    type: 'password',
                    required: false,
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

    beforeEach(() => {
        mockNavigateToSection.mockClear();
        mockNavigateToField.mockClear();
        mockToggleNavSection.mockClear();
    });

    describe('Section rendering', () => {
        it('renders all service group sections', () => {
            renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={new Set()}
                    activeSection={null}
                    activeField={null}
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={() => ''}
                />
            );

            expect(screen.getByText('Adobe Commerce')).toBeInTheDocument();
            expect(screen.getByText('API Mesh')).toBeInTheDocument();
        });

        it('displays chevron icons for expandable sections', () => {
            renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={new Set()}
                    activeSection={null}
                    activeField={null}
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={() => ''}
                />
            );

            // ChevronRight icons for collapsed sections
            const sections = screen.getAllByRole('button');
            expect(sections.length).toBeGreaterThan(0);
        });
    });

    describe('Section expansion', () => {
        it('shows fields when section is expanded', () => {
            const expandedSections = new Set(['adobe-commerce']);

            renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={expandedSections}
                    activeSection={null}
                    activeField={null}
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={() => ''}
                />
            );

            expect(screen.getByText('Commerce URL')).toBeInTheDocument();
            expect(screen.getByText('Admin Username')).toBeInTheDocument();
            expect(screen.getByText('Admin Password')).toBeInTheDocument();
        });

        it('hides fields when section is collapsed', () => {
            const expandedSections = new Set<string>();

            renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={expandedSections}
                    activeSection={null}
                    activeField={null}
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={() => ''}
                />
            );

            expect(screen.queryByText('Commerce URL')).not.toBeInTheDocument();
            expect(screen.queryByText('Admin Username')).not.toBeInTheDocument();
        });

        it('calls onToggleNavSection when section header is clicked', () => {
            renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={new Set()}
                    activeSection={null}
                    activeField={null}
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={() => ''}
                />
            );

            const commerceSection = screen.getByText('Adobe Commerce').closest('button');
            fireEvent.click(commerceSection!);

            expect(mockToggleNavSection).toHaveBeenCalledWith('adobe-commerce');
        });
    });

    describe('Section completion status', () => {
        it('shows checkmark when all required fields are complete', () => {
            const getFieldValue = (field: any) => {
                if (field.key === 'ADOBE_COMMERCE_URL') return 'https://example.com';
                if (field.key === 'ADOBE_COMMERCE_ADMIN_USERNAME') return 'admin';
                return '';
            };

            renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={new Set()}
                    activeSection={null}
                    activeField={null}
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={getFieldValue}
                />
            );

            // Check for checkmarks (✓)
            const checkmarks = screen.getAllByText('✓');
            expect(checkmarks.length).toBeGreaterThan(0);
        });

        it('shows completion fraction when some required fields are incomplete', () => {
            const getFieldValue = (field: any) => {
                if (field.key === 'ADOBE_COMMERCE_URL') return 'https://example.com';
                return '';
            };

            renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={new Set()}
                    activeSection={null}
                    activeField={null}
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={getFieldValue}
                />
            );

            // Should show "1/2" for Adobe Commerce (1 of 2 required fields filled)
            expect(screen.getByText('1/2')).toBeInTheDocument();
        });

        it('shows "Optional" for sections with no required fields', () => {
            const getFieldValue = () => '';

            renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={new Set()}
                    activeSection={null}
                    activeField={null}
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={getFieldValue}
                />
            );

            // API Mesh section has no required fields
            expect(screen.getByText('Optional')).toBeInTheDocument();
        });
    });

    describe('Active section highlighting', () => {
        it('highlights active section with blue border and background', () => {
            const { container } = renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={new Set()}
                    activeSection="adobe-commerce"
                    activeField={null}
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={() => ''}
                />
            );

            const activeButton = screen.getByText('Adobe Commerce').closest('button');
            expect(activeButton).toHaveStyle({
                borderLeft: '3px solid var(--spectrum-global-color-blue-500)',
            });
        });

        it('does not highlight inactive sections', () => {
            const { container } = renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={new Set()}
                    activeSection="adobe-commerce"
                    activeField={null}
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={() => ''}
                />
            );

            const inactiveButton = screen.getByText('API Mesh').closest('button');
            expect(inactiveButton).toHaveStyle({
                borderLeft: '1px solid var(--spectrum-global-color-gray-300)',
            });
        });
    });

    describe('Field navigation', () => {
        it('calls onNavigateToField when field is clicked', () => {
            const expandedSections = new Set(['adobe-commerce']);

            renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={expandedSections}
                    activeSection={null}
                    activeField={null}
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={() => ''}
                />
            );

            const urlField = screen.getByText('Commerce URL').closest('button');
            fireEvent.click(urlField!);

            expect(mockNavigateToField).toHaveBeenCalledWith('ADOBE_COMMERCE_URL');
        });

        it('highlights active field with blue background and text', () => {
            const expandedSections = new Set(['adobe-commerce']);

            renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={expandedSections}
                    activeSection="adobe-commerce"
                    activeField="ADOBE_COMMERCE_URL"
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={() => ''}
                />
            );

            const activeFieldButton = screen.getByText('Commerce URL').closest('button');
            expect(activeFieldButton).toHaveStyle({
                background: 'var(--spectrum-global-color-blue-100)',
                borderLeft: '2px solid var(--spectrum-global-color-blue-500)',
            });
        });

        it('shows checkmark next to completed fields', () => {
            const expandedSections = new Set(['adobe-commerce']);
            const getFieldValue = (field: any) => {
                if (field.key === 'ADOBE_COMMERCE_URL') return 'https://example.com';
                return '';
            };

            renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={expandedSections}
                    activeSection={null}
                    activeField={null}
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={getFieldValue}
                />
            );

            // The field row with "Commerce URL" should have a checkmark
            const urlFieldRow = screen.getByText('Commerce URL').closest('button');
            const checkmark = within(urlFieldRow as HTMLElement).getByTestId('field-complete-checkmark');
            expect(checkmark).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('sets tabIndex={-1} on navigation buttons to prevent tab interference', () => {
            renderWithSpectrum(
                <ConfigNavigationPanel
                    serviceGroups={sampleServiceGroups}
                    expandedNavSections={new Set()}
                    activeSection={null}
                    activeField={null}
                    onNavigateToSection={mockNavigateToSection}
                    onNavigateToField={mockNavigateToField}
                    onToggleNavSection={mockToggleNavSection}
                    getFieldValue={() => ''}
                />
            );

            const buttons = screen.getAllByRole('button');
            buttons.forEach(button => {
                expect(button).toHaveAttribute('tabIndex', '-1');
            });
        });
    });
});
