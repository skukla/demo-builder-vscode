/**
 * ConnectStoreStepContent Component Tests — Part 3: Section Filtering
 *
 * Tests the optional `section` prop that lets the Commerce tabs render one of
 * three slices (Connection / Business Structure / Catalog) over a single shared
 * hook instance. When `section` is absent, rendering is unchanged.
 *
 * Section semantics (within the connection groups accs/adobe-commerce):
 *  - connection         → CONNECTION_FIELDS only (endpoints/credentials),
 *                         excluding the store-code cascade.
 *  - business-structure → the store-code cascade (website→store→view) only.
 *  - catalog            → the non-connection groups (catalog-service, assets,
 *                         commerce-optimizer), gated on store-view selection.
 *
 * See ConnectStoreStepContent.test.tsx (Part 1) and *.advanced.test.tsx (Part 2).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import {
    type MockServiceGroup,
    ACCS_ENDPOINT_KEY,
    PAAS_URL,
    PAAS_ADMIN_USERNAME,
    PAAS_ADMIN_PASSWORD,
    PAAS_STORE_CODE,
    PAAS_STORE_VIEW_CODE,
    paasServiceGroup,
    catalogServiceGroup,
} from './ConnectStoreStepContent.testUtils';

// ---------------------------------------------------------------------------
// Mock setup (mirrors ConnectStoreStepContent.test.tsx)
// ---------------------------------------------------------------------------

const mockUseComponentConfig = {
    isLoading: false,
    loadError: null as string | null,
    serviceGroups: [] as MockServiceGroup[],
    validationErrors: {} as Record<string, string>,
    touchedFields: new Set<string>(),
    componentConfigs: {} as Record<string, Record<string, string | boolean>>,
    updateField: jest.fn(),
    getFieldValue: jest.fn().mockReturnValue(''),
    normalizeUrlField: jest.fn(),
};

const mockUseStoreDiscovery = {
    isFetching: false,
    fetchError: null as string | null,
    hasStoreData: false,
    fetchStores: jest.fn(),
    getWebsiteItems: jest.fn().mockReturnValue([]),
    getStoreGroupItems: jest.fn().mockReturnValue([]),
    getStoreViewItems: jest.fn().mockReturnValue([]),
    isStoreGroup: jest.fn((groupId: string) => groupId === 'accs' || groupId === 'adobe-commerce'),
};

jest.mock('@/features/components/ui/hooks/useComponentConfig', () => ({
    useComponentConfig: () => mockUseComponentConfig,
    __esModule: true,
}));

jest.mock('@/features/components/ui/hooks/useStoreDiscovery', () => ({
    useStoreDiscovery: () => mockUseStoreDiscovery,
}));

jest.mock('@/features/components/ui/components/ConfigFieldRenderer', () => ({
    ConfigFieldRenderer: ({ field, value, error, isTouched, onUpdate, onNormalizeUrl }: any) => (
        <div data-testid={`config-field-${field.key}`}>
            <label>{field.label}</label>
            <input
                aria-label={field.label}
                value={value || ''}
                onChange={(e) => onUpdate(field, e.target.value)}
                onBlur={() => onNormalizeUrl?.(field)}
                data-field-key={field.key}
            />
            {error && isTouched && <span data-testid={`error-${field.key}`}>{error}</span>}
        </div>
    ),
}));

jest.mock('@/features/components/ui/components/StoreSelectionRow', () => ({
    StoreSelectionRow: ({ group }: any) => (
        <div data-testid={`store-selection-row-${group.id}`}>
            Store Selection for {group.label}
        </div>
    ),
}));

const mockLookupComponentConfigValue = jest.fn();
jest.mock('@/features/components/services/envVarHelpers', () => ({
    lookupComponentConfigValue: (...args: any[]) => mockLookupComponentConfigValue(...args),
}));

jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message }: any) => <div data-testid="loading-display">{message}</div>,
}));

jest.mock('@/core/ui/components/layout/CenteredFeedbackContainer', () => ({
    CenteredFeedbackContainer: ({ children }: any) => (
        <div data-testid="centered-feedback">{children}</div>
    ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderWithProvider = (ui: React.ReactElement) =>
    render(<Provider theme={defaultTheme}>{ui}</Provider>);

const defaultProps = {
    selectedStackId: 'eds-accs',
    componentConfigs: {},
    onComponentConfigsChange: jest.fn(),
    onValidationChange: jest.fn(),
};

/** Configure lookup so PaaS connection fields read as filled (enables autoDetectKey). */
function configurePaasConnectionFilled() {
    mockLookupComponentConfigValue.mockImplementation((_configs: any, key: string) => {
        if (key === PAAS_URL) return 'https://example.com';
        if (key === PAAS_ADMIN_USERNAME) return 'admin';
        if (key === PAAS_ADMIN_PASSWORD) return 'pass123';
        return undefined;
    });
}

