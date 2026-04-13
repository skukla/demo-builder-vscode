/**
 * ConnectStoreStepContent Component Tests
 *
 * Tests the modal step content component that collects commerce connection
 * settings (endpoint URLs, credentials) and triggers store discovery for
 * website/store/view selection via progressive disclosure.
 */

import React from 'react';
import { render, screen, within, act } from '@testing-library/react';
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

// Captured callbacks from useComponentConfig
let capturedSetCanProceed: ((valid: boolean) => void) | undefined;
let capturedUpdateState: ((updates: any) => void) | undefined;

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

    // -----------------------------------------------------------------------
    // Field update propagation
    // -----------------------------------------------------------------------

    describe('field update propagation', () => {
        it('should call useComponentConfig.updateField when a field value changes', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            // Use a connection field (always visible) to test updateField propagation
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            const input = screen.getByLabelText('Commerce URL');
            await user.type(input, 'h');

            expect(mockUseComponentConfig.updateField).toHaveBeenCalled();
        });

        it('should propagate componentConfigs changes via onComponentConfigsChange', () => {
            mockUseComponentConfig.serviceGroups = [catalogServiceGroup as any];
            const onConfigsChange = jest.fn();

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    onComponentConfigsChange={onConfigsChange}
                />,
            );

            // The narrow interface passes onComponentConfigsChange directly as onConfigsChange
            expect(capturedUpdateState).toBeDefined();
            act(() => {
                capturedUpdateState?.({ catalog: { key: 'val' } });
            });

            expect(onConfigsChange).toHaveBeenCalledWith({ catalog: { key: 'val' } });
        });
    });

    // -----------------------------------------------------------------------
    // Validation propagation
    // -----------------------------------------------------------------------

    describe('validation propagation', () => {
        it('should propagate validation state via onValidationChange', () => {
            const onValidationChange = jest.fn();
            mockUseComponentConfig.serviceGroups = [catalogServiceGroup as any];

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    onValidationChange={onValidationChange}
                />,
            );

            // The hook captures setCanProceed from props
            expect(capturedSetCanProceed).toBeDefined();
            act(() => {
                capturedSetCanProceed?.(true);
            });

            expect(onValidationChange).toHaveBeenCalledWith(true);
        });

        it('should propagate validation failure', () => {
            const onValidationChange = jest.fn();
            mockUseComponentConfig.serviceGroups = [];

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    onValidationChange={onValidationChange}
                />,
            );

            expect(capturedSetCanProceed).toBeDefined();
            act(() => {
                capturedSetCanProceed?.(false);
            });

            expect(onValidationChange).toHaveBeenCalledWith(false);
        });

        it('should show validation error on touched field', () => {
            // Use a connection field to test validation errors (always visible)
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];
            mockUseComponentConfig.validationErrors = {
                [PAAS_URL]: 'Commerce URL is required',
            };
            mockUseComponentConfig.touchedFields = new Set([PAAS_URL]);

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.getByTestId(`error-${PAAS_URL}`)).toHaveTextContent(
                'Commerce URL is required',
            );
        });
    });

    // -----------------------------------------------------------------------
    // Brand defaults / packageConfigDefaults
    // -----------------------------------------------------------------------

    describe('brand defaults', () => {
        it('should pass packageConfigDefaults to the hook via narrow interface', () => {
            const defaults = { ACCS_WEBSITE_CODE: 'base', ACCS_STORE_CODE: 'default' };
            mockUseComponentConfig.serviceGroups = [];

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    packageConfigDefaults={defaults}
                />,
            );

            // The hook was invoked with the narrow interface — captured callbacks confirm
            expect(capturedSetCanProceed).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Props passthrough: selectedStackId
    // -----------------------------------------------------------------------

    describe('selectedStackId passthrough', () => {
        it('should pass selectedStackId as selectedStack via narrow interface', () => {
            mockUseComponentConfig.serviceGroups = [];

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    selectedStackId="headless-paas"
                />,
            );

            // Verify hook was called (captured callbacks exist)
            expect(capturedSetCanProceed).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // adobeOrg passthrough
    // -----------------------------------------------------------------------

    describe('adobeOrg passthrough', () => {
        it('should pass adobeOrg to useComponentConfig via narrow interface', () => {
            mockUseComponentConfig.serviceGroups = [];

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    adobeOrg={{ id: 'org-123' }}
                />,
            );

            expect(capturedSetCanProceed).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Auto-detect store structure
    // -----------------------------------------------------------------------

    describe('auto-detect store structure', () => {
        it('should trigger store discovery when PaaS connection fields are all filled', () => {
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

            // The component should compute an autoDetectKey and trigger fetchStores
            expect(mockUseStoreDiscovery.fetchStores).toHaveBeenCalled();
        });

        it('should trigger store discovery for ACCS when endpoint contains /graphql', () => {
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

            expect(mockUseStoreDiscovery.fetchStores).toHaveBeenCalled();
        });

        it('should not trigger store discovery when connection fields are incomplete', () => {
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];
            mockUseComponentConfig.getFieldValue.mockReturnValue('');

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    selectedStackId="headless-paas"
                    componentConfigs={{}}
                />,
            );

            expect(mockUseStoreDiscovery.fetchStores).not.toHaveBeenCalled();
        });

        it('should not re-trigger discovery when hasStoreData is already true', () => {
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

            expect(mockUseStoreDiscovery.fetchStores).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // URL normalization
    // -----------------------------------------------------------------------

    describe('URL normalization', () => {
        it('should call normalizeUrlField on blur for URL fields', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            const urlField = screen.getByTestId(`config-field-${PAAS_URL}`);
            const input = within(urlField).getByRole('textbox');

            await user.click(input);
            await user.tab(); // blur

            expect(mockUseComponentConfig.normalizeUrlField).toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // Store discovery persistence: initialStoreData + onStoreDiscoveryDataChange
    // -----------------------------------------------------------------------

    describe('store discovery persistence', () => {
        it('should pass storeDiscoveryData to useStoreDiscovery as initialStoreData', () => {
            const storeData = { websites: [], storeGroups: [], storeViews: [] } as any;
            mockUseComponentConfig.serviceGroups = [];

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    storeDiscoveryData={storeData}
                />,
            );

            expect(capturedStoreDiscoveryConfig?.initialStoreData).toBe(storeData);
        });

        it('should pass onStoreDiscoveryDataChange to useStoreDiscovery as onStoreDataChange', () => {
            const onStoreDiscoveryDataChange = jest.fn();
            mockUseComponentConfig.serviceGroups = [];

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    onStoreDiscoveryDataChange={onStoreDiscoveryDataChange}
                />,
            );

            expect(capturedStoreDiscoveryConfig?.onStoreDataChange).toBe(onStoreDiscoveryDataChange);
        });

        it('should not re-trigger auto-detect when storeDiscoveryData is provided (hasStoreData starts true)', () => {
            const storeData = { websites: [], storeGroups: [], storeViews: [] } as any;
            mockUseStoreDiscovery.hasStoreData = true;
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];
            configurePaasLookup();

            renderWithProvider(
                <ConnectStoreStepContent
                    {...defaultProps}
                    storeDiscoveryData={storeData}
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

            expect(mockUseStoreDiscovery.fetchStores).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // Refresh button
    // -----------------------------------------------------------------------

    describe('refresh button', () => {
        it('should show refresh button when hasStoreData is true and autoDetectKey is set', () => {
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

            expect(screen.getByRole('button', { name: /re-detect/i })).toBeInTheDocument();
        });

        it('should not show refresh button when hasStoreData is false', () => {
            mockUseStoreDiscovery.hasStoreData = false;
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];
            configurePaasLookup();

            renderWithProvider(<ConnectStoreStepContent {...defaultProps} />);

            expect(screen.queryByRole('button', { name: /re-detect/i })).not.toBeInTheDocument();
        });

        it('should call fetchStores when refresh button is clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
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

            await user.click(screen.getByRole('button', { name: /re-detect/i }));

            expect(mockUseStoreDiscovery.fetchStores).toHaveBeenCalledWith(
                expect.objectContaining({ backendType: 'paas' }),
            );
        });
    });

    // -----------------------------------------------------------------------
    // Component does NOT include navigation panel
    // -----------------------------------------------------------------------

    describe('layout constraints', () => {
        it('should not render a navigation panel', () => {
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];

            const { container } = renderWithProvider(
                <ConnectStoreStepContent {...defaultProps} />,
            );

            expect(container.querySelector('.config-nav-panel')).not.toBeInTheDocument();
        });

        it('should not use TwoColumnLayout', () => {
            mockUseComponentConfig.serviceGroups = [paasServiceGroup as any];

            const { container } = renderWithProvider(
                <ConnectStoreStepContent {...defaultProps} />,
            );

            // TwoColumnLayout would wrap in a specific class
            expect(container.querySelector('[class*="two-column"]')).not.toBeInTheDocument();
        });
    });
});
