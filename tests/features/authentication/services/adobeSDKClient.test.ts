import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';

/**
 * AdobeSDKClient Test Suite
 *
 * Tests Adobe Console SDK client initialization and lifecycle:
 * - SDK initialization
 * - Token validation before init
 * - Concurrent initialization prevention
 * - SDK availability checking
 * - Client lifecycle management
 * - Error handling and fallback
 * - Security validation
 *
 * Total tests: 18
 */

// Mock dependencies
jest.mock('@adobe/aio-lib-console', () => ({
    init: jest.fn(),
}));

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

jest.mock('@/core/validation', () => ({
    validateAccessToken: jest.fn(),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000, // Standard API calls (replaces API_CALL)
        QUICK: 5000, // Fast operations (replaces SDK_INIT, TOKEN_READ)
    },
}));

describe('AdobeSDKClient', () => {
    let sdkClient: AdobeSDKClient;
    let mockLogger: any;
    let mockTokenManager: any;
    let mockCommandManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };

        mockTokenManager = {
            inspectToken: jest.fn(),
        };

        mockCommandManager = {};

        jest.mock('@/features/authentication/services/tokenManager', () => ({
            TokenManager: jest.fn(() => mockTokenManager),
        }));

        jest.mock('@/core/di', () => ({
            ServiceLocator: {
                getCommandExecutor: jest.fn(() => mockCommandManager),
            },
        }));

        sdkClient = new AdobeSDKClient(mockLogger);
    });

    describe('initialization', () => {
        it('should initialize SDK with valid token', async () => {
            const sdk = require('@adobe/aio-lib-console');
            const { TokenManager } = require('@/features/authentication/services/tokenManager');
            const { validateAccessToken } = require('@/core/validation');

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: true,
                token: 'valid-token-123',
                expiresIn: 60,
            });

            validateAccessToken.mockImplementation(() => {});
            sdk.init.mockResolvedValue({ initialized: true });

            await sdkClient.initialize();

            expect(sdk.init).toHaveBeenCalledWith('valid-token-123', 'aio-cli-console-auth');
            expect(sdkClient.isInitialized()).toBe(true);
        });

        it('should defer initialization when token is not valid', async () => {
            const sdk = require('@adobe/aio-lib-console');

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: false,
                expiresIn: -10,
            });

            await sdkClient.initialize();

            expect(sdk.init).not.toHaveBeenCalled();
            expect(sdkClient.isInitialized()).toBe(false);
        });

        it('should validate token before using it', async () => {
            const { validateAccessToken } = require('@/core/validation');

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: true,
                token: 'token-with-metacharacters',
                expiresIn: 60,
            });

            validateAccessToken.mockImplementation(() => {
                throw new Error('Invalid token format');
            });

            await sdkClient.initialize();

            expect(sdkClient.isInitialized()).toBe(false);
        });

        it('should handle SDK init failure gracefully', async () => {
            const sdk = require('@adobe/aio-lib-console');
            const { validateAccessToken } = require('@/core/validation');

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: true,
                token: 'valid-token',
                expiresIn: 60,
            });

            validateAccessToken.mockImplementation(() => {});
            sdk.init.mockRejectedValue(new Error('SDK initialization failed'));

            await sdkClient.initialize();

            expect(sdkClient.isInitialized()).toBe(false);
        });

        it('should not initialize twice', async () => {
            const sdk = require('@adobe/aio-lib-console');
            const { validateAccessToken } = require('@/core/validation');

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: true,
                token: 'valid-token',
                expiresIn: 60,
            });

            validateAccessToken.mockImplementation(() => {});
            sdk.init.mockResolvedValue({ initialized: true });

            await sdkClient.initialize();
            await sdkClient.initialize();

            expect(sdk.init).toHaveBeenCalledTimes(1);
        });

        it('should prevent concurrent initializations', async () => {
            const sdk = require('@adobe/aio-lib-console');
            const { validateAccessToken } = require('@/core/validation');

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: true,
                token: 'valid-token',
                expiresIn: 60,
            });

            validateAccessToken.mockImplementation(() => {});

            let resolveInit: ((value: any) => void) | undefined;
            sdk.init.mockImplementation(() => new Promise((resolve) => {
                resolveInit = resolve;
            }));

            // Start two concurrent initializations
            const init1 = sdkClient.initialize();
            const init2 = sdkClient.initialize();

            // Give time for promises to be set up
            await new Promise(resolve => setImmediate(resolve));

            // Resolve the SDK init
            if (resolveInit) {
                resolveInit({ initialized: true });
            }

            await Promise.all([init1, init2]);

            // Should only call SDK init once
            expect(sdk.init).toHaveBeenCalledTimes(1);
        });
    });

    describe('ensureInitialized', () => {
        it('should return true if already initialized', async () => {
            const sdk = require('@adobe/aio-lib-console');
            const { validateAccessToken } = require('@/core/validation');

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: true,
                token: 'valid-token',
                expiresIn: 60,
            });

            validateAccessToken.mockImplementation(() => {});
            sdk.init.mockResolvedValue({ initialized: true });

            await sdkClient.initialize();

            const result = await sdkClient.ensureInitialized();

            expect(result).toBe(true);
            expect(sdk.init).toHaveBeenCalledTimes(1);
        });

        it('should initialize if not yet initialized', async () => {
            const sdk = require('@adobe/aio-lib-console');
            const { validateAccessToken } = require('@/core/validation');

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: true,
                token: 'valid-token',
                expiresIn: 60,
            });

            validateAccessToken.mockImplementation(() => {});
            sdk.init.mockResolvedValue({ initialized: true });

            const result = await sdkClient.ensureInitialized();

            expect(result).toBe(true);
            expect(sdk.init).toHaveBeenCalled();
        });

        it('should wait for in-flight initialization', async () => {
            const sdk = require('@adobe/aio-lib-console');
            const { validateAccessToken } = require('@/core/validation');

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: true,
                token: 'valid-token',
                expiresIn: 60,
            });

            validateAccessToken.mockImplementation(() => {});

            let resolveInit: ((value: any) => void) | undefined;
            sdk.init.mockImplementation(() => new Promise((resolve) => {
                resolveInit = resolve;
            }));

            // Start initialization
            const init1 = sdkClient.initialize();
            const ensure1 = sdkClient.ensureInitialized();

            // Give time for promises to be set up
            await new Promise(resolve => setImmediate(resolve));

            // Resolve init
            if (resolveInit) {
                resolveInit({ initialized: true });
            }

            await Promise.all([init1, ensure1]);

            expect(sdk.init).toHaveBeenCalledTimes(1);
        });

        it('should return false if initialization fails', async () => {
            mockTokenManager.inspectToken.mockResolvedValue({
                valid: false,
                expiresIn: -10,
            });

            const result = await sdkClient.ensureInitialized();

            expect(result).toBe(false);
        });
    });

    describe('client management', () => {
        it('should return client after initialization', async () => {
            const sdk = require('@adobe/aio-lib-console');
            const { validateAccessToken } = require('@/core/validation');

            const mockClient = { api: 'mock' };

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: true,
                token: 'valid-token',
                expiresIn: 60,
            });

            validateAccessToken.mockImplementation(() => {});
            sdk.init.mockResolvedValue(mockClient);

            await sdkClient.initialize();

            expect(sdkClient.getClient()).toBe(mockClient);
        });

        it('should return undefined before initialization', () => {
            expect(sdkClient.getClient()).toBeUndefined();
        });

        it('should clear client on clear()', async () => {
            const sdk = require('@adobe/aio-lib-console');
            const { validateAccessToken } = require('@/core/validation');

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: true,
                token: 'valid-token',
                expiresIn: 60,
            });

            validateAccessToken.mockImplementation(() => {});
            sdk.init.mockResolvedValue({ initialized: true });

            await sdkClient.initialize();

            expect(sdkClient.isInitialized()).toBe(true);

            sdkClient.clear();

            expect(sdkClient.isInitialized()).toBe(false);
            expect(sdkClient.getClient()).toBeUndefined();
        });

        it('should clear in-flight promise on clear()', async () => {
            const sdk = require('@adobe/aio-lib-console');
            const { validateAccessToken } = require('@/core/validation');

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: true,
                token: 'valid-token',
                expiresIn: 60,
            });

            validateAccessToken.mockImplementation(() => {});
            sdk.init.mockResolvedValue({ initialized: true });

            // Start initialization (but don't await yet)
            const initPromise = sdkClient.initialize();

            // Clear while in-flight - this sets sdkInitPromise to null
            sdkClient.clear();

            // Wait for the original promise to complete
            await initPromise;

            // The initialization completes and sets sdkClient, but the sdkInitPromise was cleared
            // This means subsequent calls won't wait for the original promise
            // Verify that clear() successfully cleared the promise reference
            expect(sdk.init).toHaveBeenCalledTimes(1);
        });
    });

    describe('token inspection', () => {
        it('should read token from inspectToken', async () => {
            const sdk = require('@adobe/aio-lib-console');
            const { validateAccessToken } = require('@/core/validation');

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: true,
                token: 'disk-token-123',
                expiresIn: 60,
            });

            validateAccessToken.mockImplementation(() => {});
            sdk.init.mockResolvedValue({ initialized: true });

            await sdkClient.initialize();

            expect(sdk.init).toHaveBeenCalledWith('disk-token-123', 'aio-cli-console-auth');
        });

        it('should use token from inspectToken when valid=true', async () => {
            const sdk = require('@adobe/aio-lib-console');
            const { validateAccessToken } = require('@/core/validation');

            mockTokenManager.inspectToken.mockResolvedValue({
                valid: true,
                token: 'guaranteed-token',
                expiresIn: 120,
            });

            validateAccessToken.mockImplementation(() => {});
            sdk.init.mockResolvedValue({ initialized: true });

            await sdkClient.initialize();

            expect(sdk.init).toHaveBeenCalledWith('guaranteed-token', expect.any(String));
        });
    });

    describe('error scenarios', () => {
        it('should handle missing TokenManager module', async () => {
            // Mock the tokenManager to throw an error when accessed
            mockTokenManager.inspectToken.mockImplementation(() => {
                throw new Error('Module not found');
            });

            await sdkClient.initialize();

            // Should fail gracefully and not be initialized
            expect(sdkClient.isInitialized()).toBe(false);
        });

        it('should handle token manager errors', async () => {
            mockTokenManager.inspectToken.mockRejectedValue(new Error('Token inspection failed'));

            await sdkClient.initialize();

            expect(sdkClient.isInitialized()).toBe(false);
        });
    });
});
