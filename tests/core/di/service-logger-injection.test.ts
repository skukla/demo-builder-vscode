/**
 * Service Logger Injection Tests
 *
 * These tests verify that services support constructor injection for Logger,
 * enabling better test isolation without module-level mocking.
 *
 * Target pattern: `constructor(existingDeps, logger?: Logger)`
 * - Logger is optional for backward compatibility
 * - When provided, the injected logger is used
 * - When not provided, getLogger() fallback is used internally
 *
 * Services tested:
 * - AuthCacheManager
 * - PrerequisitesCacheManager
 * - TokenManager
 * - DaLiveOrgOperations (extracted from DaLiveService)
 * - GitHubTokenService (extracted from GitHubService)
 * - ToolManager
 * - EdsProjectService
 * - HelixService
 * - CleanupService
 */

import type { Logger } from '@/types/logger';

/**
 * Create a mock Logger for testing
 */
function createMockLogger(): Logger {
    return {
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        setContext: jest.fn(),
        with: jest.fn(),
    } as unknown as Logger;
}

// Track calls to getLogger to verify DI is working
const mockModuleLogger = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    setContext: jest.fn(),
    with: jest.fn(),
};

// Mock all getLogger calls to verify they're not being used when logger is injected
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => mockModuleLogger),
    Logger: class {},
    StepLogger: class {},
}));

jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: jest.fn(() => mockModuleLogger),
}));

// Mock cache utilities
jest.mock('@/core/cache/AbstractCacheManager', () => ({
    getCacheTTLWithJitter: jest.fn((ttl: number) => ttl),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        DA_LIVE_API: 30000,
        OAUTH_FLOW: 120000,
        TOKEN_VALIDATION_TTL: 300000,
        CONFIG_READ: 5000,
        TOKEN_RETRY_BASE: 500,
        TOOL_CLONE: 60000,
        TOOL_INSTALL: 120000,
        DATA_INGESTION: 300000,
        EDS_HELIX_CONFIG: 30000,
        EDS_CODE_SYNC_POLL: 5000,
    },
    CACHE_TTL: {
        PREREQUISITE_CHECK: 300000,
        AUTH_STATUS: 60000,
        VALIDATION: 300000,
        ORG_LIST: 300000,
        CONSOLE_WHERE: 300000,
        TOKEN_INSPECTION: 120000,
    },
    formatMinutes: jest.fn((min: number) => `${min} minutes`),
}));

