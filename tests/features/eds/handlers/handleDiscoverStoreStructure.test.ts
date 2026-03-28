/**
 * handleDiscoverStoreStructure Handler Tests
 *
 * Tests for the store discovery handler's orchestration logic:
 * parameter validation, discovery service lookup, auth guard, and message sending.
 */

import type { ExtensionContext } from 'vscode';
import * as vscode from 'vscode';
import type { HandlerContext } from '@/types/handlers';

// Mock the discovery service
jest.mock('@/features/eds/services/commerceStoreDiscovery', () => ({
    discoverStoreStructure: jest.fn(),
}));

// Mock ensureAdobeIOAuth
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn(),
}));

// Mock timeoutConfig (must include UI subkeys for transitive imports)
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        PREREQUISITE_CHECK: 10000,
        QUICK: 5000,
        CONFIG_WRITE: 10000,
        WEBVIEW_INIT_DELAY: 500,
        UI: { MIN_LOADING: 800 },
    },
}));

// Mock validateURL
jest.mock('@/core/validation', () => ({
    validateURL: jest.fn(),
}));

import { handleDiscoverStoreStructure } from '@/features/eds/handlers/edsHandlers';
import { discoverStoreStructure } from '@/features/eds/services/commerceStoreDiscovery';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';

const mockDiscoverStoreStructure = discoverStoreStructure as jest.MockedFunction<typeof discoverStoreStructure>;
const mockEnsureAdobeIOAuth = ensureAdobeIOAuth as jest.MockedFunction<typeof ensureAdobeIOAuth>;
const mockGetConfiguration = vscode.workspace.getConfiguration as jest.MockedFunction<typeof vscode.workspace.getConfiguration>;

// ==========================================================
// Test Helpers
// ==========================================================

const MOCK_DISCOVERY_SERVICE = {
    orgName: 'Test Org',
    serviceUrl: 'https://actions.adobeioruntime.net/api/v1/web/discovery',
};

function mockDiscoveryServices(services: { orgName: string; serviceUrl: string }[] = [MOCK_DISCOVERY_SERVICE]): void {
    mockGetConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue(services),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
}

function mockNoDiscoveryServices(): void {
    mockGetConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue([]),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
}

function createMockContext(overrides?: Partial<HandlerContext>): HandlerContext {
    const mockExtensionContext = {
        secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
        globalState: { get: jest.fn(), update: jest.fn(), keys: jest.fn().mockReturnValue([]) },
        subscriptions: [],
    } as unknown as ExtensionContext;

    return {
        context: mockExtensionContext,
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        },
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: {},
        authManager: {
            getTokenManager: jest.fn().mockReturnValue({
                getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
            }),
        },
        ...overrides,
    } as unknown as HandlerContext;
}

const MOCK_STORE_DATA = {
    websites: [{ id: 1, code: 'base', name: 'Main Website' }],
    storeGroups: [{ id: 1, code: 'main', name: 'Main Store', website_id: 1, root_category_id: 2 }],
    storeViews: [{ id: 1, code: 'default', name: 'Default', store_group_id: 1, website_id: 1, is_active: true }],
};

// ==========================================================
// Tests
// ==========================================================

