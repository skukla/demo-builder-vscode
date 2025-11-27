import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as SpectrumProvider, defaultTheme } from '@adobe/react-spectrum';
import { DependencySelector } from '@/features/components/ui/steps/components/DependencySelector';

// Test wrapper for Spectrum components
function renderWithSpectrum(ui: React.ReactElement) {
    return render(
        <SpectrumProvider theme={defaultTheme}>
            {ui}
        </SpectrumProvider>
    );
}

describe('DependencySelector', () => {
    const mockOnIntegrationsChange = jest.fn();
    const mockOnAppBuilderChange = jest.fn();

    const integrationsOptions = [
        {
            id: 'experience-platform',
            name: 'Experience Platform',
            description: 'Adobe Experience Platform integration',
        },
        {
            id: 'analytics',
            name: 'Adobe Analytics',
            description: 'Web analytics and reporting',
        },
    ];

    const appBuilderOptions = [
        {
            id: 'integration-service',
            name: 'Integration Service',
            description: 'Custom integration service app',
        },
        {
            id: 'data-sync',
            name: 'Data Sync Service',
            description: 'Real-time data synchronization',
        },
    ];

    beforeEach(() => {
        mockOnIntegrationsChange.mockClear();
        mockOnAppBuilderChange.mockClear();
    });

    describe('Section rendering', () => {
        it('renders External Systems and App Builder sections', () => {
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            expect(screen.getByText('External Systems')).toBeInTheDocument();
            expect(screen.getByText('App Builder Apps')).toBeInTheDocument();
        });

        it('renders all integration options', () => {
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            expect(screen.getByText('Experience Platform')).toBeInTheDocument();
            expect(screen.getByText('Adobe Experience Platform integration')).toBeInTheDocument();
            expect(screen.getByText('Adobe Analytics')).toBeInTheDocument();
            expect(screen.getByText('Web analytics and reporting')).toBeInTheDocument();
        });

        it('renders all App Builder options', () => {
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            expect(screen.getByText('Integration Service')).toBeInTheDocument();
            expect(screen.getByText('Custom integration service app')).toBeInTheDocument();
            expect(screen.getByText('Data Sync Service')).toBeInTheDocument();
            expect(screen.getByText('Real-time data synchronization')).toBeInTheDocument();
        });
    });

    describe('Integration selection', () => {
        it('calls onIntegrationsChange when integration is selected', async () => {
            const user = userEvent.setup();
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            const expPlatformCheckbox = screen.getByLabelText('Experience Platform');
            await user.click(expPlatformCheckbox);

            expect(mockOnIntegrationsChange).toHaveBeenCalledWith('experience-platform', true);
        });

        it('calls onIntegrationsChange when integration is deselected', async () => {
            const user = userEvent.setup();
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set(['experience-platform'])}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            const expPlatformCheckbox = screen.getByLabelText('Experience Platform');
            await user.click(expPlatformCheckbox);

            expect(mockOnIntegrationsChange).toHaveBeenCalledWith('experience-platform', false);
        });

        it('displays selected integrations as checked', () => {
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set(['experience-platform', 'analytics'])}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            const expPlatformCheckbox = screen.getByLabelText('Experience Platform');
            const analyticsCheckbox = screen.getByLabelText('Adobe Analytics');

            expect(expPlatformCheckbox).toBeChecked();
            expect(analyticsCheckbox).toBeChecked();
        });

        it('displays unselected integrations as unchecked', () => {
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            const expPlatformCheckbox = screen.getByLabelText('Experience Platform');
            const analyticsCheckbox = screen.getByLabelText('Adobe Analytics');

            expect(expPlatformCheckbox).not.toBeChecked();
            expect(analyticsCheckbox).not.toBeChecked();
        });
    });

    describe('App Builder selection', () => {
        it('calls onAppBuilderChange when app is selected', async () => {
            const user = userEvent.setup();
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            const integrationServiceCheckbox = screen.getByLabelText('Integration Service');
            await user.click(integrationServiceCheckbox);

            expect(mockOnAppBuilderChange).toHaveBeenCalledWith('integration-service', true);
        });

        it('calls onAppBuilderChange when app is deselected', async () => {
            const user = userEvent.setup();
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set(['integration-service'])}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            const integrationServiceCheckbox = screen.getByLabelText('Integration Service');
            await user.click(integrationServiceCheckbox);

            expect(mockOnAppBuilderChange).toHaveBeenCalledWith('integration-service', false);
        });

        it('displays selected apps as checked', () => {
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set(['integration-service', 'data-sync'])}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            const integrationServiceCheckbox = screen.getByLabelText('Integration Service');
            const dataSyncCheckbox = screen.getByLabelText('Data Sync Service');

            expect(integrationServiceCheckbox).toBeChecked();
            expect(dataSyncCheckbox).toBeChecked();
        });

        it('displays unselected apps as unchecked', () => {
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            const integrationServiceCheckbox = screen.getByLabelText('Integration Service');
            const dataSyncCheckbox = screen.getByLabelText('Data Sync Service');

            expect(integrationServiceCheckbox).not.toBeChecked();
            expect(dataSyncCheckbox).not.toBeChecked();
        });
    });

    describe('Accessibility', () => {
        it('provides aria-labels for integration checkboxes', () => {
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            expect(screen.getByLabelText('Experience Platform')).toBeInTheDocument();
            expect(screen.getByLabelText('Adobe Analytics')).toBeInTheDocument();
        });

        it('provides aria-labels for App Builder checkboxes', () => {
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            expect(screen.getByLabelText('Integration Service')).toBeInTheDocument();
            expect(screen.getByLabelText('Data Sync Service')).toBeInTheDocument();
        });
    });

    describe('Empty states', () => {
        it('handles empty integrations gracefully', () => {
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={[]}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            // Should still render the section
            expect(screen.getByText('External Systems')).toBeInTheDocument();
        });

        it('handles empty App Builder apps gracefully', () => {
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={[]}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            // Should still render the section
            expect(screen.getByText('App Builder Apps')).toBeInTheDocument();
        });

        it('handles empty selections without errors', () => {
            renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            // All checkboxes should be unchecked
            const checkboxes = screen.getAllByRole('checkbox');
            checkboxes.forEach(checkbox => {
                expect(checkbox).not.toBeChecked();
            });
        });
    });

    describe('Visual styling', () => {
        it('renders sections with proper styling containers', () => {
            const { container } = renderWithSpectrum(
                <DependencySelector
                    integrationsOptions={integrationsOptions}
                    appBuilderOptions={appBuilderOptions}
                    selectedIntegrations={new Set()}
                    selectedAppBuilder={new Set()}
                    onIntegrationsChange={mockOnIntegrationsChange}
                    onAppBuilderChange={mockOnAppBuilderChange}
                />
            );

            // Check for styled containers (border, rounded, bg-gray-50, p-3)
            const styledContainers = container.querySelectorAll('[class*="border"]');
            expect(styledContainers.length).toBeGreaterThan(0);
        });
    });
});
