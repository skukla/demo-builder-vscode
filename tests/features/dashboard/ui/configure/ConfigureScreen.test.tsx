import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ConfigureScreen } from '@/features/dashboard/ui/configure/ConfigureScreen';
import '@testing-library/jest-dom';

// Mock the webview-ui utilities and hooks
jest.mock('@/core/ui/hooks', () => ({
    useSelectableDefault: jest.fn(() => ({})),
    useFocusTrap: jest.fn(() => ({ current: null })),
}));

jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: jest.fn(() => ({})),
}));

// Mock the WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        request: jest.fn(),
        onMessage: jest.fn(() => jest.fn()), // Return unsubscribe function
    },
}));

// Mock TwoColumnLayout component (complex layout component)
jest.mock('@/core/ui/components/layout/TwoColumnLayout', () => ({
    TwoColumnLayout: ({ leftContent, rightContent }: any) => (
        <div>
            <div data-testid="left-column">{leftContent}</div>
            <div data-testid="right-column">{rightContent}</div>
        </div>
    ),
}));

// Mock NavigationPanel
jest.mock('@/core/ui/components/navigation', () => ({
    NavigationPanel: ({ sections }: any) => (
        <div data-testid="navigation-panel">
            {sections?.map((section: any) => (
                <div key={section.id}>{section.label}</div>
            ))}
        </div>
    ),
    NavigationSection: ({ children }: any) => <div>{children}</div>,
    NavigationField: ({ children }: any) => <div>{children}</div>,
}));

// Mock FormField and ConfigSection
jest.mock('@/core/ui/components/forms', () => ({
    FormField: ({ label, value, onChange, error, showError }: any) => (
        <div data-testid={`field-${label}`}>
            <label>{label}</label>
            <input
                value={value || ''}
                onChange={(e) => onChange?.(e.target.value)}
                aria-invalid={showError}
            />
            {showError && <span data-testid="error">{error}</span>}
        </div>
    ),
    ConfigSection: ({ label, children }: any) => (
        <div data-testid={`section-${label}`}>
            <h3>{label}</h3>
            {children}
        </div>
    ),
}));

