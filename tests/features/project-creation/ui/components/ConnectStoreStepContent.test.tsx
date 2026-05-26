/**
 * ConnectStoreStepContent Component Tests — Part 1: Rendering & Disclosure
 *
 * Tests the modal step content component that collects commerce connection
 * settings (endpoint URLs, credentials) and triggers store discovery for
 * website/store/view selection via progressive disclosure.
 *
 * Part 1 covers: loading, error, empty, service group rendering, connection
 * fields, progressive disclosure, store discovery states (in progress, loaded, error).
 *
 * See ConnectStoreStepContent.advanced.test.tsx for interaction/propagation tests.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import type { UseStoreDiscoveryConfig } from '@/features/components/ui/hooks/useStoreDiscovery';

// ---------------------------------------------------------------------------
// Types for mock return values
// ---------------------------------------------------------------------------

interface MockServiceGroup {
    id: string;
    label: string;
    fields: MockField[];
}

interface MockField {
    key: string;
    label: string;
    type: string;
    required?: boolean;
    placeholder?: string;
    description?: string;
    componentIds: string[];
    options?: Array<{ value: string; label: string }>;
    default?: string | boolean;
    validation?: { pattern?: string; message?: string };
}

// ---------------------------------------------------------------------------
// Env var key constants (matching real values from envVarKeys.ts)
// ---------------------------------------------------------------------------

const ACCS_ENDPOINT_KEY = 'ACCS_GRAPHQL_ENDPOINT';
const PAAS_URL = 'ADOBE_COMMERCE_URL';
const PAAS_ADMIN_USERNAME = 'ADOBE_COMMERCE_ADMIN_USERNAME';
const PAAS_ADMIN_PASSWORD = 'ADOBE_COMMERCE_ADMIN_PASSWORD';
const PAAS_WEBSITE_CODE = 'ADOBE_COMMERCE_WEBSITE_CODE';
const PAAS_STORE_CODE = 'ADOBE_COMMERCE_STORE_CODE';
const PAAS_STORE_VIEW_CODE = 'ADOBE_COMMERCE_STORE_VIEW_CODE';
const ACCS_WEBSITE_CODE = 'ACCS_WEBSITE_CODE';
const ACCS_STORE_CODE = 'ACCS_STORE_CODE';
const ACCS_STORE_VIEW_CODE = 'ACCS_STORE_VIEW_CODE';
const ACCS_CUSTOMER_GROUP = 'ACCS_CUSTOMER_GROUP';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** ACCS connection field — always visible */
const accsEndpointField: MockField = {
    key: ACCS_ENDPOINT_KEY,
    label: 'GraphQL Endpoint',
    type: 'url',
    required: true,
    placeholder: 'https://...',
    componentIds: ['accs'],
};

/** PaaS connection fields — always visible */
const paasUrlField: MockField = {
    key: PAAS_URL,
    label: 'Commerce URL',
    type: 'url',
    required: true,
    placeholder: 'https://...',
    componentIds: ['adobe-commerce'],
};

const paasUsernameField: MockField = {
    key: PAAS_ADMIN_USERNAME,
    label: 'Admin Username',
    type: 'text',
    required: true,
    componentIds: ['adobe-commerce'],
};

const paasPasswordField: MockField = {
    key: PAAS_ADMIN_PASSWORD,
    label: 'Admin Password',
    type: 'password',
    required: true,
    componentIds: ['adobe-commerce'],
};

/** Store code fields — hidden until discovery completes */
const paasWebsiteCodeField: MockField = {
    key: PAAS_WEBSITE_CODE,
    label: 'Website Code',
    type: 'select',
    required: true,
    componentIds: ['adobe-commerce'],
};

const paasStoreCodeField: MockField = {
    key: PAAS_STORE_CODE,
    label: 'Store Code',
    type: 'select',
    required: true,
    componentIds: ['adobe-commerce'],
};

const paasStoreViewCodeField: MockField = {
    key: PAAS_STORE_VIEW_CODE,
    label: 'Store View Code',
    type: 'select',
    required: true,
    componentIds: ['adobe-commerce'],
};

const accsWebsiteCodeField: MockField = {
    key: ACCS_WEBSITE_CODE,
    label: 'Website Code',
    type: 'select',
    required: true,
    componentIds: ['accs'],
};

const accsStoreCodeField: MockField = {
    key: ACCS_STORE_CODE,
    label: 'Store Code',
    type: 'select',
    required: true,
    componentIds: ['accs'],
};

const accsStoreViewCodeField: MockField = {
    key: ACCS_STORE_VIEW_CODE,
    label: 'Store View Code',
    type: 'select',
    required: true,
    componentIds: ['accs'],
};