describe('Service Logger Injection', () => {
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = createMockLogger();
        jest.clearAllMocks();
        // Clear module-level mock logs
        Object.values(mockModuleLogger).forEach((fn) => {
            if (typeof fn === 'function' && 'mockClear' in fn) {
                (fn as jest.Mock).mockClear();
            }
        });
    });

    describe('AuthCacheManager', () => {
        it('should accept optional logger in constructor', () => {
            const { AuthCacheManager } = require('@/features/authentication/services/authCacheManager');

            // Should work without logger (backward compatible)
            const cacheManager1 = new AuthCacheManager();
            expect(cacheManager1).toBeDefined();

            // Should work with logger (DI pattern)
            const cacheManager2 = new AuthCacheManager(mockLogger);
            expect(cacheManager2).toBeDefined();
        });
    });

    describe('PrerequisitesCacheManager', () => {
        it('should accept optional logger in constructor and use injected logger', () => {
            const { PrerequisitesCacheManager } = require('@/features/prerequisites/services/prerequisitesCacheManager');

            // Should work without logger (backward compatible)
            const cacheManager1 = new PrerequisitesCacheManager();
            expect(cacheManager1).toBeDefined();

            // Should work with logger (DI pattern)
            const cacheManager2 = new PrerequisitesCacheManager(mockLogger);
            expect(cacheManager2).toBeDefined();

            // Set up a cache entry, then invalidate it (which will log)
            const mockStatus = { installed: true, version: '1.0.0' };
            cacheManager2.setCachedResult('test-prereq', mockStatus as any);
            cacheManager2.invalidate('test-prereq');

            // Verify the injected logger was called
            expect(mockLogger.debug).toHaveBeenCalled();
        });
    });

    describe('TokenManager', () => {
        it('should accept optional logger in constructor and use injected logger', async () => {
            // Mock command executor
            const mockCommandExecutor = {
                execute: jest.fn().mockResolvedValue({
                    code: 1,
                    stdout: '',
                    stderr: 'Not found',
                }),
            };

            const { TokenManager } = require('@/features/authentication/services/tokenManager');

            // Should work without logger (backward compatible via getLogger())
            const tokenManager1 = new TokenManager(mockCommandExecutor);
            expect(tokenManager1).toBeDefined();

            // Should work with logger (DI pattern)
            const tokenManager2 = new TokenManager(mockCommandExecutor, undefined, mockLogger);
            expect(tokenManager2).toBeDefined();

            // Trigger operation that logs
            await tokenManager2.inspectToken();

            // Verify the injected logger was called
            // Note: The "[Token] Shared cache not available" message is logged during construction
            // when ServiceLocator is not available, which uses the injected logger
            expect(mockLogger.debug).toHaveBeenCalled();
        });
    });

    describe('DaLiveOrgOperations', () => {
        it('should accept optional logger in constructor', () => {
            // Mock token provider
            const mockTokenProvider = {
                getToken: jest.fn().mockResolvedValue('test-token'),
            };

            const { DaLiveOrgOperations } = require('@/features/eds/services/daLiveOrgOperations');

            // Should work without logger (backward compatible)
            const service1 = new DaLiveOrgOperations(mockTokenProvider);
            expect(service1).toBeDefined();

            // Should work with logger (DI pattern)
            const service2 = new DaLiveOrgOperations(mockTokenProvider, mockLogger);
            expect(service2).toBeDefined();
        });
    });

    describe('GitHubTokenService', () => {
        it('should accept optional logger in constructor', () => {
            // Mock secret storage
            const mockSecretStorage = {
                get: jest.fn(),
                store: jest.fn(),
                delete: jest.fn(),
            };

            const { GitHubTokenService } = require('@/features/eds/services/githubTokenService');

            // Should work without logger (backward compatible)
            const service1 = new GitHubTokenService(mockSecretStorage);
            expect(service1).toBeDefined();

            // Should work with logger (DI pattern)
            const service2 = new GitHubTokenService(mockSecretStorage, mockLogger);
            expect(service2).toBeDefined();
        });
    });

    describe('ToolManager', () => {
        it('should accept optional logger in constructor', () => {
            const { ToolManager } = require('@/features/eds/services/toolManager');

            // Should work without logger (backward compatible)
            const manager1 = new ToolManager();
            expect(manager1).toBeDefined();

            // Should work with logger (DI pattern)
            const manager2 = new ToolManager(mockLogger);
            expect(manager2).toBeDefined();
        });
    });

    describe('EdsProjectService', () => {
        it('should accept optional logger in constructor', () => {
            // Mock dependencies - must pass validation
            const mockGithubService = { createFromTemplate: jest.fn() };
            const mockDaLiveService = { copyCitisignalContent: jest.fn() };
            const mockAuthService = { getTokenManager: jest.fn() };
            const mockComponentManager = { installComponent: jest.fn() };

            const { EdsProjectService } = require('@/features/eds/services/edsProjectService');

            // Should work without logger (backward compatible)
            const service1 = new EdsProjectService(
                mockGithubService,
                mockDaLiveService,
                mockAuthService,
                mockComponentManager,
            );
            expect(service1).toBeDefined();

            // Should work with logger (DI pattern)
            const service2 = new EdsProjectService(
                mockGithubService,
                mockDaLiveService,
                mockAuthService,
                mockComponentManager,
                mockLogger,
            );
            expect(service2).toBeDefined();
        });
    });

    describe('HelixService', () => {
        it('should accept optional logger in constructor', () => {
            // Mock auth service - must pass validation
            const mockAuthService = { getTokenManager: jest.fn() };

            const { HelixService } = require('@/features/eds/services/helixService');

            // Should work without logger (backward compatible)
            const service1 = new HelixService(mockAuthService);
            expect(service1).toBeDefined();

            // Should work with logger (DI pattern)
            const service2 = new HelixService(mockAuthService, mockLogger);
            expect(service2).toBeDefined();
        });
    });

    describe('CleanupService', () => {
        it('should accept optional logger in constructor', () => {
            // Mock dependencies
            const mockGithubService = { deleteRepository: jest.fn() };
            const mockDaLiveService = { deleteSite: jest.fn() };
            const mockHelixService = { unpublishSite: jest.fn() };
            const mockToolManager = { executeAcoCleanup: jest.fn() };

            const { CleanupService } = require('@/features/eds/services/cleanupService');

            // Should work without logger (backward compatible)
            const service1 = new CleanupService(
                mockGithubService,
                mockDaLiveService,
                mockHelixService,
                mockToolManager,
            );
            expect(service1).toBeDefined();

            // Should work with logger (DI pattern)
            const service2 = new CleanupService(
                mockGithubService,
                mockDaLiveService,
                mockHelixService,
                mockToolManager,
                mockLogger,
            );
            expect(service2).toBeDefined();
        });
    });
});
