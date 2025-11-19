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
jest.mock('@/features/authentication/services/adobeEntityService');

import { getLogger } from '@/core/logging';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { AdobeEntityService } from '@/features/authentication/services/adobeEntityService';

describe('AuthenticationService - Login/Logout Operations', () => {
    let authService: AuthenticationService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockEntityService: jest.Mocked<AdobeEntityService>;

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

        // Create mock entity service
        mockEntityService = {
            getOrganizations: jest.fn().mockResolvedValue([mockOrg]),
        } as any;

        // Mock constructors
        (AdobeSDKClient as jest.MockedClass<typeof AdobeSDKClient>).mockImplementation(() => mockSDKClient);
        (AdobeEntityService as jest.MockedClass<typeof AdobeEntityService>).mockImplementation(() => mockEntityService);

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
});