const accsCustomerGroupField: MockField = {
    key: ACCS_CUSTOMER_GROUP,
    label: 'Customer Group',
    type: 'text',
    required: false,
    componentIds: ['accs'],
};

/** PaaS service group with connection + store fields */
const paasServiceGroup: MockServiceGroup = {
    id: 'adobe-commerce',
    label: 'Adobe Commerce',
    fields: [
        paasUrlField,
        paasUsernameField,
        paasPasswordField,
        paasWebsiteCodeField,
        paasStoreCodeField,
        paasStoreViewCodeField,
    ],
};

/** ACCS service group with connection + store + other fields */
const accsServiceGroup: MockServiceGroup = {
    id: 'accs',
    label: 'Adobe Commerce Cloud',
    fields: [
        accsEndpointField,
        accsWebsiteCodeField,
        accsStoreCodeField,
        accsStoreViewCodeField,
        accsCustomerGroupField,
    ],
};

/** Non-store service group (e.g., Catalog Service) */
const catalogServiceGroup: MockServiceGroup = {
    id: 'catalog',
    label: 'Catalog Service',
    fields: [
        {
            key: 'ADOBE_CATALOG_API_KEY',
            label: 'API Key',
            type: 'text',
            required: true,
            componentIds: ['catalog-service'],
        },
    ],
};

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

// Track captured config from useStoreDiscovery
let capturedStoreDiscoveryConfig: UseStoreDiscoveryConfig;

// Track mock return values so tests can modify them
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

// Captured callbacks from useComponentConfig
let capturedSetCanProceed: ((valid: boolean) => void) | undefined;
let capturedUpdateState: ((updates: any) => void) | undefined;

jest.mock('@/features/components/ui/hooks/useComponentConfig', () => ({
    useComponentConfig: (props: any) => {
        // Capture the narrow-interface callbacks for propagation tests
        capturedSetCanProceed = props.onValidationChange;
        capturedUpdateState = props.onConfigsChange;
        return mockUseComponentConfig;
    },
    // Re-export types
    __esModule: true,
}));

jest.mock('@/features/components/ui/hooks/useStoreDiscovery', () => ({
    useStoreDiscovery: (config: any = {}) => {
        capturedStoreDiscoveryConfig = config;
        return mockUseStoreDiscovery;
    },
}));

// Mock ConfigFieldRenderer to simplify testing (avoid Spectrum internals)
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
                data-required={field.required}
            />
            {error && isTouched && <span data-testid={`error-${field.key}`}>{error}</span>}
        </div>
    ),
}));

// Mock StoreSelectionRow
jest.mock('@/features/components/ui/components/StoreSelectionRow', () => ({
    StoreSelectionRow: ({ group }: any) => (
        <div data-testid={`store-selection-row-${group.id}`}>
            Store Selection for {group.label}
        </div>
    ),
}));

// Mock lookupComponentConfigValue — configurable per test
const mockLookupComponentConfigValue = jest.fn();
jest.mock('@/features/components/services/envVarHelpers', () => ({
    lookupComponentConfigValue: (...args: any[]) => mockLookupComponentConfigValue(...args),
}));

// Mock the LoadingDisplay and CenteredFeedbackContainer
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message }: any) => (
        <div data-testid="loading-display">{message}</div>
    ),
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

/** Configure lookupComponentConfigValue to return PaaS connection values */
function configurePaasLookup() {
    mockLookupComponentConfigValue.mockImplementation((_configs: any, key: string) => {
        if (key === PAAS_URL) return 'https://example.com';
        if (key === PAAS_ADMIN_USERNAME) return 'admin';
        if (key === PAAS_ADMIN_PASSWORD) return 'pass123';
        return undefined;
    });
}