describe('ConfigureScreen', () => {
    let mockPostMessage: jest.Mock;
    let mockRequest: jest.Mock;

    const mockProject = {
        name: 'Test Project',
        path: '/test/path',
        componentSelections: {
            frontend: 'venia',
            backend: 'commerce-backend',
            dependencies: ['catalog-service'],
            integrations: [],
            appBuilder: [],
        },
        componentConfigs: {
            venia: {
                ADOBE_COMMERCE_URL: 'https://example.com',
            },
        },
    };

    const mockComponentsData = {
        frontends: [
            {
                id: 'venia',
                name: 'Venia Storefront',
                configuration: {
                    requiredEnvVars: ['ADOBE_COMMERCE_URL', 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT'],
                    optionalEnvVars: [],
                },
            },
        ],
        backends: [
            {
                id: 'commerce-backend',
                name: 'Commerce Backend',
                configuration: {
                    requiredEnvVars: ['ADOBE_COMMERCE_ADMIN_USERNAME'],
                    optionalEnvVars: [],
                },
            },
        ],
        dependencies: [
            {
                id: 'catalog-service',
                name: 'Catalog Service',
                configuration: {
                    requiredEnvVars: ['ADOBE_CATALOG_API_KEY'],
                    optionalEnvVars: [],
                },
            },
        ],
        envVars: {
            ADOBE_COMMERCE_URL: {
                key: 'ADOBE_COMMERCE_URL',
                label: 'Commerce URL',
                type: 'url' as const,
                required: true,
                group: 'adobe-commerce',
                placeholder: 'https://...',
            },
            ADOBE_COMMERCE_GRAPHQL_ENDPOINT: {
                key: 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT',
                label: 'GraphQL Endpoint',
                type: 'url' as const,
                required: true,
                group: 'adobe-commerce',
                placeholder: 'https://.../graphql',
            },
            ADOBE_COMMERCE_ADMIN_USERNAME: {
                key: 'ADOBE_COMMERCE_ADMIN_USERNAME',
                label: 'Admin Username',
                type: 'text' as const,
                required: true,
                group: 'adobe-commerce',
            },
            ADOBE_CATALOG_API_KEY: {
                key: 'ADOBE_CATALOG_API_KEY',
                label: 'Catalog API Key',
                type: 'text' as const,
                required: true,
                group: 'catalog-service',
            },
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();

        const { webviewClient } = require('@/core/ui/utils/WebviewClient');
        mockPostMessage = webviewClient.postMessage as jest.Mock;
        mockRequest = webviewClient.request as jest.Mock;
    });

    // Helper to wrap component in Provider
    const renderWithProvider = (component: React.ReactElement) => {
        return render(
            <Provider theme={defaultTheme}>
                {component}
            </Provider>
        );
    };

    describe('Rendering', () => {
        it('should render project name', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );
            expect(screen.getByText('Test Project')).toBeInTheDocument();
        });

        it('should render "Configure Project" heading', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );
            expect(screen.getByText('Configure Project')).toBeInTheDocument();
        });

        it('should render configuration settings heading', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );
            expect(screen.getByText('Configuration Settings')).toBeInTheDocument();
        });

        it('should render Save and Cancel buttons', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );
            expect(screen.getByText('Save Changes')).toBeInTheDocument();
            expect(screen.getByText('Cancel')).toBeInTheDocument();
        });
    });

    describe('Configuration Fields', () => {
        it('should render fields for selected components', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            // Should show fields from envVars
            expect(screen.getByText('Commerce URL')).toBeInTheDocument();
            expect(screen.getByText('GraphQL Endpoint')).toBeInTheDocument();
            expect(screen.getByText('Admin Username')).toBeInTheDocument();
            expect(screen.getByText('Catalog API Key')).toBeInTheDocument();
        });

        it('should display existing values from project config', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            const urlField = screen.getByTestId('field-Commerce URL').querySelector('input');
            expect(urlField).toHaveValue('https://example.com');
        });

        it('should group fields by service', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            // Should render section headings (may appear multiple times - in form and nav)
            expect(screen.getAllByText('Adobe Commerce').length).toBeGreaterThan(0);
            expect(screen.getAllByText('Catalog Service').length).toBeGreaterThan(0);
        });
    });

    describe('Field Validation', () => {
        it('should validate required fields on load', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                    existingEnvValues={{}}
                />
            );

            // Save button should be disabled if required fields empty
            const saveButton = screen.getByText('Save Changes').closest('button');
            expect(saveButton).toBeDisabled();
        });

        it('should validate URL fields', async () => {
            const user = userEvent.setup();
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            const urlField = screen.getByTestId('field-Commerce URL').querySelector('input');
            if (urlField) {
                await user.clear(urlField);
                await user.type(urlField, 'not-a-url');
                await user.tab(); // Trigger blur to mark field as touched

                // Should show validation error
                await waitFor(() => {
                    const errorElement = screen.queryByText('Please enter a valid URL');
                    expect(errorElement).toBeInTheDocument();
                });
            }
        });

        it('should enable save button when all required fields valid', async () => {
            const user = userEvent.setup();
            const validConfig = {
                venia: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
                'commerce-backend': {
                    ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                },
                'catalog-service': {
                    ADOBE_CATALOG_API_KEY: 'test-key-123',
                },
            };

            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                    existingEnvValues={validConfig}
                />
            );

            await waitFor(() => {
                const saveButton = screen.getByText('Save Changes');
                expect(saveButton).not.toBeDisabled();
            });
        });
    });

    describe('Save Functionality', () => {
        it('should send save-configuration message when Save clicked', async () => {
            const user = userEvent.setup();
            mockRequest.mockResolvedValue({ success: true });

            const validConfig = {
                venia: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
                'commerce-backend': {
                    ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                },
                'catalog-service': {
                    ADOBE_CATALOG_API_KEY: 'test-key-123',
                },
            };

            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                    existingEnvValues={validConfig}
                />
            );

            await waitFor(() => {
                const saveButton = screen.getByText('Save Changes');
                expect(saveButton).not.toBeDisabled();
            });

            const saveButton = screen.getByText('Save Changes');
            await user.click(saveButton);

            await waitFor(() => {
                expect(mockRequest).toHaveBeenCalledWith('save-configuration', {
                    componentConfigs: expect.any(Object),
                });
            });
        });

        it('should disable save button while saving', async () => {
            const user = userEvent.setup();
            mockRequest.mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
            );

            const validConfig = {
                venia: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
                'commerce-backend': {
                    ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                },
                'catalog-service': {
                    ADOBE_CATALOG_API_KEY: 'test-key-123',
                },
            };

            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                    existingEnvValues={validConfig}
                />
            );

            const saveButton = screen.getByText('Save Changes').closest('button');
            if (saveButton) await user.click(saveButton);

            // Button should show "Saving..." and be disabled
            const savingButton = screen.getByText('Saving...').closest('button');
            expect(savingButton).toBeInTheDocument();
            expect(savingButton).toBeDisabled();

            await waitFor(() => {
                expect(screen.getByText('Save Changes')).toBeInTheDocument();
            });
        });

        it('should handle save errors gracefully', async () => {
            const user = userEvent.setup();
            mockRequest.mockRejectedValue(new Error('Save failed'));

            const validConfig = {
                venia: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
                'commerce-backend': {
                    ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                },
                'catalog-service': {
                    ADOBE_CATALOG_API_KEY: 'test-key-123',
                },
            };

            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                    existingEnvValues={validConfig}
                />
            );

            const saveButton = screen.getByText('Save Changes');
            await user.click(saveButton);

            // Should not throw error (handled gracefully)
            await waitFor(() => {
                expect(screen.getByText('Save Changes')).toBeInTheDocument();
            });
        });
    });

    describe('Cancel Functionality', () => {
        it('should send cancel message when Cancel clicked', async () => {
            const user = userEvent.setup();
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            const cancelButton = screen.getByText('Cancel');
            await user.click(cancelButton);

            expect(mockPostMessage).toHaveBeenCalledWith('cancel');
        });
    });

    describe('Navigation Panel', () => {
        it('should render navigation panel with sections', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            const navPanel = screen.getByTestId('navigation-panel');
            expect(navPanel).toBeInTheDocument();

            // Should show section labels in navigation
            expect(screen.getAllByText('Adobe Commerce').length).toBeGreaterThan(0);
            expect(screen.getAllByText('Catalog Service').length).toBeGreaterThan(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty components data', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={{ envVars: {} }}
                />
            );

            expect(screen.getByText('No components requiring configuration were found.')).toBeInTheDocument();
        });

        it('should handle missing existing env values', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                    existingEnvValues={undefined}
                />
            );

            // Should render without errors
            expect(screen.getByText('Configure Project')).toBeInTheDocument();
        });

        it('should handle long field values without breaking layout', () => {
            const longValue = 'a'.repeat(500);
            const configWithLongValue = {
                venia: {
                    ADOBE_COMMERCE_URL: longValue,
                },
            };

            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                    existingEnvValues={configWithLongValue}
                />
            );

            const urlField = screen.getByTestId('field-Commerce URL').querySelector('input');
            expect(urlField).toHaveValue(longValue);
        });
    });
});
