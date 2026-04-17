/**
 * ConfigureScreen - Store Discovery Integration
 *
 * Verifies the Configure screen wires the wizard's auto-detect stack:
 * - useStoreDiscovery + useAutoStoreDetect hooks receive the correct inputs.
 * - sync-component-configs is posted whenever componentConfigs state changes,
 *   so the backend handler can read fresh credentials for store discovery.
 * - Each field inside a service group renders via StoreConfigFieldRow
 *   (which internally branches to plain FormField for non-store fields).
 */

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ConfigureScreen } from '@/features/dashboard/ui/configure/ConfigureScreen';
import '@testing-library/jest-dom';
import { mockProject, mockComponentsData } from './ConfigureScreen.testUtils';

// ── Hook mocks (declared first — jest.mock calls are hoisted) ───────────────

jest.mock('@/core/ui/hooks', () => ({
    useSelectableDefault: jest.fn(() => ({})),
    useFocusTrap: jest.fn(() => ({ current: null })),
}));

jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: jest.fn(() => ({})),
}));

// Track sync-component-configs posts
const postMessageMock = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: unknown[]) => postMessageMock(...args),
        request: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

// Capture the props passed to useAutoStoreDetect
const useAutoStoreDetectMock = jest.fn();
jest.mock('@/features/components/ui/hooks/useAutoStoreDetect', () => ({
    useAutoStoreDetect: (...args: unknown[]) => {
        useAutoStoreDetectMock(...args);
        return { autoDetectKey: undefined, forceFetch: jest.fn() };
    },
}));

const useStoreDiscoveryMock = jest.fn(() => ({
    isFetching: false,
    fetchError: null,
    hasStoreData: false,
    fetchStores: jest.fn(),
    getWebsiteItems: () => [],
    getStoreGroupItems: () => [],
    getStoreViewItems: () => [],
    isStoreGroup: (groupId: string) => groupId === 'accs' || groupId === 'adobe-commerce',
}));
jest.mock('@/features/components/ui/hooks/useStoreDiscovery', () => ({
    useStoreDiscovery: () => useStoreDiscoveryMock(),
}));

// Mock StoreConfigFieldRow — emit a testid-marked placeholder per field
interface StoreConfigFieldRowMockProps {
    field: { key: string };
    group: { id: string };
}
jest.mock('@/features/components/ui/components/StoreConfigFieldRow', () => ({
    StoreConfigFieldRow: ({ field, group }: StoreConfigFieldRowMockProps) => (
        <div data-testid={`store-row-${field.key}`} data-group={group.id}>
            {field.key}
        </div>
    ),
}));

// Mock layout components (same shape as other ConfigureScreen tests)
jest.mock('@/core/ui/components/layout', () => ({
    TwoColumnLayout: ({ leftContent, rightContent }: { leftContent: React.ReactNode; rightContent: React.ReactNode }) => (
        <div>
            <div data-testid="left-column">{leftContent}</div>
            <div data-testid="right-column">{rightContent}</div>
        </div>
    ),
    PageHeader: ({ title }: { title: string }) => <div data-testid="page-header"><h1>{title}</h1></div>,
    PageFooter: () => <div data-testid="page-footer" />,
}));

jest.mock('@/core/ui/components/layout/TwoColumnLayout', () => ({
    TwoColumnLayout: ({ leftContent, rightContent }: { leftContent: React.ReactNode; rightContent: React.ReactNode }) => (
        <div>
            <div data-testid="left-column">{leftContent}</div>
            <div data-testid="right-column">{rightContent}</div>
        </div>
    ),
}));

jest.mock('@/features/dashboard/ui/tabs/AiSetupTab', () => ({
    AiSetupTab: () => <div data-testid="ai-setup-tab" />,
}));

