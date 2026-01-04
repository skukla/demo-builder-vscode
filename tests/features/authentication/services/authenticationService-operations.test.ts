import { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { CommandExecutor, CommandResult } from '@/core/shell';
import type { Logger, StepLogger } from '@/core/logging';
import {
    createMockCommandExecutor,
    createMockLogger,
    createMockStepLogger,
    createSuccessResult,
    mockOrg,
} from './authenticationService.testUtils';

/**
 * AuthenticationService - Login/Logout Operations Test Suite
 *
 * Tests authentication operations:
 * - login() - Standard and forced login
 * - logout() - Logout with SDK cleanup
 * - Retry logic for invalid tokens
 * - Error handling for various failure scenarios
 *
 * Total tests: 11
 */

// Only mock external dependencies
jest.mock('@/core/logging');
jest.mock('@/features/authentication/services/adobeSDKClient');
jest.mock('@/features/authentication/services/adobeEntityFetcher');
jest.mock('@/features/authentication/services/adobeContextResolver');
jest.mock('@/features/authentication/services/adobeEntitySelector');

import { getLogger } from '@/core/logging';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import { AdobeContextResolver } from '@/features/authentication/services/adobeContextResolver';
import { AdobeEntitySelector } from '@/features/authentication/services/adobeEntitySelector';

describe('AuthenticationService - Login/Logout Operations', () => {
    let authService: AuthenticationService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockFetcher: jest.Mocked<AdobeEntityFetcher>;
    let mockResolver: jest.Mocked<AdobeContextResolver>;
    let mockSelector: jest.Mocked<AdobeEntitySelector>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = createMockCommandExecutor();
        mockLogger = createMockLogger();
        mockStepLogger = createMockStepLogger();

        // Mock getLogger
        (getLogger as jest.Mock).mockReturnValue(mockLogger);

        // Mock StepLogger.create
        const StepLoggerMock = require('@/core/logging').StepLogger;
        StepLoggerMock.create = jest.fn().mockResolvedValue(mockStepLogger);

        // Setup mock SDK client
        mockSDKClient = {
            initialize: jest.fn().mockResolvedValue(undefined),
            ensureInitialized: jest.fn().mockResolvedValue(true),
            clear: jest.fn(),
        } as any;

        // Create mock specialized services
        mockFetcher = {
            getOrganizations: jest.fn().mockResolvedValue([mockOrg]),
            getProjects: jest.fn().mockResolvedValue([]),
            getWorkspaces: jest.fn().mockResolvedValue([]),
        } as any;

        mockResolver = {
            getCurrentOrganization: jest.fn().mockResolvedValue(undefined),
            getCurrentProject: jest.fn().mockResolvedValue(undefined),
            getCurrentWorkspace: jest.fn().mockResolvedValue(undefined),
            getCurrentContext: jest.fn().mockResolvedValue({}),
        } as any;

        mockSelector = {
            selectOrganization: jest.fn().mockResolvedValue(true),
            selectProject: jest.fn().mockResolvedValue(true),
            selectWorkspace: jest.fn().mockResolvedValue(true),
            autoSelectOrganizationIfNeeded: jest.fn().mockResolvedValue(undefined),
            clearConsoleContext: jest.fn().mockResolvedValue(undefined),
        } as any;

        // Mock constructors
        (AdobeSDKClient as jest.MockedClass<typeof AdobeSDKClient>).mockImplementation(() => mockSDKClient);
        (AdobeEntityFetcher as jest.MockedClass<typeof AdobeEntityFetcher>).mockImplementation(() => mockFetcher);
        (AdobeContextResolver as jest.MockedClass<typeof AdobeContextResolver>).mockImplementation(() => mockResolver);
        (AdobeEntitySelector as jest.MockedClass<typeof AdobeEntitySelector>).mockImplementation(() => mockSelector);

        authService = new AuthenticationService('/mock/extension/path', mockLogger, mockCommandExecutor);
    });

    describe('login', () => {
        it('should execute login command and trust CLI token storage', async () => {
            const token = 'x'.repeat(150);
            mockCommandExecutor.execute.mockResolvedValue(createSuccessResult(token));

            const result = await authService.login();

            expect(result).toBe(true);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio auth login',
                expect.objectContaining({ encoding: 'utf8' })
            );
        });

        it('should use force flag when forced login requested', async () => {
            // Given: CLI returns valid token after forced login
            const token = 'x'.repeat(150);
            mockCommandExecutor.execute.mockResolvedValue(createSuccessResult(token));

            // When: forcing login
            await authService.login(true);

            // Then: should use -f flag
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio auth login -f',
                expect.objectContaining({ encoding: 'utf8' })
            );
            expect(mockSDKClient.clear).toHaveBeenCalled();
            // No longer calls clearSessionCaches or clearConsoleContext (performance optimization)
        });

        it('should retry with force flag if token is invalid', async () => {
            const invalidToken = 'short';
            const validToken = 'x'.repeat(150);

            // Given: First login returns invalid token, second (forced) returns valid
            mockCommandExecutor.execute
                .mockResolvedValueOnce(createSuccessResult(invalidToken))
                .mockResolvedValueOnce(createSuccessResult(validToken));

            // When: attempting login
            const result = await authService.login();

            // Then: should retry with force flag and succeed
            expect(result).toBe(true);
            expect(mockCommandExecutor.execute).toHaveBeenCalledTimes(2);
            expect(mockCommandExecutor.execute).toHaveBeenNthCalledWith(
                1,
                'aio auth login',
                expect.objectContaining({ encoding: 'utf8' })
            );
            expect(mockCommandExecutor.execute).toHaveBeenNthCalledWith(
                2,
                'aio auth login -f',
                expect.objectContaining({ encoding: 'utf8' })
            );
        });

        it('should handle login timeout with formatted error', async () => {
            const error = new Error('timeout');
            mockCommandExecutor.execute.mockRejectedValue(error);

            const result = await authService.login();

            expect(result).toBe(false);
            // Error is formatted by AuthenticationErrorFormatter
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle permission errors with formatted error', async () => {
            const error = new Error('EACCES: permission denied');
            mockCommandExecutor.execute.mockRejectedValue(error);

            const result = await authService.login();

            expect(result).toBe(false);
            // Error is formatted by AuthenticationErrorFormatter
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle network errors with formatted error', async () => {
            const error = new Error('ENETUNREACH: network unreachable');
            mockCommandExecutor.execute.mockRejectedValue(error);

            const result = await authService.login();

            expect(result).toBe(false);
            // Error is formatted by AuthenticationErrorFormatter
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should NOT retry when CLI succeeds with valid token', async () => {
            const token = 'x'.repeat(150);
            mockCommandExecutor.execute.mockResolvedValue(createSuccessResult(token));

            const result = await authService.login();

            expect(result).toBe(true);
            // Should only call login once - trusts CLI exit code 0
            expect(mockCommandExecutor.execute).toHaveBeenCalledTimes(1);
        });
    });

    describe('logout', () => {
        it('should execute logout command and clear SDK', async () => {
            // Given: Logout command succeeds
            mockCommandExecutor.execute.mockResolvedValue(createSuccessResult('Logged out'));

            // When: logging out
            await authService.logout();

            // Then: should execute logout and clear SDK
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio auth logout',
                expect.objectContaining({ encoding: 'utf8' })
            );
            expect(mockSDKClient.clear).toHaveBeenCalled();
        });

        it('should propagate errors', async () => {
            const error = new Error('Logout failed');
            mockCommandExecutor.execute.mockRejectedValue(error);

            await expect(authService.logout()).rejects.toThrow('Logout failed');
        });
    });

    describe('cache clearing after login', () => {
        let clearAuthStatusCacheSpy: jest.SpyInstance;
        let clearValidationCacheSpy: jest.SpyInstance;
        let clearTokenInspectionCacheSpy: jest.SpyInstance;
        let clearAllSpy: jest.SpyInstance;

        beforeEach(() => {
            // Spy on cache manager methods
            const cacheManager = (authService as any).cacheManager;
            clearAuthStatusCacheSpy = jest.spyOn(cacheManager, 'clearAuthStatusCache');
            clearValidationCacheSpy = jest.spyOn(cacheManager, 'clearValidationCache');
            clearTokenInspectionCacheSpy = jest.spyOn(cacheManager, 'clearTokenInspectionCache');
            clearAllSpy = jest.spyOn(cacheManager, 'clearAll');
        });

        it('should clear token inspection cache after non-forced login', async () => {
            // Given: Successful login without force flag
            const token = 'x'.repeat(150);
            mockCommandExecutor.execute.mockResolvedValue(createSuccessResult(token));

            // When: performing non-forced login
            await authService.login(false);

            // Then: should clear token inspection cache (fix for auth loop bug)
            expect(clearTokenInspectionCacheSpy).toHaveBeenCalled();
            expect(clearAuthStatusCacheSpy).toHaveBeenCalled();
            expect(clearValidationCacheSpy).toHaveBeenCalled();
        });

        it('should NOT call clearAll for non-forced login', async () => {
            // Given: Successful login without force flag
            const token = 'x'.repeat(150);
            mockCommandExecutor.execute.mockResolvedValue(createSuccessResult(token));

            // When: performing non-forced login
            await authService.login(false);

            // Then: should clear individual caches, not clearAll
            expect(clearAllSpy).not.toHaveBeenCalled();
            expect(clearAuthStatusCacheSpy).toHaveBeenCalled();
            expect(clearValidationCacheSpy).toHaveBeenCalled();
            expect(clearTokenInspectionCacheSpy).toHaveBeenCalled();
        });

        it('should call clearAll before forced login', async () => {
            // Given: Successful forced login
            const token = 'x'.repeat(150);
            mockCommandExecutor.execute.mockResolvedValue(createSuccessResult(token));

            // When: performing forced login
            await authService.login(true);

            // Then: should call clearAll before login
            expect(clearAllSpy).toHaveBeenCalled();
        });

        it('should clear all three caches to prevent stale token bug', async () => {
            // Given: Successful login
            const token = 'x'.repeat(150);
            mockCommandExecutor.execute.mockResolvedValue(createSuccessResult(token));

            // When: performing non-forced login
            await authService.login(false);

            // Then: all three caches should be cleared to prevent auth loop
            // This test verifies the fix for the "Session expired" loop bug where
            // token inspection cache was not cleared, causing next auth check to fail
            expect(clearAuthStatusCacheSpy).toHaveBeenCalledTimes(1);
            expect(clearValidationCacheSpy).toHaveBeenCalledTimes(1);
            expect(clearTokenInspectionCacheSpy).toHaveBeenCalledTimes(1);
        });
    });
});
