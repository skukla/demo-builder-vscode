import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
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
        <>
            {component}
        </>
    );
};

describe('ConfigureScreen - Validation', () => {
    beforeAll(() => {
        // Mock scrollIntoView which is not implemented in jsdom
        Element.prototype.scrollIntoView = jest.fn();
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

            const urlField = document.getElementById('field-ADOBE_COMMERCE_URL')?.querySelector('input');
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
        });
    });
});
