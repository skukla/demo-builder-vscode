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

// Mock all dependencies
jest.mock('@/core/logging');
jest.mock('@/features/authentication/services/authCacheManager');
jest.mock('@/features/authentication/services/tokenManager');
jest.mock('@/features/authentication/services/adobeSDKClient');
jest.mock('@/features/authentication/services/adobeEntityService');
jest.mock('@/features/authentication/services/organizationValidator');
jest.mock('@/features/authentication/services/performanceTracker');

// Import mocked modules
import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import { TokenManager } from '@/features/authentication/services/tokenManager';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { AdobeEntityService } from '@/features/authentication/services/adobeEntityService';
import { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import { PerformanceTracker } from '@/features/authentication/services/performanceTracker';
import { getLogger } from '@/core/logging';

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
    executeAdobeCLI: jest.fn(),
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
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockTokenManager: jest.Mocked<TokenManager>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockEntityService: jest.Mocked<AdobeEntityService>;
    let mockOrgValidator: jest.Mocked<OrganizationValidator>;
    let mockPerfTracker: jest.Mocked<PerformanceTracker>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = createMockCommandExecutor();
        mockLogger = createMockLogger();
        mockStepLogger = createMockStepLogger();

        // Mock getLogger
        (getLogger as jest.Mock).mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        });

        // Mock StepLogger.create
        const StepLoggerMock = require('@/core/logging').StepLogger;
        StepLoggerMock.create = jest.fn().mockResolvedValue(mockStepLogger);

        // Create mock instances
        mockCacheManager = new AuthCacheManager() as jest.Mocked<AuthCacheManager>;
        mockTokenManager = new TokenManager(mockCommandExecutor) as jest.Mocked<TokenManager>;
        mockSDKClient = new AdobeSDKClient(mockLogger) as jest.Mocked<AdobeSDKClient>;
        mockOrgValidator = new OrganizationValidator(mockCommandExecutor, mockCacheManager, mockLogger) as jest.Mocked<OrganizationValidator>;
        mockPerfTracker = new PerformanceTracker() as jest.Mocked<PerformanceTracker>;

        // Setup mock implementations
        mockCacheManager.getCachedAuthStatus = jest.fn().mockReturnValue({ isAuthenticated: undefined, isExpired: true });
        mockCacheManager.setCachedAuthStatus = jest.fn();
        mockCacheManager.clearAll = jest.fn();
        mockCacheManager.clearAuthStatusCache = jest.fn();
        mockCacheManager.clearValidationCache = jest.fn();
        mockCacheManager.clearSessionCaches = jest.fn();
        mockCacheManager.clearConsoleWhereCache = jest.fn();
        mockCacheManager.wasOrgClearedDueToValidation = jest.fn().mockReturnValue(false);
        mockCacheManager.setOrgClearedDueToValidation = jest.fn();

        mockTokenManager.isTokenValid = jest.fn();
        mockTokenManager.verifyTokenStored = jest.fn();

        mockSDKClient.initialize = jest.fn().mockResolvedValue(undefined);
        mockSDKClient.ensureInitialized = jest.fn().mockResolvedValue(true);
        mockSDKClient.clear = jest.fn();

        mockOrgValidator.validateAndClearInvalidOrgContext = jest.fn().mockResolvedValue(undefined);
        mockOrgValidator.testDeveloperPermissions = jest.fn().mockResolvedValue({ hasPermissions: true });

        mockPerfTracker.startTiming = jest.fn();
        mockPerfTracker.endTiming = jest.fn();

        // Create mock entity service
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

        // Mock constructors to return our mocks
        (AuthCacheManager as jest.MockedClass<typeof AuthCacheManager>).mockImplementation(() => mockCacheManager);
        (TokenManager as jest.MockedClass<typeof TokenManager>).mockImplementation(() => mockTokenManager);
        (AdobeSDKClient as jest.MockedClass<typeof AdobeSDKClient>).mockImplementation(() => mockSDKClient);
        (OrganizationValidator as jest.MockedClass<typeof OrganizationValidator>).mockImplementation(() => mockOrgValidator);
        (PerformanceTracker as jest.MockedClass<typeof PerformanceTracker>).mockImplementation(() => mockPerfTracker);
        (AdobeEntityService as jest.MockedClass<typeof AdobeEntityService>).mockImplementation(() => mockEntityService);

        authService = new AuthenticationService('/mock/extension/path', mockLogger, mockCommandExecutor);
    });

    describe('initialization', () => {
        it('should create service with all dependencies', () => {
            expect(authService).toBeDefined();
            expect(AuthCacheManager).toHaveBeenCalled();
            expect(TokenManager).toHaveBeenCalledWith(mockCommandExecutor);
            expect(AdobeSDKClient).toHaveBeenCalledWith(mockLogger);
            expect(OrganizationValidator).toHaveBeenCalledWith(mockCommandExecutor, mockCacheManager, mockLogger);
        });
    });

    describe('isAuthenticatedQuick', () => {
        it('should return cached authentication status when available', async () => {
            mockCacheManager.getCachedAuthStatus.mockReturnValue({ isAuthenticated: true, isExpired: false });

            const result = await authService.isAuthenticatedQuick();

            expect(result).toBe(true);
            expect(mockTokenManager.isTokenValid).not.toHaveBeenCalled();
        });

        it('should check token when cache expired', async () => {
            mockCacheManager.getCachedAuthStatus.mockReturnValue({ isAuthenticated: undefined, isExpired: true });
            mockTokenManager.isTokenValid.mockResolvedValue(true);

            const result = await authService.isAuthenticatedQuick();

            expect(result).toBe(true);
            expect(mockTokenManager.isTokenValid).toHaveBeenCalled();
            expect(mockCacheManager.setCachedAuthStatus).toHaveBeenCalledWith(true);
        });

        it('should return false when token is invalid', async () => {
            mockCacheManager.getCachedAuthStatus.mockReturnValue({ isAuthenticated: undefined, isExpired: true });
            mockTokenManager.isTokenValid.mockResolvedValue(false);

            const result = await authService.isAuthenticatedQuick();

            expect(result).toBe(false);
            expect(mockCacheManager.setCachedAuthStatus).toHaveBeenCalledWith(false);
        });

        it('should handle errors gracefully', async () => {
            mockCacheManager.getCachedAuthStatus.mockReturnValue({ isAuthenticated: undefined, isExpired: true });
            mockTokenManager.isTokenValid.mockRejectedValue(new Error('Token check failed'));

            const result = await authService.isAuthenticatedQuick();

            expect(result).toBe(false);
            expect(mockCacheManager.setCachedAuthStatus).toHaveBeenCalledWith(false, expect.any(Number));
        });

        it('should track performance', async () => {
            mockCacheManager.getCachedAuthStatus.mockReturnValue({ isAuthenticated: true, isExpired: false });

            await authService.isAuthenticatedQuick();

            expect(mockPerfTracker.startTiming).toHaveBeenCalledWith('isAuthenticatedQuick');
            expect(mockPerfTracker.endTiming).toHaveBeenCalledWith('isAuthenticatedQuick');
        });
    });

    describe('isAuthenticated', () => {
        it('should return cached authentication status when available', async () => {
            mockCacheManager.getCachedAuthStatus.mockReturnValue({ isAuthenticated: true, isExpired: false });

            const result = await authService.isAuthenticated();

            expect(result).toBe(true);
            expect(mockTokenManager.isTokenValid).not.toHaveBeenCalled();
        });

        it('should validate token and org when cache expired', async () => {
            mockCacheManager.getCachedAuthStatus.mockReturnValue({ isAuthenticated: undefined, isExpired: true });
            mockTokenManager.isTokenValid.mockResolvedValue(true);

            const result = await authService.isAuthenticated();

            expect(result).toBe(true);
            expect(mockTokenManager.isTokenValid).toHaveBeenCalled();
            expect(mockOrgValidator.validateAndClearInvalidOrgContext).toHaveBeenCalled();
            expect(mockCacheManager.setCachedAuthStatus).toHaveBeenCalledWith(true);
        });

        it('should NOT initialize SDK (on-demand initialization)', async () => {
            mockCacheManager.getCachedAuthStatus.mockReturnValue({ isAuthenticated: undefined, isExpired: true });
            mockTokenManager.isTokenValid.mockResolvedValue(true);

            await authService.isAuthenticated();

            // SDK init is no longer done during isAuthenticated - it's on-demand
            expect(mockSDKClient.initialize).not.toHaveBeenCalled();
        });

        it('should return false when token is invalid', async () => {
            mockCacheManager.getCachedAuthStatus.mockReturnValue({ isAuthenticated: undefined, isExpired: true });
            mockTokenManager.isTokenValid.mockResolvedValue(false);

            const result = await authService.isAuthenticated();

            expect(result).toBe(false);
            expect(mockCacheManager.setCachedAuthStatus).toHaveBeenCalledWith(false);
        });

        it('should handle ENOENT errors with formatted message', async () => {
            mockCacheManager.getCachedAuthStatus.mockReturnValue({ isAuthenticated: undefined, isExpired: true });
            const error = new Error('ENOENT: no such file');
            mockTokenManager.isTokenValid.mockRejectedValue(error);

            const result = await authService.isAuthenticated();

            expect(result).toBe(false);
            // Error is formatted by AuthenticationErrorFormatter
            expect(mockLogger.error).toHaveBeenCalled();
            expect(mockCacheManager.setCachedAuthStatus).toHaveBeenCalled();
        });

        it('should handle timeout errors with formatted message', async () => {
            mockCacheManager.getCachedAuthStatus.mockReturnValue({ isAuthenticated: undefined, isExpired: true });
            const error = new Error('Operation timeout');
            mockTokenManager.isTokenValid.mockRejectedValue(error);

            const result = await authService.isAuthenticated();

            expect(result).toBe(false);
            // Error is formatted by AuthenticationErrorFormatter
            expect(mockLogger.error).toHaveBeenCalled();
            expect(mockCacheManager.setCachedAuthStatus).toHaveBeenCalled();
        });
    });

    describe('login', () => {
        it('should execute login command and trust CLI token storage', async () => {
            const token = 'x'.repeat(150);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: token,
                stderr: '',
            } as CommandResult);

            const result = await authService.login();

            expect(result).toBe(true);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio auth login',
                expect.objectContaining({ encoding: 'utf8' })
            );
            // No longer calls verifyTokenStored - trusts Adobe CLI exit code 0
            expect(mockCacheManager.clearAuthStatusCache).toHaveBeenCalled();
            expect(mockCacheManager.clearValidationCache).toHaveBeenCalled();
        });

        it('should clear cache and SDK when forced (no clearConsoleContext)', async () => {
            const token = 'x'.repeat(150);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: token,
                stderr: '',
            } as CommandResult);

            await authService.login(true);

            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio auth login -f',
                expect.any(Object)
            );
            // Should clear caches before login
            expect(mockCacheManager.clearAll).toHaveBeenCalled();
            expect(mockSDKClient.clear).toHaveBeenCalled();
            // No longer calls clearSessionCaches or clearConsoleContext (performance optimization)
        });

        it('should retry with force flag if token is invalid', async () => {
            const invalidToken = 'short';
            const validToken = 'x'.repeat(150);

            // First call: regular login returns invalid token
            // Second call: forced login returns valid token (no clearConsoleContext calls)
            mockCommandExecutor.executeAdobeCLI
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

            mockTokenManager.verifyTokenStored.mockResolvedValue(true);

            const result = await authService.login();

            expect(result).toBe(true);
            // Only 2 calls now (regular + forced) - no clearConsoleContext
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledTimes(2);
        });

        it('should handle login timeout with formatted error', async () => {
            const error = new Error('timeout');
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(error);

            const result = await authService.login();

            expect(result).toBe(false);
            // Error is formatted by AuthenticationErrorFormatter
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle permission errors with formatted error', async () => {
            const error = new Error('EACCES: permission denied');
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(error);

            const result = await authService.login();

            expect(result).toBe(false);
            // Error is formatted by AuthenticationErrorFormatter
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle network errors with formatted error', async () => {
            const error = new Error('ENETUNREACH: network unreachable');
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(error);

            const result = await authService.login();

            expect(result).toBe(false);
            // Error is formatted by AuthenticationErrorFormatter
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should NOT retry when CLI succeeds with valid token', async () => {
            const token = 'x'.repeat(150);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: token,
                stderr: '',
            } as CommandResult);

            const result = await authService.login();

            expect(result).toBe(true);
            // Should only call login once - trusts CLI exit code 0
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledTimes(1);
        });
    });

    describe('logout', () => {
        it('should execute logout command and clear caches', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: 'Logged out',
                stderr: '',
            } as CommandResult);

            await authService.logout();

            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio auth logout',
                expect.objectContaining({ encoding: 'utf8' })
            );
            expect(mockCacheManager.clearAll).toHaveBeenCalled();
            expect(mockSDKClient.clear).toHaveBeenCalled();
        });

        it('should propagate errors', async () => {
            const error = new Error('Logout failed');
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(error);

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

    describe('cache management', () => {
        it('should clear all caches', () => {
            authService.clearCache();

            expect(mockCacheManager.clearAll).toHaveBeenCalled();
        });

        it('should check if org was cleared', () => {
            mockCacheManager.wasOrgClearedDueToValidation.mockReturnValue(true);

            const result = authService.wasOrgClearedDueToValidation();

            expect(result).toBe(true);
        });

        it('should set org rejected flag', () => {
            authService.setOrgRejectedFlag();

            expect(mockCacheManager.setOrgClearedDueToValidation).toHaveBeenCalledWith(true);
        });
    });

    describe('SDK management', () => {
        it('should ensure SDK is initialized', async () => {
            mockSDKClient.ensureInitialized.mockResolvedValue(true);

            const result = await authService.ensureSDKInitialized();

            expect(result).toBe(true);
            expect(mockSDKClient.ensureInitialized).toHaveBeenCalled();
        });
    });

    describe('validation', () => {
        it('should validate and clear invalid org context', async () => {
            await authService.validateAndClearInvalidOrgContext();

            expect(mockOrgValidator.validateAndClearInvalidOrgContext).toHaveBeenCalledWith(false);
        });

        it('should validate with force flag', async () => {
            await authService.validateAndClearInvalidOrgContext(true);

            expect(mockOrgValidator.validateAndClearInvalidOrgContext).toHaveBeenCalledWith(true);
        });

        it('should test developer permissions', async () => {
            const result = await authService.testDeveloperPermissions();

            expect(result).toEqual({ hasPermissions: true });
            expect(mockOrgValidator.testDeveloperPermissions).toHaveBeenCalled();
        });
    });

    describe('performance tracking', () => {
        it('should track performance for all major operations', async () => {
            mockCacheManager.getCachedAuthStatus.mockReturnValue({ isAuthenticated: undefined, isExpired: true });
            mockTokenManager.isTokenValid.mockResolvedValue(true);

            await authService.isAuthenticated();
            await authService.getOrganizations();
            await authService.selectOrganization('org123');

            expect(mockPerfTracker.startTiming).toHaveBeenCalledWith('isAuthenticated');
            expect(mockPerfTracker.startTiming).toHaveBeenCalledWith('getOrganizations');
            expect(mockPerfTracker.startTiming).toHaveBeenCalledWith('selectOrganization');

            expect(mockPerfTracker.endTiming).toHaveBeenCalledWith('isAuthenticated');
            expect(mockPerfTracker.endTiming).toHaveBeenCalledWith('getOrganizations');
            expect(mockPerfTracker.endTiming).toHaveBeenCalledWith('selectOrganization');
        });
    });
});
