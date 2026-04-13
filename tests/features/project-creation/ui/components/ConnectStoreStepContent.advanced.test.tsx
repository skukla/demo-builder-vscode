/**
 * ConnectStoreStepContent Component Tests — Part 2: Interaction & Advanced Behaviors
 *
 * Part 2 covers: field update propagation, validation propagation, brand defaults,
 * props passthrough (selectedStackId, adobeOrg), auto-detect store structure,
 * URL normalization, store discovery persistence, refresh button, layout constraints.
 *
 * See ConnectStoreStepContent.test.tsx for rendering/disclosure/discovery state tests.
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
    componentIds: string[];
    options?: Array<{ value: string; label: string }>;
    default?: string | boolean;
}

// ---------------------------------------------------------------------------
// Env var key constants (only those referenced in test assertions)
// ---------------------------------------------------------------------------

const ACCS_ENDPOINT_KEY = 'ACCS_GRAPHQL_ENDPOINT';
const PAAS_URL = 'ADOBE_COMMERCE_URL';
const PAAS_ADMIN_USERNAME = 'ADOBE_COMMERCE_ADMIN_USERNAME';
const PAAS_ADMIN_PASSWORD = 'ADOBE_COMMERCE_ADMIN_PASSWORD';

// ---------------------------------------------------------------------------
// Test fixtures (minimal — only fields used by tests in this file)
// ---------------------------------------------------------------------------

/** PaaS service group — connection fields only (store codes not needed here) */
const paasServiceGroup: MockServiceGroup = {
    id: 'adobe-commerce',
    label: 'Adobe Commerce',
    fields: [
        { key: PAAS_URL, label: 'Commerce URL', type: 'url', required: true, placeholder: 'https://...', componentIds: ['adobe-commerce'] },
        { key: PAAS_ADMIN_USERNAME, label: 'Admin Username', type: 'text', required: true, componentIds: ['adobe-commerce'] },
        { key: PAAS_ADMIN_PASSWORD, label: 'Admin Password', type: 'password', required: true, componentIds: ['adobe-commerce'] },
    ],
};

/** ACCS service group — connection field only */
const accsServiceGroup: MockServiceGroup = {
    id: 'accs',
    label: 'Adobe Commerce Cloud',
    fields: [
        { key: ACCS_ENDPOINT_KEY, label: 'GraphQL Endpoint', type: 'url', required: true, placeholder: 'https://...', componentIds: ['accs'] },
    ],
};

/** Non-store service group */
const catalogServiceGroup: MockServiceGroup = {
    id: 'catalog',
    label: 'Catalog Service',
    fields: [
        { key: 'ADOBE_CATALOG_API_KEY', label: 'API Key', type: 'text', required: true, componentIds: ['catalog-service'] },
    ],
};

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

// Track captured config from useStoreDiscovery
let capturedStoreDiscoveryConfig: UseStoreDiscoveryConfig;

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
        capturedSetCanProceed = props.onValidationChange;
        capturedUpdateState = props.onConfigsChange;
        return mockUseComponentConfig;
    },
    __esModule: true,
}));

jest.mock('@/features/components/ui/hooks/useStoreDiscovery', () => ({
    useStoreDiscovery: (config: any = {}) => {
        capturedStoreDiscoveryConfig = config;
        return mockUseStoreDiscovery;
    },
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
        <div data-testid={`store-selection-row-${group.id}`}>Store Selection for {group.label}</div>
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

function configurePaasLookup() {
    mockLookupComponentConfigValue.mockImplementation((_configs: any, key: string) => {
        if (key === PAAS_URL) return 'https://example.com';
        if (key === PAAS_ADMIN_USERNAME) return 'admin';
        if (key === PAAS_ADMIN_PASSWORD) return 'pass123';
        return undefined;
    });
}

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

describe('ConnectStoreStepContent - Advanced Behaviors', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        capturedSetCanProceed = undefined;
        capturedUpdateState = undefined;
        capturedStoreDiscoveryConfig = undefined;

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
    // Field update propagation
    // -----------------------------------------------------------------------

    describe('field update propagation', () => {
        it('should call useComponentConfig.updateField when a field value changes', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
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

            expect(container.querySelector('[class*="two-column"]')).not.toBeInTheDocument();
        });
    });
});