jest.mock('@/core/ui/components/navigation', () => ({
    NavigationPanel: () => <div data-testid="navigation-panel" />,
    NavigationSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    NavigationField: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const renderWithProvider = (component: React.ReactElement) =>
    render(<Provider theme={defaultTheme}>{component}</Provider>);

describe('ConfigureScreen - Store Discovery Integration', () => {
    beforeEach(() => {
        postMessageMock.mockClear();
        useAutoStoreDetectMock.mockClear();
        useStoreDiscoveryMock.mockClear();
    });

    it('posts sync-component-configs whenever componentConfigs state changes', async () => {
        // The Configure screen hydrates componentConfigs from existingEnvValues in a useEffect —
        // the effect triggers an additional sync after the initial render.
        renderWithProvider(
            <ConfigureScreen
                project={mockProject as never}
                componentsData={mockComponentsData}
                existingEnvValues={{ headless: { ADOBE_COMMERCE_URL: 'https://example.com' } }}
            />
        );

        await waitFor(() => {
            expect(postMessageMock).toHaveBeenCalledWith('sync-component-configs', expect.any(Object));
        });
    });

    it('invokes useAutoStoreDetect with orgId from project.adobe.organization', () => {
        const projectWithAdobe = {
            ...mockProject,
            adobe: { organization: '285361', projectId: 'p', projectName: 'pn', workspace: 'w', authenticated: true },
        };

        renderWithProvider(
            <ConfigureScreen
                project={projectWithAdobe as never}
                componentsData={mockComponentsData}
            />
        );

        expect(useAutoStoreDetectMock).toHaveBeenCalledWith(
            expect.objectContaining({ orgId: '285361' }),
        );
    });

    it('renders without error when project.adobe is undefined (orgId passed as undefined)', () => {
        const projectNoAdobe = { ...mockProject, adobe: undefined };

        renderWithProvider(
            <ConfigureScreen
                project={projectNoAdobe as never}
                componentsData={mockComponentsData}
            />
        );

        expect(useAutoStoreDetectMock).toHaveBeenCalledWith(
            expect.objectContaining({ orgId: undefined }),
        );
    });

    it('renders StoreConfigFieldRow for every field across all service groups', () => {
        renderWithProvider(
            <ConfigureScreen
                project={mockProject as never}
                componentsData={mockComponentsData}
            />
        );

        // Fields from the test fixture — see ConfigureScreen.testUtils.
        // All of these should render through StoreConfigFieldRow.
        expect(screen.getByTestId('store-row-ADOBE_COMMERCE_URL')).toBeInTheDocument();
        expect(screen.getByTestId('store-row-ADOBE_COMMERCE_GRAPHQL_ENDPOINT')).toBeInTheDocument();
        expect(screen.getByTestId('store-row-ADOBE_COMMERCE_ADMIN_USERNAME')).toBeInTheDocument();
        expect(screen.getByTestId('store-row-ADOBE_CATALOG_API_KEY')).toBeInTheDocument();
    });

    it('passes the correct service group id to StoreConfigFieldRow so store-group branching works', () => {
        renderWithProvider(
            <ConfigureScreen
                project={mockProject as never}
                componentsData={mockComponentsData}
            />
        );

        // Commerce URL is in the 'adobe-commerce' group (a store group per the mock isStoreGroup)
        const commerceUrlRow = screen.getByTestId('store-row-ADOBE_COMMERCE_URL');
        expect(commerceUrlRow.getAttribute('data-group')).toBe('adobe-commerce');

        // Catalog API key is in the non-store 'catalog-service' group
        const catalogKeyRow = screen.getByTestId('store-row-ADOBE_CATALOG_API_KEY');
        expect(catalogKeyRow.getAttribute('data-group')).toBe('catalog-service');
    });

    it('passes fetchStores, hasStoreData, isFetching to useAutoStoreDetect so the hook can coordinate', () => {
        renderWithProvider(
            <ConfigureScreen
                project={mockProject as never}
                componentsData={mockComponentsData}
            />
        );

        expect(useAutoStoreDetectMock).toHaveBeenCalledWith(
            expect.objectContaining({
                fetchStores: expect.any(Function),
                hasStoreData: false,
                isFetching: false,
                configs: expect.any(Object),
            }),
        );
    });
});
