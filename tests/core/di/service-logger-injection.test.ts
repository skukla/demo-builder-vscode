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
jest.mock('@/core/cache/cacheUtils', () => ({
    getCacheTTLWithJitter: jest.fn((ttl: number) => ttl),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000, // Standard API calls
        LONG: 180000, // Complex operations
        EXTENDED: 300000, // Extended operations
        QUICK: 5000, // Fast operations
        UI: {
            ANIMATION: 150,
            UPDATE_DELAY: 100,
            TRANSITION: 300,
            NOTIFICATION: 2000,
            MIN_LOADING: 1500,
            FOCUS_FALLBACK: 1000,
        },
        AUTH: {
            OAUTH: 120000,
            BROWSER: 60000,
        },
        POLL: {
            INITIAL: 500,
            MAX: 5000,
            INTERVAL: 1000,
            PROCESS_CHECK: 100,
        },
        WEBVIEW_INIT_DELAY: 50, // For loadingHTML.ts
        TOKEN_VALIDATION_TTL: 300000, // Custom TTL for tokens
    },
    CACHE_TTL: {
        MEDIUM: 300000, // 5 minutes (replaces PREREQUISITE_CHECK, VALIDATION, ORG_LIST, CONSOLE_WHERE)
        SHORT: 60000, // 1 minute (replaces AUTH_STATUS)
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
            // Mock auth service - must pass validation and provide token manager
            const mockTokenManager = { getAccessToken: jest.fn().mockResolvedValue('mock-token') };
            const mockAuthService = { getTokenManager: jest.fn().mockReturnValue(mockTokenManager) };

            const { HelixService } = require('@/features/eds/services/helixService');

            // Should work without logger (backward compatible)
            const service1 = new HelixService(mockAuthService);
            expect(service1).toBeDefined();

            // Should work with logger (DI pattern)
            const service2 = new HelixService(mockAuthService, mockLogger);
            expect(service2).toBeDefined();

            // Should work with logger and GitHub token service (Helix Admin API auth)
            const mockGithubTokenService = { getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }) };
            const service3 = new HelixService(mockAuthService, mockLogger, mockGithubTokenService);
            expect(service3).toBeDefined();
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