/** Configure lookup so the store view code reads as filled (storeSelectionComplete). */
function configureStoreViewFilled() {
    mockLookupComponentConfigValue.mockImplementation((_configs: any, key: string) => {
        if (key === PAAS_URL) return 'https://example.com';
        if (key === PAAS_ADMIN_USERNAME) return 'admin';
        if (key === PAAS_ADMIN_PASSWORD) return 'pass123';
        if (key === PAAS_STORE_VIEW_CODE) return 'default';
        return undefined;
    });
}

// Lazy import so mocks are registered first
let ConnectStoreStepContent: any;

beforeAll(async () => {
    const mod = await import(
        '@/features/project-creation/ui/components/ConnectStoreStepContent'
    );
    ConnectStoreStepContent = mod.ConnectStoreStepContent;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConnectStoreStepContent - section filtering', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        mockUseComponentConfig.isLoading = false;
        mockUseComponentConfig.loadError = null;
        mockUseComponentConfig.serviceGroups = [];
        mockUseComponentConfig.validationErrors = {};
        mockUseComponentConfig.touchedFields = new Set();
        mockUseComponentConfig.componentConfigs = {};
        mockUseComponentConfig.updateField.mockClear();
        mockUseComponentConfig.getFieldValue.mockReturnValue('');
        mockUseComponentConfig.normalizeUrlField.mockClear();

        mockUseStoreDiscovery.isFetching = false;
        mockUseStoreDiscovery.fetchError = null;
        mockUseStoreDiscovery.hasStoreData = false;
        mockUseStoreDiscovery.fetchStores.mockClear();
        mockUseStoreDiscovery.getWebsiteItems.mockReturnValue([]);
        mockUseStoreDiscovery.getStoreGroupItems.mockReturnValue([]);
        mockUseStoreDiscovery.getStoreViewItems.mockReturnValue([]);
        mockUseStoreDiscovery.isStoreGroup.mockImplementation(
            (id: string) => id === 'accs' || id === 'adobe-commerce',
        );

        mockLookupComponentConfigValue.mockReturnValue(undefined);
    });

    // -----------------------------------------------------------------------
    // section="connection"
    // -----------------------------------------------------------------------

    describe('section="connection"', () => {
        it('should render endpoint/credential fields', () => {
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];

            renderWithProvider(
                <ConnectStoreStepContent {...defaultProps} section="connection" />,
            );

            expect(screen.getByTestId(`config-field-${PAAS_URL}`)).toBeInTheDocument();
            expect(screen.getByTestId(`config-field-${PAAS_ADMIN_USERNAME}`)).toBeInTheDocument();
            expect(screen.getByTestId(`config-field-${PAAS_ADMIN_PASSWORD}`)).toBeInTheDocument();
        });

        it('should not render the store-view cascade', () => {
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];
            // Even with connection filled (cascade would otherwise be reachable)
            configurePaasConnectionFilled();

            renderWithProvider(
                <ConnectStoreStepContent {...defaultProps} section="connection" />,
            );

            expect(screen.queryByTestId('store-selection-row-adobe-commerce')).not.toBeInTheDocument();
            expect(screen.queryByTestId(`config-field-${PAAS_STORE_CODE}`)).not.toBeInTheDocument();
            expect(screen.queryByTestId(`config-field-${PAAS_STORE_VIEW_CODE}`)).not.toBeInTheDocument();
        });

        it('should not render the catalog/assets groups', () => {
            mockUseComponentConfig.serviceGroups = [
                paasServiceGroup as any,
                catalogServiceGroup as any,
            ];
            // Even when store selection is complete (catalog would otherwise show)
            configureStoreViewFilled();

            renderWithProvider(
                <ConnectStoreStepContent {...defaultProps} section="connection" />,
            );

            expect(screen.queryByText('Catalog Service')).not.toBeInTheDocument();
            expect(screen.queryByTestId('config-field-ADOBE_CATALOG_API_KEY')).not.toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // section="business-structure"
    // -----------------------------------------------------------------------

    describe('section="business-structure"', () => {
        it('should render the store-view cascade', () => {
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];
            configurePaasConnectionFilled();

            renderWithProvider(
                <ConnectStoreStepContent {...defaultProps} section="business-structure" />,
            );

            expect(screen.getByTestId('store-selection-row-adobe-commerce')).toBeInTheDocument();
        });

        it('should not render the raw connection endpoint fields', () => {
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];
            configurePaasConnectionFilled();

            renderWithProvider(
                <ConnectStoreStepContent {...defaultProps} section="business-structure" />,
            );

            expect(screen.queryByTestId(`config-field-${PAAS_URL}`)).not.toBeInTheDocument();
            expect(screen.queryByTestId(`config-field-${PAAS_ADMIN_USERNAME}`)).not.toBeInTheDocument();
            expect(screen.queryByTestId(`config-field-${PAAS_ADMIN_PASSWORD}`)).not.toBeInTheDocument();
        });

        it('should not render the catalog groups', () => {
            mockUseComponentConfig.serviceGroups = [
                paasServiceGroup as any,
                catalogServiceGroup as any,
            ];
            configureStoreViewFilled();

            renderWithProvider(
                <ConnectStoreStepContent {...defaultProps} section="business-structure" />,
            );

            expect(screen.queryByText('Catalog Service')).not.toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // section="catalog"
    // -----------------------------------------------------------------------

    describe('section="catalog"', () => {
        it('should render the catalog/assets groups when store-view is chosen', () => {
            mockUseComponentConfig.serviceGroups = [
                paasServiceGroup as any,
                catalogServiceGroup as any,
            ];
            configureStoreViewFilled();

            renderWithProvider(
                <ConnectStoreStepContent {...defaultProps} section="catalog" />,
            );

            expect(screen.getByText('Catalog Service')).toBeInTheDocument();
            expect(screen.getByTestId('config-field-ADOBE_CATALOG_API_KEY')).toBeInTheDocument();
        });

        it('should show a gate hint when store-view is not chosen', () => {
            mockUseComponentConfig.serviceGroups = [
                paasServiceGroup as any,
                catalogServiceGroup as any,
            ];
            // store view NOT filled → gated
            mockLookupComponentConfigValue.mockReturnValue(undefined);

            renderWithProvider(
                <ConnectStoreStepContent {...defaultProps} section="catalog" />,
            );

            expect(screen.queryByText('Catalog Service')).not.toBeInTheDocument();
            expect(screen.getByText(/store view/i)).toBeInTheDocument();
        });

        it('should not render the connection fields', () => {
            mockUseComponentConfig.serviceGroups = [
                paasServiceGroup as any,
                catalogServiceGroup as any,
            ];
            configureStoreViewFilled();

            renderWithProvider(
                <ConnectStoreStepContent {...defaultProps} section="catalog" />,
            );

            expect(screen.queryByTestId(`config-field-${PAAS_URL}`)).not.toBeInTheDocument();
            expect(screen.queryByTestId(`config-field-${ACCS_ENDPOINT_KEY}`)).not.toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // section absent → unchanged (regression guard)
    // -----------------------------------------------------------------------

    describe('no section prop (unchanged behavior)', () => {
        it('should render all connection fields when section is absent', () => {
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.getByTestId(`config-field-${PAAS_URL}`)).toBeInTheDocument();
            expect(screen.getByTestId(`config-field-${PAAS_ADMIN_USERNAME}`)).toBeInTheDocument();
        });

        it('should render connection + cascade + catalog together when section is absent', () => {
            mockUseComponentConfig.serviceGroups = [
                paasServiceGroup as any,
                catalogServiceGroup as any,
            ];
            configureStoreViewFilled();

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            // Connection field
            expect(screen.getByTestId(`config-field-${PAAS_URL}`)).toBeInTheDocument();
            // Cascade
            expect(screen.getByTestId('store-selection-row-adobe-commerce')).toBeInTheDocument();
            // Catalog group
            expect(screen.getByText('Catalog Service')).toBeInTheDocument();
        });
    });
});
