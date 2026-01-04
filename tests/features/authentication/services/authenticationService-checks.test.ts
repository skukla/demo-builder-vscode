import { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { CommandExecutor, CommandResult } from '@/core/shell';
import type { Logger, StepLogger } from '@/core/logging';
import {
    createMockCommandExecutor,
    createMockLogger,
    createMockStepLogger,
    createValidTokenResult,
    createInvalidTokenResult,
    createFailureResult,
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

describe('AuthenticationService - Authentication Checks', () => {
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
            getCurrentOrganization: jest.fn().mockResolvedValue(mockOrg),
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

    describe('initialization', () => {
        it('should create service with all dependencies', () => {
            expect(authService).toBeDefined();
            expect(AdobeSDKClient).toHaveBeenCalledWith(mockLogger);
        });
    });

    describe('isAuthenticated', () => {
        it('should return true when valid token exists', async () => {
            // Given: CLI returns a valid token with expiry
            mockCommandExecutor.execute.mockResolvedValue(createValidTokenResult());

            // When: checking authentication quickly
            const result = await authService.isAuthenticated();

            // Then: should return true
            expect(result).toBe(true);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config get ims.contexts.cli.access_token --json',
                expect.objectContaining({ encoding: 'utf8' })
            );
        });

        it('should return false when token is invalid', async () => {
            // Given: CLI returns short token
            mockCommandExecutor.execute.mockResolvedValue(createInvalidTokenResult());

            // When: checking authentication quickly
            const result = await authService.isAuthenticated();

            // Then: should return false
            expect(result).toBe(false);
        });

        it('should return false when CLI command fails', async () => {
            // Given: CLI command fails
            mockCommandExecutor.execute.mockResolvedValue(createFailureResult('Error: Not logged in'));

            // When: checking authentication quickly
            const result = await authService.isAuthenticated();

            // Then: should return false
            expect(result).toBe(false);
        });

        it('should handle exceptions gracefully', async () => {
            // Given: CLI throws an exception
            mockCommandExecutor.execute.mockRejectedValue(new Error('Command failed'));

            // When: checking authentication quickly
            const result = await authService.isAuthenticated();

            // Then: should return false (error logging happens internally)
            expect(result).toBe(false);
        });
    });

    describe('isFullyAuthenticated', () => {
        it('should return true when token is valid and org context is valid', async () => {
            // Given: Valid token and org context
            mockCommandExecutor.execute
                .mockResolvedValueOnce(createValidTokenResult())
                .mockResolvedValueOnce(createOrgContextResult())
                .mockResolvedValueOnce(createProjectListResult());

            // When: checking full authentication
            const result = await authService.isFullyAuthenticated();

            // Then: should return true
            expect(result).toBe(true);
        });

        it('should return false when token is invalid', async () => {
            // Given: Invalid token (too short)
            mockCommandExecutor.execute.mockResolvedValue(createInvalidTokenResult());

            // When: checking full authentication
            const result = await authService.isFullyAuthenticated();

            // Then: should return false
            expect(result).toBe(false);
        });

        it('should NOT initialize SDK during authentication check', async () => {
            // Given: Valid token
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: 'x'.repeat(150),
                    stderr: '',
                } as CommandResult)
                .mockResolvedValueOnce(createOrgContextResult());

            // When: checking authentication
            await authService.isFullyAuthenticated();

            // Then: SDK should not be initialized (it's on-demand)
            expect(mockSDKClient.initialize).not.toHaveBeenCalled();
        });

        it('should handle ENOENT errors gracefully', async () => {
            // Given: CLI command fails with ENOENT
            mockCommandExecutor.execute.mockRejectedValue(new Error('ENOENT: no such file'));

            // When: checking authentication
            const result = await authService.isFullyAuthenticated();

            // Then: should return false
            expect(result).toBe(false);
        });

        it('should handle timeout errors gracefully', async () => {
            // Given: CLI command times out
            mockCommandExecutor.execute.mockRejectedValue(new Error('Operation timeout'));

            // When: checking authentication
            const result = await authService.isFullyAuthenticated();

            // Then: should return false
            expect(result).toBe(false);
        });
    });
});
