import { render, screen } from '@testing-library/react';
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

// Mock TwoColumnLayout
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
