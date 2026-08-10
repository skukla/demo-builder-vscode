import { render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ConfigureScreen } from '@/features/dashboard/ui/configure/ConfigureScreen';
import '@testing-library/jest-dom';
import {
    mockProject,
    mockComponentsData,
    selectSection,
    railTab,
    railTabLabels,
} from './ConfigureScreen.testUtils';

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

// Mock layout components. NOTE: the shell (`layout/StepAreaShell`) and the rail
// (`navigation/StepRail`) are deliberately NOT mocked — ConfigureScreen imports them by
// direct path and they are plain presentational markup, so these tests exercise the real
// rail the user clicks.
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

// Mock store discovery hooks & row — tested separately in ConfigureScreen-store-discovery.test.tsx.
// Here we just need them to render benignly so the existing rendering assertions still pass.
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

// Minimal stand-in for StoreConfigFieldRow — renders label + input so existing
// assertions on label text and input values continue to hold.
jest.mock('@/features/components/ui/components/StoreConfigFieldRow', () => ({
    StoreConfigFieldRow: ({
        field,
        getFieldValue,
    }: {
        field: { key: string; label: string; required?: boolean };
        getFieldValue: (field: { key: string }) => string | boolean | undefined;
    }) => {
        const value = getFieldValue(field);
        return (
            <div id={`field-${field.key}`}>
                <label>{field.label}{field.required ? '*' : ''}</label>
                <input value={value !== undefined && value !== null ? String(value) : ''} readOnly />
            </div>
        );
    },
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
        it('should render the active section\'s fields for selected components', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            selectSection('Adobe Commerce');
            expect(screen.getByText('Commerce URL', { exact: false })).toBeInTheDocument();
            expect(screen.getByText('GraphQL Endpoint', { exact: false })).toBeInTheDocument();
            expect(screen.getByText('Admin Username', { exact: false })).toBeInTheDocument();

            // Catalog API Key belongs to the OTHER group, so it is not on screen yet —
            // one section at a time is the whole point of the rail.
            expect(screen.queryByText('Catalog API Key', { exact: false })).not.toBeInTheDocument();

            selectSection('Catalog Service');
            expect(screen.getByText('Catalog API Key', { exact: false })).toBeInTheDocument();
            expect(screen.queryByText('Commerce URL', { exact: false })).not.toBeInTheDocument();
        });

        it('should display existing values from project config', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            selectSection('Adobe Commerce');
            const urlField = document.getElementById('field-ADOBE_COMMERCE_URL')?.querySelector('input');
            expect(urlField).toHaveValue('https://example.com');
        });
    });

    describe('Section rail', () => {
        it('renders one tab per configurable section, Project first', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            expect(railTabLabels()).toEqual(['Project', 'Adobe Commerce', 'Catalog Service']);
        });

        it('starts on Project and marks the clicked tab selected', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            expect(railTab('Project')).toHaveAttribute('aria-selected', 'true');

            selectSection('Catalog Service');
            expect(railTab('Catalog Service')).toHaveAttribute('aria-selected', 'true');
            expect(railTab('Project')).toHaveAttribute('aria-selected', 'false');
        });

        it('leaves every tab reachable — Configure is not a linear wizard', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            for (const tab of screen.getAllByRole('tab')) {
                expect(tab).not.toHaveAttribute('aria-disabled');
            }
        });

        it('no longer renders the Sections sidebar it replaced', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            expect(screen.queryByTestId('navigation-panel')).not.toBeInTheDocument();
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

    describe('AI Configuration View (removed)', () => {
        // The AI Configuration tab was removed. The standalone AI surface
        // (ShowAiCommand → AiOverviewScreen) replaced it. These assertions
        // guard against regressions that would re-introduce the tab inside
        // Configure.

        it('does not render an AI tab or AI sidebar inside Configure', () => {
            renderWithProvider(
                <ConfigureScreen
                    project={mockProject as any}
                    componentsData={mockComponentsData}
                />
            );

            expect(screen.queryByTestId('ai-setup-tab')).not.toBeInTheDocument();
            expect(screen.queryByTestId('ai-config-sidebar')).not.toBeInTheDocument();
            expect(screen.queryByTestId('ai-surface-sidebar')).not.toBeInTheDocument();
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

            selectSection('Adobe Commerce');
            const urlField = document.getElementById('field-ADOBE_COMMERCE_URL')?.querySelector('input');
            expect(urlField).toHaveValue(longValue);
        });
    });
});
