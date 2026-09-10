/**
 * ConfigureScreen - Store Discovery Integration
 *
 * Verifies the Configure screen wires the wizard's auto-detect stack:
 * - useStoreDiscovery + useAutoStoreDetect hooks receive the correct inputs.
 * - Each field inside a service group renders via StoreConfigFieldRow
 *   (which internally branches to plain FormField for non-store fields).
 */

import '../../../../helpers/webviewClientMock';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ConfigureScreen } from '@/features/dashboard/ui/configure/ConfigureScreen';
import '@testing-library/jest-dom';
import { mockProject, mockComponentsData, selectSection } from './ConfigureScreen.testUtils';

// ── Hook mocks (declared first — jest.mock calls are hoisted) ───────────────

jest.mock('@/core/ui/hooks/useFocusTrap', () => ({
    useFocusTrap: jest.fn(() => ({ current: null })),
}));

jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: jest.fn(() => ({})),
}));

jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: jest.fn(() => ({})),
}));

// WebviewClient mock (postMessage spy for any outbound messages)
const postMessageMock = jest.fn();
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

// Mock layout components. The shell + rail are NOT mocked (direct-path imports), so
// these tests use the real rail to reach each service group.
jest.mock('@/core/ui/components/layout/PageFooter', () => ({
    PageFooter: () => <div data-testid="page-footer" />,
}));

jest.mock('@/core/ui/components/layout/PageHeader', () => ({
    PageHeader: ({ title }: { title: string }) => (
        <div data-testid="page-header">
            <h1>{title}</h1>
        </div>
    ),
}));

const renderWithProvider = (component: React.ReactElement) =>
    render(<Provider theme={defaultTheme}>{component}</Provider>);

describe('ConfigureScreen - Store Discovery Integration', () => {
    beforeEach(() => {
        postMessageMock.mockClear();
        useAutoStoreDetectMock.mockClear();
        useStoreDiscoveryMock.mockClear();
    });

    it('invokes useAutoStoreDetect with orgId from project.adobe.organization', () => {
        const projectWithAdobe = {
            ...mockProject,
            adobe: {
                organization: '285361',
                projectId: 'p',
                projectName: 'pn',
                workspace: 'w',
                authenticated: true,
            },
        };

        renderWithProvider(
            <ConfigureScreen project={projectWithAdobe} componentsData={mockComponentsData} />
        );

        expect(useAutoStoreDetectMock).toHaveBeenCalledWith(
            expect.objectContaining({ orgId: '285361' })
        );
    });

    it('renders without error when project.adobe is undefined (orgId passed as undefined)', () => {
        const projectNoAdobe = { ...mockProject, adobe: undefined };

        renderWithProvider(
            <ConfigureScreen project={projectNoAdobe} componentsData={mockComponentsData} />
        );

        expect(useAutoStoreDetectMock).toHaveBeenCalledWith(
            expect.objectContaining({ orgId: undefined })
        );
    });

    it('renders StoreConfigFieldRow for every field in the ACTIVE service group', () => {
        renderWithProvider(
            <ConfigureScreen project={mockProject} componentsData={mockComponentsData} />
        );

        // Fields from the test fixture — see ConfigureScreen.testUtils. One section is on
        // screen at a time, so the rows arrive a group at a time rather than all at once.
        selectSection('Adobe Commerce');
        expect(screen.getByTestId('store-row-ADOBE_COMMERCE_URL')).toBeInTheDocument();
        expect(screen.getByTestId('store-row-ADOBE_COMMERCE_GRAPHQL_ENDPOINT')).toBeInTheDocument();
        expect(screen.getByTestId('store-row-ADOBE_COMMERCE_ADMIN_USERNAME')).toBeInTheDocument();
        expect(screen.queryByTestId('store-row-ADOBE_CATALOG_API_KEY')).not.toBeInTheDocument();

        selectSection('Catalog Service');
        expect(screen.getByTestId('store-row-ADOBE_CATALOG_API_KEY')).toBeInTheDocument();
        expect(screen.queryByTestId('store-row-ADOBE_COMMERCE_URL')).not.toBeInTheDocument();
    });

    it('passes the correct service group id to StoreConfigFieldRow so store-group branching works', () => {
        renderWithProvider(
            <ConfigureScreen project={mockProject} componentsData={mockComponentsData} />
        );

        // Commerce URL is in the 'adobe-commerce' group (a store group per the mock isStoreGroup)
        selectSection('Adobe Commerce');
        const commerceUrlRow = screen.getByTestId('store-row-ADOBE_COMMERCE_URL');
        expect(commerceUrlRow.getAttribute('data-group')).toBe('adobe-commerce');

        // Catalog API key is in the non-store 'catalog-service' group
        selectSection('Catalog Service');
        const catalogKeyRow = screen.getByTestId('store-row-ADOBE_CATALOG_API_KEY');
        expect(catalogKeyRow.getAttribute('data-group')).toBe('catalog-service');
    });

    it('passes fetchStores, hasStoreData, isFetching to useAutoStoreDetect so the hook can coordinate', () => {
        renderWithProvider(
            <ConfigureScreen project={mockProject} componentsData={mockComponentsData} />
        );

        expect(useAutoStoreDetectMock).toHaveBeenCalledWith(
            expect.objectContaining({
                fetchStores: expect.any(Function),
                hasStoreData: false,
                isFetching: false,
                configs: expect.any(Object),
            })
        );
    });
});