describe('handleDiscoverStoreStructure', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: discovery services configured, auth succeeds
        mockDiscoveryServices();
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    });

    // ----------------------------------------------------------
    // Parameter validation
    // ----------------------------------------------------------

    it('should send error when payload is missing', async () => {
        const context = createMockContext();

        const result = await handleDiscoverStoreStructure(context, undefined);

        expect(result.success).toBe(false);
        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: false,
            error: expect.stringContaining('Missing required parameters'),
        }));
    });

    it('should send error when baseUrl is missing', async () => {
        const context = createMockContext();

        const result = await handleDiscoverStoreStructure(context, {
            backendType: 'paas',
            baseUrl: '',
        });

        expect(result.success).toBe(false);
        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: false,
        }));
    });

    // ----------------------------------------------------------
    // PaaS path
    // ----------------------------------------------------------

    it('should delegate to discoverStoreStructure for PaaS path', async () => {
        const context = createMockContext();
        mockDiscoverStoreStructure.mockResolvedValue({ success: true, data: MOCK_STORE_DATA });

        await handleDiscoverStoreStructure(context, {
            backendType: 'paas',
            baseUrl: 'https://magento.test',
            username: 'admin',
            password: 'admin123',
        });

        expect(mockDiscoverStoreStructure).toHaveBeenCalledWith(expect.objectContaining({
            backendType: 'paas',
            baseUrl: 'https://magento.test',
            username: 'admin',
            password: 'admin123',
        }));
        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: true,
            data: MOCK_STORE_DATA,
        }));
    });

    // ----------------------------------------------------------
    // ACCS path — discovery service
    // ----------------------------------------------------------

    it('should send error when no discovery services are configured for ACCS', async () => {
        mockNoDiscoveryServices();
        const context = createMockContext();

        await handleDiscoverStoreStructure(context, {
            backendType: 'accs',
            baseUrl: 'https://accs.test',
        });

        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: false,
            error: expect.stringContaining('No discovery service configured'),
        }));
    });

    it('should send error when authManager is not available for ACCS', async () => {
        const context = createMockContext({ authManager: undefined });

        await handleDiscoverStoreStructure(context, {
            backendType: 'accs',
            baseUrl: 'https://accs.test',
        });

        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: false,
            error: expect.stringContaining('Authentication not available'),
        }));
    });

    it('should send error when Adobe sign-in is cancelled for ACCS', async () => {
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: true });
        const context = createMockContext();

        await handleDiscoverStoreStructure(context, {
            backendType: 'accs',
            baseUrl: 'https://accs.test',
        });

        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: false,
            error: expect.stringContaining('cancelled'),
        }));
    });

    it('should send error when Adobe sign-in fails for ACCS', async () => {
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });
        const context = createMockContext();

        await handleDiscoverStoreStructure(context, {
            backendType: 'accs',
            baseUrl: 'https://accs.test',
        });

        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: false,
            error: expect.stringContaining('sign-in failed'),
        }));
    });

    it('should send error when IMS token is unavailable after sign-in for ACCS', async () => {
        const context = createMockContext({
            authManager: {
                getTokenManager: jest.fn().mockReturnValue({
                    getAccessToken: jest.fn().mockResolvedValue(null),
                }),
            } as unknown as HandlerContext['authManager'],
        });

        await handleDiscoverStoreStructure(context, {
            backendType: 'accs',
            baseUrl: 'https://accs.test',
        });

        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: false,
            error: expect.stringContaining('IMS token'),
        }));
    });

    it('should delegate to discoverStoreStructure for ACCS path with discovery service', async () => {
        const context = createMockContext();
        mockDiscoverStoreStructure.mockResolvedValue({ success: true, data: MOCK_STORE_DATA });

        await handleDiscoverStoreStructure(context, {
            backendType: 'accs',
            baseUrl: 'https://accs.test',
            accsGraphqlEndpoint: 'https://accs.test/TestTenant123/graphql',
        });

        expect(mockDiscoverStoreStructure).toHaveBeenCalledWith(expect.objectContaining({
            backendType: 'accs',
            baseUrl: 'https://accs.test',
            imsToken: 'mock-ims-token',
            discoveryServiceUrl: MOCK_DISCOVERY_SERVICE.serviceUrl,
            accsGraphqlEndpoint: 'https://accs.test/TestTenant123/graphql',
        }));
        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: true,
            data: MOCK_STORE_DATA,
        }));
    });

    // ----------------------------------------------------------
    // Error handling
    // ----------------------------------------------------------

    it('should send discovery error result on service failure', async () => {
        const context = createMockContext();
        mockDiscoverStoreStructure.mockResolvedValue({
            success: false,
            error: 'Connection timed out',
        });

        await handleDiscoverStoreStructure(context, {
            backendType: 'paas',
            baseUrl: 'https://magento.test',
            username: 'admin',
            password: 'pass',
        });

        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: false,
            error: 'Connection timed out',
        }));
    });

    it('should handle unexpected exceptions gracefully', async () => {
        const context = createMockContext();
        mockDiscoverStoreStructure.mockRejectedValue(new Error('Unexpected crash'));

        const result = await handleDiscoverStoreStructure(context, {
            backendType: 'paas',
            baseUrl: 'https://magento.test',
            username: 'admin',
            password: 'pass',
        });

        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: false,
            error: 'Unexpected crash',
        }));
        // Handler itself succeeds (discovery failed, not handler)
        expect(result.success).toBe(true);
    });

    // ----------------------------------------------------------
    // Logging
    // ----------------------------------------------------------

    it('should log success details', async () => {
        const context = createMockContext();
        mockDiscoverStoreStructure.mockResolvedValue({ success: true, data: MOCK_STORE_DATA });

        await handleDiscoverStoreStructure(context, {
            backendType: 'paas',
            baseUrl: 'https://magento.test',
            username: 'admin',
            password: 'pass',
        });

        expect(context.logger.info).toHaveBeenCalledWith(
            expect.stringContaining('1 websites'),
        );
    });
});
