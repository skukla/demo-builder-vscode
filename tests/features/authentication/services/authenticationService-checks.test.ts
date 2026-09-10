import { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { StepLogger } from '@/core/logging/stepLogger';
import type { Logger } from '@/types/logger';
import {
    createMockCommandExecutor,
    createMockLogger,
    createMockSDKClient,
    createMockStepLogger,
    createOrgContextResult,
    createProjectListResult,
    mockOrg,
} from './authenticationService.testUtils';

/**
 * AuthenticationService - Authentication Checks Test Suite
 *
 * Tests authentication validation methods:
 * - isAuthenticated() - Quick token-only checks (<1s)
 * - isFullyAuthenticated() - Full checks with org validation (3-10s)
 * - Token validation logic
 * - Error handling
 *
 * Total tests: 10
 */

// Only mock external dependencies
jest.mock('@/features/authentication/services/adobeSDKClient');
jest.mock('@/features/authentication/services/adobeEntityService');

/**
 * The CLI token store. `TokenManager` reads it IN PROCESS through this library —
 * it used to spawn `aio config get`, which is why these tests once staged a token
 * by faking subprocess stdout on the command executor. Mocked here rather than in
 * testUtils because `jest.mock` hoists only within the module it appears in, so a
 * factory living in another file would register too late.
 */
const mockStoredToken: { value: { token?: string; expiry?: number } | undefined } = {
    value: undefined,
};
jest.mock('@adobe/aio-lib-core-config', () => ({
    get: jest.fn(() => mockStoredToken.value),
    // The real reader reloads before every get (the library serves a snapshot
    // otherwise). Declared here so this mock is the real module's shape: without
    // it, the reader's reload throws and quietly runs its fallback path instead.
    reload: jest.fn(),
}));

/** Clears the 100-character floor, expiring an hour out unless told otherwise. */
const validStoredToken = (expiry?: number) => ({
    token: 'x'.repeat(150),
    expiry: expiry ?? Date.now() + 3600000,
});

import { getLogger } from '@/core/logging/debugLogger';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { createEntityServices } from '@/features/authentication/services/adobeEntityService';

describe('AuthenticationService - Authentication Checks', () => {
    let authService: AuthenticationService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;

    beforeEach(() => {
        jest.clearAllMocks();
        // `clearAllMocks` clears CALLS, not this value — without the reset a
        // valid token set by one test silently authenticates the next one.
        mockStoredToken.value = undefined;

        mockCommandExecutor = createMockCommandExecutor();
        mockLogger = createMockLogger();
        mockStepLogger = createMockStepLogger();

        // Mock getLogger
        (getLogger as jest.Mock).mockReturnValue(mockLogger);

        // Mock StepLogger.create
        const StepLoggerMock = require('@/core/logging/stepLogger').StepLogger;
        StepLoggerMock.create = jest.fn().mockResolvedValue(mockStepLogger);

        // Setup mock SDK client
        mockSDKClient = createMockSDKClient();

        // Mock constructors
        (AdobeSDKClient as jest.MockedClass<typeof AdobeSDKClient>).mockImplementation(
            () => mockSDKClient
        );
        (createEntityServices as jest.Mock).mockReturnValue({
            fetcher: { getOrganizations: jest.fn().mockResolvedValue([mockOrg]) },
            resolver: { getCurrentOrganization: jest.fn().mockResolvedValue(mockOrg) },
            selector: {},
        });

        authService = new AuthenticationService(
            '/mock/extension/path',
            mockLogger,
            mockCommandExecutor
        );
    });

    describe('initialization', () => {
        it('should create service with all dependencies', () => {
            expect(authService).toBeDefined();
            expect(AdobeSDKClient).toHaveBeenCalledWith(mockLogger);
        });
    });

    describe('isAuthenticated', () => {
        it('should return true when valid token exists', async () => {
            // Given: the CLI config store holds a valid token with expiry
            mockStoredToken.value = validStoredToken();

            // When: checking authentication quickly
            const result = await authService.isAuthenticated();

            // Then: should return true
            expect(result).toBe(true);
        });

        it('should return false when token is invalid', async () => {
            // Given: stored token is too short
            mockStoredToken.value = { token: 'short', expiry: Date.now() + 3600000 };

            // When: checking authentication quickly
            const result = await authService.isAuthenticated();

            // Then: should return false
            expect(result).toBe(false);
        });

        it('should return false when nothing is stored', async () => {
            // Given: no token in the config store — the signed-out case
            mockStoredToken.value = undefined;

            // When: checking authentication quickly
            const result = await authService.isAuthenticated();

            // Then: should return false
            expect(result).toBe(false);
        });

        it('should handle exceptions gracefully', async () => {
            // Given: the config store itself cannot be read
            mockStoredToken.value = undefined;
            const config = jest.requireMock('@adobe/aio-lib-core-config');
            config.get.mockImplementationOnce(() => {
                throw new Error('config store unreadable');
            });

            // When: checking authentication quickly
            const result = await authService.isAuthenticated();

            // Then: should return false (error logging happens internally)
            expect(result).toBe(false);
        });
    });

    /**
     * THE ANSWER IS CACHED, and that is load-bearing in both directions.
     *
     * A token check reads the Adobe CLI's config store and takes seconds. The dashboard
     * asks on every load, so without a cache the extension is slow enough to feel
     * broken. With a cache that never expires, a signed-out user stays "signed in" until
     * the window is reloaded.
     *
     * Both `isAuthenticated` and `isFullyAuthenticated` gate on the same freshness check,
     * written out twice, and nothing tested either copy — the word "cache" did not appear
     * in this suite.
     */
    /**
     * `getTokenStatus` is the only way anything asks HOW LONG is left, rather than just
     * whether the token is good. The prompts that warn before an expiry read it. Nothing
     * called it in any test.
     */
    describe('getTokenStatus', () => {
        it('reports the time remaining, not just that the token is valid', async () => {
            mockStoredToken.value = validStoredToken(Date.now() + 3600000);

            const status = await authService.getTokenStatus();

            expect(status.isAuthenticated).toBe(true);
            // About an hour. The exact figure depends on the clock; what matters is that
            // the remaining time is carried through rather than dropped.
            expect(status.expiresInMinutes).toBeGreaterThan(50);
            expect(status.expiresInMinutes).toBeLessThanOrEqual(60);
        });

        it('reports an expired token as not authenticated', async () => {
            mockStoredToken.value = validStoredToken(Date.now() - 60000);

            const status = await authService.getTokenStatus();

            expect(status.isAuthenticated).toBe(false);
        });

        it('answers for a machine with no token at all', async () => {
            mockStoredToken.value = undefined;

            await expect(authService.getTokenStatus()).resolves.toMatchObject({
                isAuthenticated: false,
            });
        });
    });

    /**
     * WHEN THE CHECK ITSELF BREAKS — an unreadable config file, a library that throws.
     *
     * Both checks answer "not signed in" rather than propagating, because an exception
     * here would take out whatever asked, and the dashboard asks on every load. Neither
     * catch had been entered by a test.
     */
    describe('when the token check throws', () => {
        function tokenReadExplodes() {
            const config = jest.requireMock('@adobe/aio-lib-core-config');
            (config.get as jest.Mock).mockImplementationOnce(() => {
                throw new Error('config store unreadable');
            });
        }

        it('the quick check answers false instead of throwing', async () => {
            tokenReadExplodes();

            await expect(authService.isAuthenticated()).resolves.toBe(false);
        });

        it('the full check answers false instead of throwing', async () => {
            tokenReadExplodes();

            await expect(authService.isFullyAuthenticated()).resolves.toBe(false);
        });
    });

    describe('the cached answer', () => {
        it('answers a second time without re-reading the token store', async () => {
            mockStoredToken.value = validStoredToken();

            await expect(authService.isAuthenticated()).resolves.toBe(true);

            // The store now says signed OUT. A cached answer must not notice, which is
            // the whole point — and is how a stale cache would look too, so the next
            // test is what makes this one safe to want.
            mockStoredToken.value = undefined;
            await expect(authService.isAuthenticated()).resolves.toBe(true);
        });

        it('re-reads once the cache is cleared', async () => {
            mockStoredToken.value = validStoredToken();
            await authService.isAuthenticated();

            mockStoredToken.value = undefined;
            authService.clearCache();

            await expect(authService.isAuthenticated()).resolves.toBe(false);
        });

        it('caches a NEGATIVE answer too, not just a positive one', async () => {
            // Only caching "yes" would leave a signed-out user paying the full check on
            // every dashboard load — the exact cost the cache exists to avoid.
            mockStoredToken.value = undefined;

            await expect(authService.isAuthenticated()).resolves.toBe(false);

            mockStoredToken.value = validStoredToken();
            await expect(authService.isAuthenticated()).resolves.toBe(false);
        });

        it('is shared with the full check, not kept per method', async () => {
            // The two methods answer different questions but read the same cached token
            // status. If they kept separate caches, signing out would be visible to one
            // and not the other.
            mockStoredToken.value = validStoredToken();
            await authService.isAuthenticated();

            mockStoredToken.value = undefined;
            await expect(authService.isFullyAuthenticated()).resolves.toBe(true);
        });

        it('the full check re-reads once the cache is cleared', async () => {
            // The same freshness rule, in the second place it is written. Both copies
            // have to hold, or one path keeps trusting a stale answer after the other
            // has stopped.
            mockStoredToken.value = validStoredToken();
            await authService.isFullyAuthenticated();

            mockStoredToken.value = undefined;
            authService.clearCache();

            await expect(authService.isFullyAuthenticated()).resolves.toBe(false);
        });

        it('the full check caches a negative answer as well', async () => {
            mockStoredToken.value = undefined;

            await expect(authService.isFullyAuthenticated()).resolves.toBe(false);

            mockStoredToken.value = validStoredToken();
            await expect(authService.isFullyAuthenticated()).resolves.toBe(false);
        });
    });

    describe('isFullyAuthenticated', () => {
        it('should return true when token is valid and org context is valid', async () => {
            // Given: Valid token and org context. The token comes from the config
            // store now; only the org calls still go through the CLI.
            mockStoredToken.value = validStoredToken();
            mockCommandExecutor.execute
                .mockResolvedValueOnce(createOrgContextResult())
                .mockResolvedValueOnce(createProjectListResult());

            // When: checking full authentication
            const result = await authService.isFullyAuthenticated();

            // Then: should return true
            expect(result).toBe(true);
        });

        it('should return false when token is invalid', async () => {
            // Given: Invalid token (too short)
            mockStoredToken.value = { token: 'short', expiry: Date.now() + 3600000 };

            // When: checking full authentication
            const result = await authService.isFullyAuthenticated();

            // Then: should return false
            expect(result).toBe(false);
        });

        it('should NOT initialize SDK during authentication check', async () => {
            // Given: Valid token
            mockStoredToken.value = validStoredToken();
            mockCommandExecutor.execute.mockResolvedValueOnce(createOrgContextResult());

            // When: checking authentication
            await authService.isFullyAuthenticated();

            // Then: SDK should not be initialized (it's on-demand)
            expect(mockSDKClient.initialize).not.toHaveBeenCalled();
        });

        /**
         * There were two tests here — "ENOENT errors" and "timeout errors" — and
         * both worked by rejecting the CLI call that READ THE TOKEN. That read is
         * in-process now, so neither could fail for its stated reason.
         *
         * One survives, below, as the store-unreadable case. The other is DELETED
         * rather than renamed: the only other failure it could have described is
         * an org check, and `isFullyAuthenticated` stopped doing one in Phase 4a
         * (org reachability is resolved per-operation via `ensureOrgContext`). A
         * test asserting a branch the method does not have is worse than no test.
         */
        it('should handle an unreadable config store gracefully', async () => {
            // Given: the token store throws rather than answering
            const config = jest.requireMock('@adobe/aio-lib-core-config');
            config.get.mockImplementationOnce(() => {
                throw new Error('ENOENT: no such file');
            });

            // When: checking authentication
            const result = await authService.isFullyAuthenticated();

            // Then: should return false
            expect(result).toBe(false);
        });
    });

    describe('the shared cache, full check first', () => {
        it('a full check that passed answers the quick check without re-reading', async () => {
            mockStoredToken.value = validStoredToken();
            await expect(authService.isFullyAuthenticated()).resolves.toBe(true);

            // The store now says signed OUT; the quick check must still answer from the
            // positive the full check cached.
            mockStoredToken.value = undefined;
            await expect(authService.isAuthenticated()).resolves.toBe(true);
        });
    });

    describe('entity services wiring', () => {
        it('hands the entity services a token check that answers from the token store', async () => {
            mockStoredToken.value = validStoredToken();
            await authService.getOrganizations();

            const isTokenValid = (createEntityServices as jest.Mock).mock.calls[0][5] as
                () => Promise<boolean>;
            await expect(isTokenValid()).resolves.toBe(true);

            authService.clearCache();
            mockStoredToken.value = undefined;
            await expect(isTokenValid()).resolves.toBe(false);
        });

        it('fails loudly when the entity factory returns nothing', async () => {
            (createEntityServices as jest.Mock).mockReturnValue(undefined);

            await expect(authService.getOrganizations()).rejects.toThrow(
                'Entity services failed to initialize',
            );
        });
    });
});
