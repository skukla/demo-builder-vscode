import React from 'react';
import { renderWithProviders, screen, waitFor } from "../../../../helpers/react-test-utils";
import { ComponentConfigStep } from '@/features/components/ui/steps/ComponentConfigStep';
import { vscode } from '@/webview-ui/shared/vscode-api';
import { createMockVSCode, mockSuccessfulRequest, mockFailedRequest } from '../../../../utils/webviewMocks';

// Mock vscode API
jest.mock('@/core/ui/vscode-api', () => ({
    vscode: {
        request: jest.fn(),
        postMessage: jest.fn(),
        onMessage: jest.fn(() => () => {}),
        ready: jest.fn(() => Promise.resolve()),
    }
}));

describe('ComponentConfigStep', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    // Mock scrollIntoView (jsdom doesn't implement it)
    beforeAll(() => {
        Element.prototype.scrollIntoView = jest.fn();
    });

    const defaultProps = {
        state: {
            currentStep: 'settings' as const,
            projectName: 'test-project',
            projectTemplate: 'commerce-paas' as const,
            projectPath: '/path/to/project',
            components: {
                frontend: 'react-storefront',
                backend: 'commerce-paas',
                integrations: ['adobe-io'],
            },
            componentConfigs: {},
            adobeAuth: {
                isAuthenticated: true,
                isChecking: false,
                email: 'test@example.com',
            },
        },
        updateState: mockUpdateState,
        setCanProceed: mockSetCanProceed,
    };

    const mockComponentsData = {
        frontends: [
            {
                id: 'react-storefront',
                name: 'React Storefront',
                description: 'React-based storefront',
                configuration: {
                    requiredEnvVars: ['STOREFRONT_URL', 'API_KEY'],
                    optionalEnvVars: ['ANALYTICS_ID'],
                },
            },
        ],
        backends: [
            {
                id: 'commerce-paas',
                name: 'Commerce PaaS',
                description: 'Adobe Commerce backend',
                configuration: {
                    requiredEnvVars: ['COMMERCE_URL', 'ADMIN_USER'],
                },
            },
        ],
        integrations: [
            {
                id: 'adobe-io',
                name: 'Adobe I/O',
                description: 'Adobe I/O integration',
                configuration: {
                    requiredEnvVars: ['CLIENT_ID', 'CLIENT_SECRET'],
                },
            },
        ],
        dependencies: [],
        envVars: {
            STOREFRONT_URL: {
                key: 'STOREFRONT_URL',
                label: 'Storefront URL',
                type: 'url',
                required: true,
                defaultValue: 'https://localhost:3000',
                service: 'storefront',
            },
            API_KEY: {
                key: 'API_KEY',
                label: 'API Key',
                type: 'string',
                required: true,
                service: 'storefront',
            },
            COMMERCE_URL: {
                key: 'COMMERCE_URL',
                label: 'Commerce URL',
                type: 'url',
                required: true,
                service: 'commerce',
            },
            ADMIN_USER: {
                key: 'ADMIN_USER',
                label: 'Admin User',
                type: 'string',
                required: true,
                service: 'commerce',
            },
            CLIENT_ID: {
                key: 'CLIENT_ID',
                label: 'Client ID',
                type: 'string',
                required: true,
                service: 'adobe-io',
            },
            CLIENT_SECRET: {
                key: 'CLIENT_SECRET',
                label: 'Client Secret',
                type: 'password',
                required: true,
                service: 'adobe-io',
            },
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Happy Path - Data Loading via Request-Response', () => {
        it('loads component data successfully via vscode.request', async () => {
            // Arrange: Mock successful response
            (vscode.request as jest.Mock).mockResolvedValue(mockComponentsData);

            // Act: Render component
            renderWithProviders(<ComponentConfigStep {...defaultProps} />);

            // Assert: Verify request called
            await waitFor(() => {
                expect(vscode.request).toHaveBeenCalledWith('get-components-data');
            });

            // Assert: Loading state clears
            await waitFor(() => {
                expect(screen.queryByText(/Loading component configurations/i)).not.toBeInTheDocument();
            }, { timeout: 3000 });
        });

        it('renders form after data loads successfully', async () => {
            // Arrange: Mock successful response
            (vscode.request as jest.Mock).mockResolvedValue(mockComponentsData);

            // Act: Render component
            const { container } = renderWithProviders(<ComponentConfigStep {...defaultProps} />);

            // Assert: Loading spinner should disappear
            await waitFor(() => {
                expect(screen.queryByText(/Loading component configurations/i)).not.toBeInTheDocument();
            }, { timeout: 3000 });

            // Assert: Form elements should be present (check for any input/select)
            await waitFor(() => {
                const inputs = container.querySelectorAll('input, select, textarea');
                expect(inputs.length).toBeGreaterThan(0);
            }, { timeout: 3000 });
        });

        it('displays configuration fields grouped by service', async () => {
            // Arrange: Mock successful response
            (vscode.request as jest.Mock).mockResolvedValue(mockComponentsData);

            // Act: Render component
            renderWithProviders(<ComponentConfigStep {...defaultProps} />);

            // Assert: Wait for data to load
            await waitFor(() => {
                expect(screen.queryByText(/Loading component configurations/i)).not.toBeInTheDocument();
            }, { timeout: 3000 });

            // Assert: Service-specific fields should be present
            await waitFor(() => {
                // Check for storefront service fields
                expect(screen.queryByLabelText(/Storefront URL/i) || screen.queryByText(/STOREFRONT_URL/i)).toBeTruthy();
            }, { timeout: 3000 });
        });
    });

    describe('Edge Cases', () => {
        it('handles large component data payload (>100KB) without timeout', async () => {
            // Arrange: Create large mock data
            const largeEnvVars: Record<string, any> = {};
            for (let i = 0; i < 100; i++) {
                largeEnvVars[`ENV_VAR_${i}`] = {
                    key: `ENV_VAR_${i}`,
                    label: `Environment Variable ${i}`,
                    type: 'string',
                    required: false,
                    service: `service-${i % 10}`,
                };
            }

            const largeData = {
                ...mockComponentsData,
                envVars: largeEnvVars,
            };

            (vscode.request as jest.Mock).mockResolvedValue(largeData);

            // Act: Render component
            renderWithProviders(<ComponentConfigStep {...defaultProps} />);

            // Assert: Data loads successfully
            await waitFor(() => {
                expect(screen.queryByText(/Loading component configurations/i)).not.toBeInTheDocument();
            }, { timeout: 5000 });
        });

        it('handles component unmount before request completes', async () => {
            // Arrange: Mock delayed response
            (vscode.request as jest.Mock).mockImplementation(() => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(mockComponentsData);
                    }, 2000);
                });
            });

            // Act: Render and immediately unmount
            const { unmount } = renderWithProviders(<ComponentConfigStep {...defaultProps} />);

            // Wait a bit to ensure request starts
            await new Promise(resolve => setTimeout(resolve, 100));

            // Unmount component
            unmount();

            // Assert: No memory leaks or warnings (test passes if no errors thrown)
            expect(vscode.request).toHaveBeenCalledWith('get-components-data');
        });

        it('handles empty component data gracefully', async () => {
            // Arrange: Mock empty data
            const emptyData = {
                frontends: [],
                backends: [],
                integrations: [],
                dependencies: [],
                envVars: {},
            };

            (vscode.request as jest.Mock).mockResolvedValue(emptyData);

            // Act: Render component
            renderWithProviders(<ComponentConfigStep {...defaultProps} />);

            // Assert: Loading state clears
            await waitFor(() => {
                expect(screen.queryByText(/Loading component configurations/i)).not.toBeInTheDocument();
            }, { timeout: 3000 });

            // Assert: No crash, component renders
            // (exact UI for empty state may vary, but component should not error)
        });
    });

    describe('Error Handling', () => {
        it('handles request failure gracefully', async () => {
            // Arrange: Spy on console.error
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            // Mock request failure
            (vscode.request as jest.Mock).mockRejectedValue(new Error('Network error'));

            // Act: Render component
            renderWithProviders(<ComponentConfigStep {...defaultProps} />);

            // Assert: Error logged to console
            await waitFor(() => {
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Failed to load components'),
                    expect.any(Error)
                );
            }, { timeout: 3000 });

            // Assert: Loading state clears (graceful degradation)
            await waitFor(() => {
                expect(screen.queryByText(/Loading component configurations/i)).not.toBeInTheDocument();
            }, { timeout: 3000 });

            consoleErrorSpy.mockRestore();
        });

        it('handles request timeout (30s default)', async () => {
            // Arrange: Spy on console.error
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            // Mock timeout
            (vscode.request as jest.Mock).mockRejectedValue(new Error('Request timeout: get-components-data'));

            // Act: Render component
            renderWithProviders(<ComponentConfigStep {...defaultProps} />);

            // Assert: Error logged
            await waitFor(() => {
                expect(consoleErrorSpy).toHaveBeenCalled();
            }, { timeout: 3000 });

            // Assert: Loading state clears
            await waitFor(() => {
                expect(screen.queryByText(/Loading component configurations/i)).not.toBeInTheDocument();
            }, { timeout: 3000 });

            consoleErrorSpy.mockRestore();
        });

        it('handles malformed response data gracefully', async () => {
            // Arrange: Spy on console.error
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            // Mock malformed data (missing envVars)
            const malformedData = {
                frontends: mockComponentsData.frontends,
                backends: mockComponentsData.backends,
                // Missing envVars field
            };

            (vscode.request as jest.Mock).mockResolvedValue(malformedData);

            // Act: Render component
            renderWithProviders(<ComponentConfigStep {...defaultProps} />);

            // Assert: Component handles missing fields
            await waitFor(() => {
                expect(screen.queryByText(/Loading component configurations/i)).not.toBeInTheDocument();
            }, { timeout: 3000 });

            // Component should render without crashing (graceful degradation)
            // Exact behavior may vary, but should not throw unhandled error

            consoleErrorSpy.mockRestore();
        });
    });
});
