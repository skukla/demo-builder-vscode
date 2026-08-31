import { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { StepLogger } from '@/core/logging/stepLogger';
import type { Logger } from '@/types/logger';
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
jest.mock('@/features/authentication/services/adobeSDKClient');
jest.mock('@/features/authentication/services/adobeEntityService');
// Mocked so the assertion is on the CALL, not on cache state in another feature.
jest.mock('@/features/data-installer/services/commerceCredentialBroker', () => ({
    clearSharedCredentialCache: jest.fn(),
}));

import { getLogger } from '@/core/logging/debugLogger';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { createEntityServices } from '@/features/authentication/services/adobeEntityService';
import { clearSharedCredentialCache } from '@/features/data-installer/services/commerceCredentialBroker';

describe('AuthenticationService - Login/Logout Operations', () => {
    let authService: AuthenticationService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = createMockCommandExecutor();
        mockLogger = createMockLogger();
        mockStepLogger = createMockStepLogger();

        // Mock getLogger
        (getLogger as jest.Mock).mockReturnValue(mockLogger);

        // Mock StepLogger.create
        const StepLoggerMock = require('@/core/logging/stepLogger').StepLogger;
        StepLoggerMock.create = jest.fn().mockResolvedValue(mockStepLogger);

        // Setup mock SDK client
        mockSDKClient = {
            initialize: jest.fn().mockResolvedValue(undefined),
            ensureInitialized: jest.fn().mockResolvedValue(true),
            clear: jest.fn(),
        } as any;

        // Mock constructors
        (AdobeSDKClient as jest.MockedClass<typeof AdobeSDKClient>).mockImplementation(() => mockSDKClient);
        (createEntityServices as jest.Mock).mockReturnValue({
            fetcher: { getOrganizations: jest.fn().mockResolvedValue([mockOrg]) },
            resolver: {},
            selector: {},
        });

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

        /**
         * The shared Commerce credential is cached per service URL, and it was
         * fetched under THIS user's authorization — the discovery service checks
         * their IMS token and email domain before serving it. Whoever signs in
         * next must not inherit a credential they were never cleared for.
         *
         * Pinned here rather than left to the broker's own suite because the
         * coupling is what matters: the cache is in another feature entirely, and
         * nothing else would notice if this call were dropped.
         */
        it('clears the cached shared Commerce credential', async () => {
            mockCommandExecutor.execute.mockResolvedValue(createSuccessResult('Logged out'));

            await authService.logout();

            expect(clearSharedCredentialCache).toHaveBeenCalled();
        });
    });

    describe('loginAndRestoreProjectContext', () => {
        it('should perform a non-forced login by default', async () => {
            // Given: CLI returns a valid token
            const token = 'x'.repeat(150);
            mockCommandExecutor.execute.mockResolvedValue(createSuccessResult(token));

            // When: restoring context without requesting a forced login
            const result = await authService.loginAndRestoreProjectContext({
                organization: 'org123',
                projectId: 'project123',
                workspace: 'workspace123',
            });

            // Then: a non-forced login is performed (no -f flag)
            expect(result).toBe(true);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio auth login',
                expect.objectContaining({ encoding: 'utf8' })
            );
        });

        it('should perform a FORCED login when force=true (org switch)', async () => {
            // Given: CLI returns a valid token after forced login
            const token = 'x'.repeat(150);
            mockCommandExecutor.execute.mockResolvedValue(createSuccessResult(token));

            // When: restoring context with a forced login (browser org chooser)
            const result = await authService.loginAndRestoreProjectContext(
                {
                    organization: 'org123',
                    projectId: 'project123',
                    workspace: 'workspace123',
                },
                true,
            );

            // Then: the forced (-f) login command is used so a stale browser
            // SSO tab cannot silently reassert the wrong org.
            expect(result).toBe(true);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio auth login -f',
                expect.objectContaining({ encoding: 'utf8' })
            );
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

        it('should clear the cached organization AND org list after non-forced login', async () => {
            // Regression: a non-forced re-auth used to keep the stale org caches, so the
            // wizard kept showing the previous org. The org is re-derived via
            // getOrganizations(), which is org-list-cache-first — so the org LIST must be
            // cleared too, else the org re-derives from a stale list (~60s TTL). The forced
            // path already clears both via clearAll.
            const cacheManager = (authService as any).cacheManager;
            cacheManager.setCachedOrganization(mockOrg); // seed a stale org
            cacheManager.setCachedOrgList([mockOrg]); // seed a stale org list

            const token = 'x'.repeat(150);
            mockCommandExecutor.execute.mockResolvedValue(createSuccessResult(token));

            await authService.login(false);

            // Both the org and the org list must be cleared so re-derivation reflects the
            // fresh token — not the previous, stale org.
            expect(cacheManager.getCachedOrganization()).toBeUndefined();
            expect(cacheManager.getCachedOrgList()).toBeUndefined();
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
