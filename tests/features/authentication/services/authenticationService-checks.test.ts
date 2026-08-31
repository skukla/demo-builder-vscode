import { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { CommandExecutor } from '@/core/shell';
import type { StepLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';
import {
    createMockCommandExecutor,
    createMockLogger,
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

import { getLogger } from '@/core/logging';
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
        const StepLoggerMock = require('@/core/logging').StepLogger;
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
            resolver: { getCurrentOrganization: jest.fn().mockResolvedValue(mockOrg) },
            selector: {},
        });

        authService = new AuthenticationService('/mock/extension/path', mockLogger, mockCommandExecutor);
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
            const config = jest.requireMock('@adobe/aio-lib-core-config') as { get: jest.Mock };
            config.get.mockImplementationOnce(() => {
                throw new Error('config store unreadable');
            });

            // When: checking authentication quickly
            const result = await authService.isAuthenticated();

            // Then: should return false (error logging happens internally)
            expect(result).toBe(false);
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
            const config = jest.requireMock('@adobe/aio-lib-core-config') as { get: jest.Mock };
            config.get.mockImplementationOnce(() => {
                throw new Error('ENOENT: no such file');
            });

            // When: checking authentication
            const result = await authService.isFullyAuthenticated();

            // Then: should return false
            expect(result).toBe(false);
        });

    });
});
