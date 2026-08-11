import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ConfigureScreen } from '@/features/dashboard/ui/configure/ConfigureScreen';
import '@testing-library/jest-dom';
import { mockProject, mockComponentsData, selectSection } from './ConfigureScreen.testUtils';

// Mock hooks
jest.mock('@/core/ui/hooks', () => ({
    useSelectableDefault: jest.fn(() => ({})),
    useFocusTrap: jest.fn(() => ({ current: null })),
}));

jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: jest.fn(() => ({})),
}));

// Mock WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        request: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

// Mock layout components
// The shell + rail are NOT mocked (direct-path imports), so these tests drive the
// real rail when they need to reach a section other than Project.
jest.mock('@/core/ui/components/layout', () => ({
    PageHeader: ({ title, subtitle }: any) => (
        <div data-testid="page-header" className="border-b bg-gray-75">
            <h1>{title}</h1>
            {subtitle && <h3>{subtitle}</h3>}
        </div>
    ),
    PageFooter: ({ leftContent, rightContent }: any) => (
        <div data-testid="page-footer" className="border-t bg-gray-75 max-w-800">
            <div data-testid="footer-left">{leftContent}</div>
            <div data-testid="footer-right">{rightContent}</div>
        </div>
    ),
}));

// Mock store discovery — tested separately in ConfigureScreen-store-discovery.test.tsx.
// Here, stub the hooks so the connection-aware branching in StoreConfigFieldRow doesn't
// hide optional store-group fields (operations test interacts with those directly).
jest.mock('@/features/components/ui/hooks/useStoreDiscovery', () => ({
    useStoreDiscovery: () => ({
        isFetching: false,
        fetchError: null,
        hasStoreData: false,
        fetchStores: jest.fn(),
        getWebsiteItems: () => [],
        getStoreGroupItems: () => [],
        getStoreViewItems: () => [],
        isStoreGroup: () => false,
    }),
}));

jest.mock('@/features/components/ui/hooks/useAutoStoreDetect', () => ({
    useAutoStoreDetect: () => ({ autoDetectKey: undefined, forceFetch: jest.fn() }),
}));

// Render StoreConfigFieldRow as a simple input so userEvent can interact with it
jest.mock('@/features/components/ui/components/StoreConfigFieldRow', () => ({
    StoreConfigFieldRow: ({
        field,
        getFieldValue,
        updateField,
    }: {
        field: { key: string; label: string; required?: boolean; placeholder?: string };
        getFieldValue: (field: { key: string }) => string | boolean | undefined;
        updateField: (field: { key: string }, value: string) => void;
    }) => {
        const value = getFieldValue(field);
        const displayValue = value !== undefined && value !== null ? String(value) : '';
        return (
            <div id={`field-${field.key}`}>
                <label>
                    {field.label}
                    <input
                        type="text"
                        value={displayValue}
                        placeholder={field.placeholder}
                        onChange={(e) => updateField(field, e.target.value)}
                    />
                </label>
            </div>
        );
    },
}));

// Mock scrollIntoView for JSDOM
Element.prototype.scrollIntoView = jest.fn();

// Helper to wrap component in Provider
const renderWithProvider = (component: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme}>
            {component}
        </Provider>
    );
};

describe('ConfigureScreen - Operations', () => {
    let mockPostMessage: jest.Mock;
    let mockRequest: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();

        const { webviewClient } = require('@/core/ui/utils/WebviewClient');
        mockPostMessage = webviewClient.postMessage as jest.Mock;
        mockRequest = webviewClient.request as jest.Mock;
    });

    describe('Save Functionality', () => {
        it('should send save-configuration message when Save clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            mockRequest.mockResolvedValue({ success: true });

            // Use component IDs that match mockComponentsData: headless, adobe-commerce-paas, catalog-service
            const validConfig = {
                headless: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
                'adobe-commerce-paas': {
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
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            mockRequest.mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
            );

            // Use component IDs that match mockComponentsData
            const validConfig = {
                headless: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
                'adobe-commerce-paas': {
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
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            mockRequest.mockRejectedValue(new Error('Save failed'));

            // Use component IDs that match mockComponentsData
            const validConfig = {
                headless: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
                'adobe-commerce-paas': {
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

    describe('Close Functionality', () => {
        it('should send cancel message when Close clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            const closeButton = screen.getByText('Close');
            await user.click(closeButton);

            expect(mockPostMessage).toHaveBeenCalledWith('cancel');
        });
    });

    describe('Field Clearing Behavior', () => {
        it('should allow clearing a field with a default value (not auto-fill)', async () => {
            // Given: A field with a default value that has an existing value
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const existingValues = {
                headless: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                    OPTIONAL_WITH_DEFAULT: 'user-entered-value',
                },
                'adobe-commerce-paas': {
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
                    existingEnvValues={existingValues}
                />
            );

            // When: User navigates to the group that owns it and clears the optional field
            selectSection('Adobe Commerce');
            const optionalField = await screen.findByLabelText(/Optional Field with Default/i);
            expect(optionalField).toHaveValue('user-entered-value');

            await user.clear(optionalField);

            // Then: The field should remain empty (not auto-fill with default)
            await waitFor(() => {
                expect(optionalField).toHaveValue('');
            });
        });

        it('should allow user to type after clearing a field', async () => {
            // Given: A field with an existing value
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const existingValues = {
                headless: {
                    ADOBE_COMMERCE_URL: 'https://old-url.com',
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
                'adobe-commerce-paas': {
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
                    existingEnvValues={existingValues}
                />
            );

            // When: User navigates to the group, then clears and types a new value
            selectSection('Adobe Commerce');
            const urlField = await screen.findByLabelText(/Commerce URL/i);
            expect(urlField).toHaveValue('https://old-url.com');

            await user.clear(urlField);
            await user.type(urlField, 'https://new-url.com');

            // Then: The field should have the new value
            await waitFor(() => {
                expect(urlField).toHaveValue('https://new-url.com');
            });
        });
    });

    describe('Cross-section save', () => {
        // The invariant a one-section-at-a-time layout most easily breaks: only the
        // active section is mounted, so an edit made in a section the user has since
        // navigated away from must still reach the save payload. `componentConfigs`
        // stays lifted in ConfigureScreen for exactly this reason.
        it('saves an edit made in section A after switching to section B', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            mockRequest.mockResolvedValue({ success: true });

            const validConfig = {
                headless: {
                    ADOBE_COMMERCE_URL: 'https://example.com',
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
                'adobe-commerce-paas': {
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

            // Edit in section A…
            selectSection('Adobe Commerce');
            const urlField = await screen.findByLabelText(/Commerce URL/i);
            await user.clear(urlField);
            await user.type(urlField, 'https://edited.example.com');

            // …then walk away to section B, which unmounts A's fields entirely.
            selectSection('Catalog Service');
            expect(screen.queryByLabelText(/Commerce URL/i)).not.toBeInTheDocument();

            await waitFor(() => {
                expect(screen.getByText('Save Changes')).not.toBeDisabled();
            });
            await user.click(screen.getByText('Save Changes'));

            await waitFor(() => {
                expect(mockRequest).toHaveBeenCalledWith(
                    'save-configuration',
                    expect.objectContaining({
                        componentConfigs: expect.objectContaining({
                            headless: expect.objectContaining({
                                ADOBE_COMMERCE_URL: 'https://edited.example.com',
                            }),
                        }),
                    }),
                );
            });
        });
    });
});
