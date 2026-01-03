import { render, screen } from '@testing-library/react';
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

describe('ConfigureScreen - Rendering', () => {
    describe('Basic Rendering', () => {
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

        it('should render Save button', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );
            expect(screen.getByText('Save Changes')).toBeInTheDocument();
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
            expect(screen.getByText('Commerce URL', { exact: false })).toBeInTheDocument();
            expect(screen.getByText('GraphQL Endpoint', { exact: false })).toBeInTheDocument();
            expect(screen.getByText('Admin Username', { exact: false })).toBeInTheDocument();
            expect(screen.getByText('Catalog API Key', { exact: false })).toBeInTheDocument();
        });

        it('should display existing values from project config', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            const urlField = document.getElementById('field-ADOBE_COMMERCE_URL')?.querySelector('input');
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

    describe('PageHeader Integration', () => {
        it('should render PageHeader with "Configure Project" title', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            const header = screen.getByTestId('page-header');
            expect(header).toBeInTheDocument();
            expect(screen.getByText('Configure Project')).toBeInTheDocument();
        });

        it('should render PageHeader with project name as subtitle', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            const header = screen.getByTestId('page-header');
            expect(header).toBeInTheDocument();
            expect(screen.getByText('Test Project')).toBeInTheDocument();
        });
    });

    describe('PageFooter Integration', () => {
        it('should render PageFooter with Close button on left', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            const footer = screen.getByTestId('page-footer');
            expect(footer).toBeInTheDocument();

            const footerLeft = screen.getByTestId('footer-left');
            expect(footerLeft).toContainElement(screen.getByText('Close'));
        });

        it('should render PageFooter with Save Changes button on right', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            const footer = screen.getByTestId('page-footer');
            expect(footer).toBeInTheDocument();

            const footerRight = screen.getByTestId('footer-right');
            expect(footerRight).toContainElement(screen.getByText('Save Changes'));
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

            const urlField = document.getElementById('field-ADOBE_COMMERCE_URL')?.querySelector('input');
            expect(urlField).toHaveValue(longValue);
        });
    });
});
