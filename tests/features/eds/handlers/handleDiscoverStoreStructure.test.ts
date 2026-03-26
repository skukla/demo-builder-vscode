/**
 * handleDiscoverStoreStructure Handler Tests
 *
 * Tests for the store discovery handler's orchestration logic:
 * parameter validation, auth manager interaction, and message sending.
 */

import type { ExtensionContext } from 'vscode';
import type { HandlerContext } from '@/types/handlers';

// Mock the discovery service
jest.mock('@/features/eds/services/commerceStoreDiscovery', () => ({
    discoverStoreStructure: jest.fn(),
    extractTenantId: jest.fn(),
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
import { discoverStoreStructure, extractTenantId } from '@/features/eds/services/commerceStoreDiscovery';

const mockDiscoverStoreStructure = discoverStoreStructure as jest.MockedFunction<typeof discoverStoreStructure>;
const mockExtractTenantId = extractTenantId as jest.MockedFunction<typeof extractTenantId>;

// ==========================================================
// Test Helpers
// ==========================================================

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
            getWorkspaceCredential: jest.fn().mockResolvedValue({
                clientId: 'mock-client-id',
                flowType: 'oauth_server_to_server',
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
        mockExtractTenantId.mockReturnValue('TestTenant123');
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
    // ACCS path
    // ----------------------------------------------------------

    it('should send error when authManager is not available for ACCS', async () => {
        const context = createMockContext({ authManager: undefined });

        await handleDiscoverStoreStructure(context, {
            backendType: 'accs',
            baseUrl: 'https://accs.test',
            orgId: 'org@AdobeOrg',
            accsGraphqlEndpoint: 'https://accs.test/Tenant123/graphql',
        });

        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: false,
            error: expect.stringContaining('authentication not available'),
        }));
    });

    it('should send error when IMS token is expired for ACCS', async () => {
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
            orgId: 'org@AdobeOrg',
            accsGraphqlEndpoint: 'https://accs.test/Tenant123/graphql',
        });

        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: false,
            error: expect.stringContaining('IMS token expired'),
        }));
    });

    it('should send error when accsGraphqlEndpoint is missing for ACCS', async () => {
        const context = createMockContext();

        await handleDiscoverStoreStructure(context, {
            backendType: 'accs',
            baseUrl: 'https://accs.test',
            orgId: 'org@AdobeOrg',
            // accsGraphqlEndpoint missing
        });

        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: false,
            error: expect.stringContaining('ACCS GraphQL endpoint'),
        }));
    });

    it('should delegate to discoverStoreStructure for ACCS path with IMS token', async () => {
        const context = createMockContext();
        mockDiscoverStoreStructure.mockResolvedValue({ success: true, data: MOCK_STORE_DATA });

        await handleDiscoverStoreStructure(context, {
            backendType: 'accs',
            baseUrl: 'https://accs.test',
            orgId: 'org@AdobeOrg',
            accsGraphqlEndpoint: 'https://accs.test/TestTenant123/graphql',
        });

        expect(mockExtractTenantId).toHaveBeenCalledWith('https://accs.test/TestTenant123/graphql');
        expect(mockDiscoverStoreStructure).toHaveBeenCalledWith(expect.objectContaining({
            backendType: 'accs',
            baseUrl: 'https://accs.test',
            imsToken: 'mock-ims-token',
            tenantId: 'TestTenant123',
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

    it('should send error when workspace credential is unavailable for ACCS', async () => {
        const context = createMockContext({
            authManager: {
                getTokenManager: jest.fn().mockReturnValue({
                    getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
                }),
                getWorkspaceCredential: jest.fn().mockResolvedValue(undefined),
            } as unknown as HandlerContext['authManager'],
        });

        await handleDiscoverStoreStructure(context, {
            backendType: 'accs',
            baseUrl: 'https://accs.test',
            orgId: 'org@AdobeOrg',
            accsGraphqlEndpoint: 'https://accs.test/TestTenant123/graphql',
        });

        expect(context.sendMessage).toHaveBeenCalledWith('store-discovery-result', expect.objectContaining({
            success: false,
            error: expect.stringContaining('No OAuth credential'),
        }));
    });

    it('should pass workspace clientId for ACCS path', async () => {
        const context = createMockContext();
        mockDiscoverStoreStructure.mockResolvedValue({ success: true, data: MOCK_STORE_DATA });

        await handleDiscoverStoreStructure(context, {
            backendType: 'accs',
            baseUrl: 'https://accs.test',
            orgId: 'org@AdobeOrg',
            accsGraphqlEndpoint: 'https://accs.test/TestTenant123/graphql',
        });

        expect(mockDiscoverStoreStructure).toHaveBeenCalledWith(expect.objectContaining({
            clientId: 'mock-client-id',
        }));
    });
});
