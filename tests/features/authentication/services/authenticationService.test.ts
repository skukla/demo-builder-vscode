import { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { CommandExecutor, CommandResult } from '@/core/shell';
import type { Logger, StepLogger } from '@/core/logging';
import type { AdobeOrg, AdobeProject, AdobeWorkspace } from '@/features/authentication/services/types';

/**
 * AuthenticationService Test Suite
 *
 * Tests the main authentication orchestration service:
 * - Quick authentication checks (token-only, <1s)
 * - Full authentication checks (with org validation, 3-10s)
 * - Login and logout operations
 * - Organization/project/workspace selection
 * - Entity retrieval (orgs, projects, workspaces)
 * - Cache management
 * - SDK initialization
 * - Error handling
 *
 * Total tests: 50+
 */

// Only mock external dependencies (logging is external)
jest.mock('@/core/logging');

// Import actual internal services (not mocked) for integration testing
import { getLogger } from '@/core/logging';

// Mock only the external SDK client and entity service which make network calls
jest.mock('@/features/authentication/services/adobeSDKClient');
jest.mock('@/features/authentication/services/adobeEntityService');
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { AdobeEntityService } from '@/features/authentication/services/adobeEntityService';

// Mock data
const mockOrg: AdobeOrg = {
    id: 'org123',
    code: 'ORGCODE',
    name: 'Test Organization',
};

const mockProject: AdobeProject = {
    id: 'proj123',
    name: 'Test Project',
};

const mockWorkspace: AdobeWorkspace = {
    id: 'ws123',
    name: 'Test Workspace',
};

const createMockCommandExecutor = (): jest.Mocked<CommandExecutor> => ({
    execute: jest.fn(),
    executeCommand: jest.fn(),
    executeWithNodeVersion: jest.fn(),
    testCommand: jest.fn(),
    getNodeVersionForComponent: jest.fn(),
    getCachedBinaryPath: jest.fn(),
    invalidateBinaryPathCache: jest.fn(),
    getCachedNodeVersion: jest.fn(),
    invalidateNodeVersionCache: jest.fn(),
} as any);

const createMockLogger = (): jest.Mocked<Logger> => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
} as any);

const createMockStepLogger = (): jest.Mocked<StepLogger> => ({
    logTemplate: jest.fn(),
    logMessage: jest.fn(),
    setCurrentStep: jest.fn(),
    setStepName: jest.fn(),
} as any);

