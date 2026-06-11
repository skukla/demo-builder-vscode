import { render, screen, waitFor, within } from '@testing-library/react';
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
        <div data-testid="page-header">
            <h1>{title}</h1>
            {subtitle && <h3>{subtitle}</h3>}
        </div>
    ),
    PageFooter: ({ leftContent, rightContent }: any) => (
        <div data-testid="page-footer">
            <div data-testid="footer-left">{leftContent}</div>
            <div data-testid="footer-right">{rightContent}</div>
        </div>
    ),
}));

jest.mock('@/core/ui/components/layout/TwoColumnLayout', () => ({
    TwoColumnLayout: ({ leftContent, rightContent }: any) => (
        <div>
            <div data-testid="left-column">{leftContent}</div>
            <div data-testid="right-column">{rightContent}</div>
        </div>
    ),
}));

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

jest.mock('@/features/components/ui/components/StoreConfigFieldRow', () => ({
    StoreConfigFieldRow: ({
        field,
        getFieldValue,
        updateField,
    }: {
        field: { key: string; label: string; required?: boolean };
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
                        onChange={(e) => updateField(field, e.target.value)}
                    />
                </label>
            </div>
        );
    },
}));

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

Element.prototype.scrollIntoView = jest.fn();

const renderWithProvider = (component: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme}>
            {component}
        </Provider>
    );
};

// A valid config so the Save button is enabled.
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

describe('ConfigureScreen - Authoring Experience radio (EDS only)', () => {
    let mockRequest: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        const { webviewClient } = require('@/core/ui/utils/WebviewClient');
        mockRequest = webviewClient.request as jest.Mock;
        mockRequest.mockResolvedValue({ success: true });
    });

    it('renders the Authoring Experience radio group for an EDS project', () => {
        renderWithProvider(
            <ConfigureScreen
                project={mockProject as any}
                componentsData={mockComponentsData}
                isEds
                authoringExperience="universal-editor"
            />
        );

        expect(screen.getByRole('radiogroup', { name: 'Authoring Experience' })).toBeInTheDocument();
        expect(screen.getByText('DA.live Classic')).toBeInTheDocument();
        expect(screen.getByText('Experience Workspace')).toBeInTheDocument();
    });

    it('adds a corresponding "Authoring" section to the right-column navigation for EDS', () => {
        renderWithProvider(
            <ConfigureScreen
                project={mockProject as any}
                componentsData={mockComponentsData}
                isEds
                authoringExperience="universal-editor"
            />
        );

        const rightColumn = screen.getByTestId('right-column');
        expect(within(rightColumn).getByText('Authoring')).toBeInTheDocument();
    });

    it('defaults the selection to the initial authoringExperience value', () => {
        renderWithProvider(
            <ConfigureScreen
                project={mockProject as any}
                componentsData={mockComponentsData}
                isEds
                authoringExperience="experience-workspace"
            />
        );

        const radios = screen.getAllByRole('radio') as HTMLInputElement[];
        const ew = radios.find((r) => r.value === 'experience-workspace');
        const ue = radios.find((r) => r.value === 'universal-editor');
        expect(ew?.checked).toBe(true);
        expect(ue?.checked).toBe(false);
    });

    it('does NOT render the radio group for a non-EDS project', () => {
        renderWithProvider(
            <ConfigureScreen
                project={mockProject as any}
                componentsData={mockComponentsData}
            />
        );

        expect(
            screen.queryByRole('radiogroup', { name: 'Authoring Experience' }),
        ).not.toBeInTheDocument();
    });

    it('includes the changed authoringExperience in the save payload for EDS', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

        renderWithProvider(
            <ConfigureScreen
                project={mockProject as any}
                componentsData={mockComponentsData}
                existingEnvValues={validConfig}
                isEds
                authoringExperience="universal-editor"
            />
        );

        // Flip to Experience Workspace
        const radios = screen.getAllByRole('radio') as HTMLInputElement[];
        const ew = radios.find((r) => r.value === 'experience-workspace')!;
        await user.click(ew);

        await waitFor(() => {
            const saveButton = screen.getByText('Save Changes');
            expect(saveButton).not.toBeDisabled();
        });
        await user.click(screen.getByText('Save Changes'));

        await waitFor(() => {
            expect(mockRequest).toHaveBeenCalledWith('save-configuration', expect.objectContaining({
                authoringExperience: 'experience-workspace',
            }));
        });
    });

    it('does NOT include authoringExperience in the save payload for non-EDS', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

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
        await user.click(screen.getByText('Save Changes'));

        await waitFor(() => {
            expect(mockRequest).toHaveBeenCalledWith(
                'save-configuration',
                expect.not.objectContaining({ authoringExperience: expect.anything() }),
            );
        });
    });
});