/** Configure lookupComponentConfigValue to return ACCS connection values */
function configureAccsLookup() {
    mockLookupComponentConfigValue.mockImplementation((_configs: any, key: string) => {
        if (key === ACCS_ENDPOINT_KEY) return 'https://accs.example.com/graphql';
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

describe('ConnectStoreStepContent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        capturedSetCanProceed = undefined;
        capturedUpdateState = undefined;
        capturedStoreDiscoveryConfig = undefined;

        // Reset mock defaults
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
    // Loading state
    // -----------------------------------------------------------------------

    describe('loading state', () => {
        it('should render loading display while useComponentConfig is loading', () => {
            mockUseComponentConfig.isLoading = true;

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.getByTestId('loading-display')).toBeInTheDocument();
        });

        it('should not render service groups while loading', () => {
            mockUseComponentConfig.isLoading = true;
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.queryByText('Adobe Commerce')).not.toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // Error state
    // -----------------------------------------------------------------------

    describe('error state', () => {
        it('should render error message when loadError is set', () => {
            mockUseComponentConfig.loadError = 'Failed to load component configuration.';

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.getByText('Failed to load component configuration.')).toBeInTheDocument();
        });

        it('should not render service groups when there is an error', () => {
            mockUseComponentConfig.loadError = 'Some error';
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.queryByText('Adobe Commerce')).not.toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // Empty state
    // -----------------------------------------------------------------------

    describe('empty state', () => {
        it('should render empty message when no service groups', () => {
            mockUseComponentConfig.serviceGroups = [];

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(
                screen.getByText(/no components requiring configuration/i),
            ).toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // Service group rendering
    // -----------------------------------------------------------------------

    describe('service group rendering', () => {
        it('should render PaaS service group heading', () => {
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.getByText('Adobe Commerce')).toBeInTheDocument();
        });

        it('should render ACCS service group heading', () => {
            mockUseComponentConfig.serviceGroups = [accsServiceGroup as any];

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.getByText('Adobe Commerce Cloud')).toBeInTheDocument();
        });

        it('should render multiple service groups when store selection is complete', () => {
            mockUseComponentConfig.serviceGroups = [
                paasServiceGroup as any,
                catalogServiceGroup as any,
            ];
            // Non-connection groups only visible after store view code is filled
            mockLookupComponentConfigValue.mockImplementation((_configs: any, key: string) => {
                if (key === PAAS_STORE_VIEW_CODE) return 'default';
                return undefined;
            });

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.getByText('Adobe Commerce')).toBeInTheDocument();
            expect(screen.getByText('Catalog Service')).toBeInTheDocument();
        });

        it('should hide non-connection groups until store selection is complete', () => {
            mockUseComponentConfig.serviceGroups = [
                paasServiceGroup as any,
                catalogServiceGroup as any,
            ];
            mockUseComponentConfig.componentConfigs = {};

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.getByText('Adobe Commerce')).toBeInTheDocument();
            expect(screen.queryByText('Catalog Service')).not.toBeInTheDocument();
        });

        it('should render divider between service groups when store selection is complete', () => {
            mockUseComponentConfig.serviceGroups = [
                paasServiceGroup as any,
                catalogServiceGroup as any,
            ];
            mockLookupComponentConfigValue.mockImplementation((_configs: any, key: string) => {
                if (key === PAAS_STORE_VIEW_CODE) return 'default';
                return undefined;
            });

            renderWithProvider(
                <ConnectStoreStepContent {...defaultProps} />,
            );

            // Spectrum Divider renders with separator role
            const dividers = screen.getAllByRole('separator');
            expect(dividers.length).toBeGreaterThanOrEqual(1);
        });
    });

    // -----------------------------------------------------------------------
    // Connection fields (always visible)
    // -----------------------------------------------------------------------

    describe('connection fields', () => {
        it('should render PaaS connection fields (URL, username, password)', () => {
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.getByTestId(`config-field-${PAAS_URL}`)).toBeInTheDocument();
            expect(screen.getByTestId(`config-field-${PAAS_ADMIN_USERNAME}`)).toBeInTheDocument();
            expect(screen.getByTestId(`config-field-${PAAS_ADMIN_PASSWORD}`)).toBeInTheDocument();
        });

        it('should render ACCS connection field (endpoint)', () => {
            mockUseComponentConfig.serviceGroups = [accsServiceGroup as any];

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.getByTestId(`config-field-${ACCS_ENDPOINT_KEY}`)).toBeInTheDocument();
        });

        it('should render non-store group fields when store selection is complete', () => {
            mockUseComponentConfig.serviceGroups = [catalogServiceGroup as any];
            mockLookupComponentConfigValue.mockImplementation((_configs: any, key: string) => {
                if (key === PAAS_STORE_VIEW_CODE) return 'default';
                return undefined;
            });

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.getByTestId('config-field-ADOBE_CATALOG_API_KEY')).toBeInTheDocument();
        });

        it('should hide non-connection group fields before store selection', () => {
            mockUseComponentConfig.serviceGroups = [catalogServiceGroup as any];
            mockUseComponentConfig.componentConfigs = {};

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.queryByTestId('config-field-ADOBE_CATALOG_API_KEY')).not.toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // Progressive disclosure: store fields hidden initially
    // -----------------------------------------------------------------------

    describe('progressive disclosure', () => {
        it('should hide store fields when auto-detect key is not set', () => {
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            // Connection fields visible
            expect(screen.getByTestId(`config-field-${PAAS_URL}`)).toBeInTheDocument();

            // Store fields hidden (no autoDetectKey)
            expect(screen.queryByTestId(`config-field-${PAAS_WEBSITE_CODE}`)).not.toBeInTheDocument();
            expect(screen.queryByTestId(`config-field-${PAAS_STORE_CODE}`)).not.toBeInTheDocument();
            expect(screen.queryByTestId(`config-field-${PAAS_STORE_VIEW_CODE}`)).not.toBeInTheDocument();
        });

        it('should hide ACCS store fields when auto-detect key is not set', () => {
            mockUseComponentConfig.serviceGroups = [accsServiceGroup as any];

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            // Connection field visible
            expect(screen.getByTestId(`config-field-${ACCS_ENDPOINT_KEY}`)).toBeInTheDocument();

            // Store fields hidden
            expect(screen.queryByTestId(`config-field-${ACCS_WEBSITE_CODE}`)).not.toBeInTheDocument();
            expect(screen.queryByTestId(`config-field-${ACCS_STORE_CODE}`)).not.toBeInTheDocument();
            expect(screen.queryByTestId(`config-field-${ACCS_STORE_VIEW_CODE}`)).not.toBeInTheDocument();
        });

        it('should hide dependent non-store fields in store groups when no autoDetectKey', () => {
            mockUseComponentConfig.serviceGroups = [accsServiceGroup as any];

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            // Customer Group is in a store group but not a connection field or store field
            // Without autoDetectKey, dependent fields in store groups should be hidden
            expect(screen.queryByTestId(`config-field-${ACCS_CUSTOMER_GROUP}`)).not.toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // Progressive disclosure: store discovery in progress
    // -----------------------------------------------------------------------

    describe('store discovery in progress', () => {
        it('should show detecting spinner when isFetching is true and autoDetectKey is set', () => {
            mockUseStoreDiscovery.isFetching = true;
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];
            configurePaasLookup();

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    selectedStackId="headless-paas"
                    componentConfigs={{
                        'adobe-commerce': {
                            [PAAS_URL]: 'https://example.com',
                            [PAAS_ADMIN_USERNAME]: 'admin',
                            [PAAS_ADMIN_PASSWORD]: 'pass123',
                        },
                    }}
                />,
            );

            expect(screen.getByText(/detecting store structure/i)).toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // Progressive disclosure: store data loaded
    // -----------------------------------------------------------------------

    describe('store data loaded', () => {
        it('should show StoreSelectionRow when hasStoreData is true', () => {
            mockUseStoreDiscovery.hasStoreData = true;
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];
            configurePaasLookup();

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    selectedStackId="headless-paas"
                    componentConfigs={{
                        'adobe-commerce': {
                            [PAAS_URL]: 'https://example.com',
                            [PAAS_ADMIN_USERNAME]: 'admin',
                            [PAAS_ADMIN_PASSWORD]: 'pass123',
                        },
                    }}
                />,
            );

            expect(screen.getByTestId('store-selection-row-adobe-commerce')).toBeInTheDocument();
        });

        it('should show dependent fields (Customer Group) after autoDetectKey is set', () => {
            mockUseStoreDiscovery.hasStoreData = true;
            mockUseComponentConfig.serviceGroups = [accsServiceGroup as any];
            configureAccsLookup();

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    componentConfigs={{
                        accs: {
                            [ACCS_ENDPOINT_KEY]: 'https://accs.example.com/graphql',
                        },
                    }}
                />,
            );

            expect(screen.getByTestId(`config-field-${ACCS_CUSTOMER_GROUP}`)).toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // Store discovery error
    // -----------------------------------------------------------------------

    describe('store discovery error', () => {
        it('should show fetch error message and fallback fields on discovery failure', () => {
            mockUseStoreDiscovery.fetchError = 'Connection refused';
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];
            configurePaasLookup();

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    selectedStackId="headless-paas"
                    componentConfigs={{
                        'adobe-commerce': {
                            [PAAS_URL]: 'https://example.com',
                            [PAAS_ADMIN_USERNAME]: 'admin',
                            [PAAS_ADMIN_PASSWORD]: 'pass123',
                        },
                    }}
                />,
            );

            expect(screen.getByText('Connection refused')).toBeInTheDocument();
            // Fallback: manual website code field shown
            expect(screen.getByTestId(`config-field-${PAAS_WEBSITE_CODE}`)).toBeInTheDocument();
        });

        it('should show fallback store/view text inputs on discovery error', () => {
            mockUseStoreDiscovery.fetchError = 'Timeout';
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];
            configurePaasLookup();

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    selectedStackId="headless-paas"
                    componentConfigs={{
                        'adobe-commerce': {
                            [PAAS_URL]: 'https://example.com',
                            [PAAS_ADMIN_USERNAME]: 'admin',
                            [PAAS_ADMIN_PASSWORD]: 'pass123',
                        },
                    }}
                />,
            );

            // On error, store code fields should be shown as fallback text inputs
            expect(screen.getByTestId(`config-field-${PAAS_STORE_CODE}`)).toBeInTheDocument();
            expect(screen.getByTestId(`config-field-${PAAS_STORE_VIEW_CODE}`)).toBeInTheDocument();
        });
    });
});
