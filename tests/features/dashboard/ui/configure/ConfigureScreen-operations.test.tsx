import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ConfigureScreen } from '@/features/dashboard/ui/configure/ConfigureScreen';
import '@testing-library/jest-dom';
import { mockProject, mockComponentsData } from './ConfigureScreen.testUtils';

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
jest.mock('@/core/ui/components/layout', () => ({
    TwoColumnLayout: ({ leftContent, rightContent }: any) => (
        <div>
            <div data-testid="left-column">{leftContent}</div>
            <div data-testid="right-column">{rightContent}</div>
        </div>
    ),
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

// Also mock the TwoColumnLayout separately for backward compatibility
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
            const user = userEvent.setup();
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
            const user = userEvent.setup();
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
            const user = userEvent.setup();
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
            const user = userEvent.setup();
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
});