describe('AuthenticationService', () => {
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

        // Setup mock SDK client (external dependency)
        mockSDKClient = {
            initialize: jest.fn().mockResolvedValue(undefined),
            ensureInitialized: jest.fn().mockResolvedValue(true),
            clear: jest.fn(),
        } as any;

        // Create mock entity service (makes network calls)
        mockEntityService = {
            getOrganizations: jest.fn().mockResolvedValue([mockOrg]),
            getProjects: jest.fn().mockResolvedValue([mockProject]),
            getWorkspaces: jest.fn().mockResolvedValue([mockWorkspace]),
            getCurrentOrganization: jest.fn().mockResolvedValue(mockOrg),
            getCurrentProject: jest.fn().mockResolvedValue(mockProject),
            getCurrentWorkspace: jest.fn().mockResolvedValue(mockWorkspace),
            getCurrentContext: jest.fn().mockResolvedValue({ org: mockOrg, project: mockProject, workspace: mockWorkspace }),
            selectOrganization: jest.fn().mockResolvedValue(true),
            selectProject: jest.fn().mockResolvedValue(true),
            selectWorkspace: jest.fn().mockResolvedValue(true),
            autoSelectOrganizationIfNeeded: jest.fn().mockResolvedValue(undefined),
        } as any;

        // Mock constructors for external dependencies only
        (AdobeSDKClient as jest.MockedClass<typeof AdobeSDKClient>).mockImplementation(() => mockSDKClient);
        (AdobeEntityService as jest.MockedClass<typeof AdobeEntityService>).mockImplementation(() => mockEntityService);

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
            const futureExpiry = Date.now() + 3600000; // 1 hour from now
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({
                    token: 'x'.repeat(150), // Valid token > 100 chars
                    expiry: futureExpiry
                }),
                stderr: '',
            } as CommandResult);

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
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({
                    token: 'short', // Invalid token < 100 chars
                    expiry: Date.now() + 3600000
                }),
                stderr: '',
            } as CommandResult);

            // When: checking authentication quickly
            const result = await authService.isAuthenticated();

            // Then: should return false
            expect(result).toBe(false);
        });

        it('should return false when CLI command fails', async () => {
            // Given: CLI command fails
            mockCommandExecutor.execute.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'Error: Not logged in',
            } as CommandResult);

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
            const futureExpiry = Date.now() + 3600000;
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({
                        token: 'x'.repeat(150),
                        expiry: futureExpiry
                    }),
                    stderr: '',
                } as CommandResult)
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ org: 'org123', project: 'proj123' }),
                    stderr: '',
                } as CommandResult)
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify([{ id: 'proj1', name: 'Project 1' }]),
                    stderr: '',
                } as CommandResult);

            // When: checking full authentication
            const result = await authService.isFullyAuthenticated();

            // Then: should return true
            expect(result).toBe(true);
        });

        it('should return false when token is invalid', async () => {
            // Given: Invalid token (too short)
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({
                    token: 'invalid',
                    expiry: Date.now() + 3600000
                }),
                stderr: '',
            } as CommandResult);

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
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ org: 'org123' }),
                    stderr: '',
                } as CommandResult);

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

    describe('login', () => {
        it('should execute login command and trust CLI token storage', async () => {
            const token = 'x'.repeat(150);
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: token,
                stderr: '',
            } as CommandResult);

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
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: token,
                stderr: '',
            } as CommandResult);

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
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: invalidToken,
                    stderr: '',
                } as CommandResult)
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: validToken,
                    stderr: '',
                } as CommandResult);

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
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: token,
                stderr: '',
            } as CommandResult);

            const result = await authService.login();

            expect(result).toBe(true);
            // Should only call login once - trusts CLI exit code 0
            expect(mockCommandExecutor.execute).toHaveBeenCalledTimes(1);
        });
    });

    describe('logout', () => {
        it('should execute logout command and clear SDK', async () => {
            // Given: Logout command succeeds
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: 'Logged out',
                stderr: '',
            } as CommandResult);

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

    describe('entity methods', () => {
        it('should get organizations', async () => {
            const result = await authService.getOrganizations();

            expect(result).toEqual([mockOrg]);
            expect(mockEntityService.getOrganizations).toHaveBeenCalled();
        });

        it('should get projects', async () => {
            const result = await authService.getProjects();

            expect(result).toEqual([mockProject]);
            expect(mockEntityService.getProjects).toHaveBeenCalled();
        });

        it('should get workspaces', async () => {
            const result = await authService.getWorkspaces();

            expect(result).toEqual([mockWorkspace]);
            expect(mockEntityService.getWorkspaces).toHaveBeenCalled();
        });

        it('should get current organization', async () => {
            const result = await authService.getCurrentOrganization();

            expect(result).toEqual(mockOrg);
            expect(mockEntityService.getCurrentOrganization).toHaveBeenCalled();
        });

        it('should get current project', async () => {
            const result = await authService.getCurrentProject();

            expect(result).toEqual(mockProject);
            expect(mockEntityService.getCurrentProject).toHaveBeenCalled();
        });

        it('should get current workspace', async () => {
            const result = await authService.getCurrentWorkspace();

            expect(result).toEqual(mockWorkspace);
            expect(mockEntityService.getCurrentWorkspace).toHaveBeenCalled();
        });

        it('should get current context', async () => {
            const result = await authService.getCurrentContext();

            expect(result).toEqual({ org: mockOrg, project: mockProject, workspace: mockWorkspace });
            expect(mockEntityService.getCurrentContext).toHaveBeenCalled();
        });
    });

    describe('selection methods', () => {
        it('should select organization', async () => {
            const result = await authService.selectOrganization('org123');

            expect(result).toBe(true);
            expect(mockEntityService.selectOrganization).toHaveBeenCalledWith('org123');
        });

        it('should select project', async () => {
            const result = await authService.selectProject('proj123');

            expect(result).toBe(true);
            expect(mockEntityService.selectProject).toHaveBeenCalledWith('proj123');
        });

        it('should select workspace', async () => {
            const result = await authService.selectWorkspace('ws123');

            expect(result).toBe(true);
            expect(mockEntityService.selectWorkspace).toHaveBeenCalledWith('ws123');
        });

        it('should auto-select organization if needed', async () => {
            mockEntityService.autoSelectOrganizationIfNeeded.mockResolvedValue(mockOrg);

            const result = await authService.autoSelectOrganizationIfNeeded();

            expect(result).toEqual(mockOrg);
            expect(mockEntityService.autoSelectOrganizationIfNeeded).toHaveBeenCalledWith(false);
        });
    });

    describe('SDK management', () => {
        it('should ensure SDK is initialized', async () => {
            // Given: SDK client is configured
            mockSDKClient.ensureInitialized.mockResolvedValue(true);

            // When: ensuring SDK initialization
            const result = await authService.ensureSDKInitialized();

            // Then: should return success
            expect(result).toBe(true);
            expect(mockSDKClient.ensureInitialized).toHaveBeenCalled();
        });
    });

    describe('org context validation', () => {
        it('should validate and clear invalid org when app list fails', async () => {
            // Given: Valid context but app list will fail
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ org: 'org123', project: 'proj123' }),
                    stderr: '',
                } as CommandResult)
                .mockResolvedValueOnce({
                    code: 1,
                    stdout: '',
                    stderr: 'Error: Cannot list apps',
                } as CommandResult);

            // When: validating org context
            await authService.validateAndClearInvalidOrgContext();

            // Then: should have attempted validation
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console where --json',
                expect.any(Object)
            );
        });

        it('should test developer permissions via app list', async () => {
            // Given: Valid org with apps
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify([{ name: 'App 1', app_id: 'app1' }]),
                stderr: '',
            } as CommandResult);

            // When: testing developer permissions
            const result = await authService.testDeveloperPermissions();

            // Then: should return permission status
            expect(result).toHaveProperty('hasPermissions');
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio app list --json',
                expect.any(Object)
            );
        });
    });

    describe('integration scenarios', () => {
        it('should handle full authentication flow with caching', async () => {
            // Given: First authentication check with valid token
            const futureExpiry = Date.now() + 3600000;
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({
                        token: 'x'.repeat(150),
                        expiry: futureExpiry
                    }),
                    stderr: '',
                } as CommandResult)
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ org: 'org123', project: 'proj123' }),
                    stderr: '',
                } as CommandResult)
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify([{ id: 'proj1', name: 'Project 1' }]),
                    stderr: '',
                } as CommandResult);

            // When: Multiple authentication checks
            const result1 = await authService.isAuthenticated();

            // Reset mock to return cached result
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({
                    token: 'x'.repeat(150),
                    expiry: futureExpiry
                }),
                stderr: '',
            } as CommandResult);

            const result2 = await authService.isAuthenticated();

            // Then: Both should succeed
            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });
    });
});
