/**
 * Integration Tests: EDS Error Recovery
 *
 * Tests for error recovery scenarios in EDS project creation including:
 * - GitHub failures (OAuth cancellation, name conflict, token expiration, rate limiting)
 * - DA.live failures (access denied, API timeout, content copy failure)
 * - Helix failures (service unavailable, code sync timeout)
 *
 * Coverage: 9 tests across 3 categories
 * - GitHub Failures (4 tests)
 * - DA.live Failures (3 tests)
 * - Helix Failures (2 tests)
 */

import * as fs from 'fs/promises';

// Mock vscode module
jest.mock('vscode');

// Mock fs/promises
jest.mock('fs/promises');

// Mock logging
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
};
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => mockLogger),
    Logger: jest.fn(() => mockLogger),
}));

// Mock timeout config - uses semantic categories
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000, // Standard API calls
        LONG: 180000, // Complex operations
        POLL: {
            INITIAL: 500,
            MAX: 5000,
            INTERVAL: 1000,
            PROCESS_CHECK: 100,
        },
    },
}));

// Import types
import type { GitHubTokenService } from '@/features/eds/services/githubTokenService';
import type { GitHubRepoOperations } from '@/features/eds/services/githubRepoOperations';
import type { DaLiveOrgOperations } from '@/features/eds/services/daLiveOrgOperations';
import type { DaLiveContentOperations } from '@/features/eds/services/daLiveContentOperations';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { ComponentManager } from '@/features/components/services/componentManager';
import type { GitHubRepo } from '@/features/eds/services/types';
import type {
    EdsProjectConfig,
    EdsSetupPhase,
} from '@/features/eds/services/types';
import type { GitHubServicesForProject, DaLiveServicesForProject } from '@/features/eds/services/edsProjectService';

// Import error formatters (to be created)
import {
    formatGitHubError,
    formatDaLiveError,
    formatHelixError,
} from '@/features/eds/services/errorFormatters';

// Type for the service we'll import dynamically
type EdsProjectServiceType = import('@/features/eds/services/edsProjectService').EdsProjectService;

describe('EDS Error Recovery - Integration Tests', () => {
    let service: EdsProjectServiceType;
    let mockGitHubTokenService: jest.Mocked<Partial<GitHubTokenService>>;
    let mockGitHubService: jest.Mocked<Partial<GitHubRepoOperations>>;
    let mockDaLiveOrgOps: jest.Mocked<Partial<DaLiveOrgOperations>>;
    let mockDaLiveContentOps: jest.Mocked<Partial<DaLiveContentOperations>>;
    let mockAuthService: jest.Mocked<Partial<AuthenticationService>>;
    let mockComponentManager: jest.Mocked<Partial<ComponentManager>>;
    let mockFetch: jest.Mock;
    let mockProgressCallback: jest.Mock<void, [EdsSetupPhase, number, string]>;

    // Store original fetch
    const originalFetch = global.fetch;

    // Default test config
    const defaultConfig: EdsProjectConfig = {
        projectName: 'Error Recovery Test',
        projectPath: '/Users/test/projects/error-recovery-test',
        repoName: 'error-recovery-site',
        daLiveOrg: 'error-test-org',
        daLiveSite: 'error-test-site',
        accsEndpoint: 'https://commerce.example.com/graphql',
        githubOwner: 'errortestuser',
        isPrivate: false,
    };

    // Default mock repo response
    const mockRepo: GitHubRepo = {
        id: 88888,
        name: 'error-recovery-site',
        fullName: 'errortestuser/error-recovery-site',
        htmlUrl: 'https://github.com/errortestuser/error-recovery-site',
        cloneUrl: 'https://github.com/errortestuser/error-recovery-site.git',
        defaultBranch: 'main',
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Mock GitHubTokenService
        mockGitHubTokenService = {
            getToken: jest.fn(),
            validateToken: jest.fn(),
        };

        // Mock GitHubRepoOperations (named mockGitHubService for minimal test changes)
        mockGitHubService = {
            createFromTemplate: jest.fn().mockResolvedValue(mockRepo),
            cloneRepository: jest.fn().mockResolvedValue(undefined),
            getRepository: jest.fn(),
            deleteRepository: jest.fn(),
        };

        // Mock DaLiveOrgOperations
        mockDaLiveOrgOps = {
            deleteSite: jest.fn(),
            verifyOrgAccess: jest.fn().mockResolvedValue({
                hasAccess: true,
                orgName: defaultConfig.daLiveOrg,
            }),
        };

        // Mock DaLiveContentOperations
        mockDaLiveContentOps = {
            copyCitisignalContent: jest.fn().mockResolvedValue({
                success: true,
                copiedFiles: ['/index.html'],
                failedFiles: [],
                totalFiles: 1,
            }),
            listDirectory: jest.fn(),
        };

        // Mock AuthenticationService
        const mockTokenManager = {
            getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
        };
        mockAuthService = {
            getTokenManager: jest.fn().mockReturnValue(mockTokenManager),
            isAuthenticated: jest.fn().mockResolvedValue(true),
        };

        // Mock ComponentManager
        mockComponentManager = {
            installComponent: jest.fn().mockResolvedValue({ success: true }),
        };

        // Mock global fetch - successful by default
        mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
        global.fetch = mockFetch;

        // Mock fs/promises
        (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
        (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
        // Clone verification needs package.json and scripts/aem.js to exist
        // .env check should fail (ENOENT) to trigger env generation
        (fs.access as jest.Mock).mockImplementation(async (filePath: string) => {
            if (filePath.includes('package.json') || filePath.includes('scripts/aem.js')) {
                return undefined; // File exists (clone verification passes)
            }
            throw new Error('ENOENT'); // .env doesn't exist (triggers generation)
        });

        // Progress callback
        mockProgressCallback = jest.fn();

        // Create service interface objects
        const githubServices: GitHubServicesForProject = {
            tokenService: mockGitHubTokenService as unknown as GitHubTokenService,
            repoOperations: mockGitHubService as unknown as GitHubRepoOperations,
        };

        const daLiveServices: DaLiveServicesForProject = {
            orgOperations: mockDaLiveOrgOps as unknown as DaLiveOrgOperations,
            contentOperations: mockDaLiveContentOps as unknown as DaLiveContentOperations,
        };

        // Dynamically import to get fresh instance after mocks are set up
        const module = await import('@/features/eds/services/edsProjectService');
        service = new module.EdsProjectService(
            githubServices,
            daLiveServices,
            mockAuthService as unknown as AuthenticationService,
            mockComponentManager as unknown as ComponentManager,
        );
    });

    afterEach(() => {
        jest.useRealTimers();
        global.fetch = originalFetch;
    });

    // ==========================================================
    // GitHub Failures (4 tests)
    // ==========================================================
    describe('GitHub Failures', () => {
        it('should handle GitHub OAuth cancellation gracefully', async () => {
            // Given: User cancels OAuth flow
            const oauthCancelledError = new Error('OAuth flow cancelled');
            (oauthCancelledError as any).code = 'OAUTH_CANCELLED';
            mockGitHubService.createFromTemplate!.mockRejectedValue(oauthCancelledError);

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail with user-friendly message
            expect(result.success).toBe(false);
            expect(result.phase).toBe('github-repo');

            // Verify error formatting produces user-friendly message
            const formattedError = formatGitHubError(oauthCancelledError);
            expect(formattedError.userMessage).not.toContain('OAuth');
            expect(formattedError.userMessage).toMatch(/sign in|authenticate|cancel/i);
        });

        it('should handle GitHub repo name conflict', async () => {
            // Given: Repository name already exists
            const repoExistsError = new Error('Repository name already exists');
            (repoExistsError as any).code = 'REPO_EXISTS';
            (repoExistsError as any).status = 422;
            mockGitHubService.createFromTemplate!.mockRejectedValue(repoExistsError);

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail with helpful recovery hint
            expect(result.success).toBe(false);
            expect(result.phase).toBe('github-repo');

            const formattedError = formatGitHubError(repoExistsError);
            expect(formattedError.code).toBe('REPO_EXISTS');
            expect(formattedError.userMessage).toMatch(/already exists|different name/i);
            expect(formattedError.recoveryHint).toBeDefined();
        });

        it('should handle GitHub token expiration mid-flow', async () => {
            // Given: Token expires after repo creation
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);

            const tokenExpiredError = new Error('Bad credentials');
            (tokenExpiredError as any).code = 'AUTH_EXPIRED';
            (tokenExpiredError as any).status = 401;
            mockGitHubService.cloneRepository!.mockRejectedValue(tokenExpiredError);

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail with re-authentication hint
            expect(result.success).toBe(false);
            expect(result.phase).toBe('github-clone');
            expect(result.repoUrl).toBe(mockRepo.htmlUrl); // Repo was created before failure

            const formattedError = formatGitHubError(tokenExpiredError);
            expect(formattedError.code).toBe('AUTH_EXPIRED');
            expect(formattedError.userMessage).toMatch(/sign in again|session expired/i);
        });

        it('should handle GitHub rate limiting', async () => {
            // Given: Rate limit exceeded
            const rateLimitError = new Error('API rate limit exceeded');
            (rateLimitError as any).code = 'RATE_LIMITED';
            (rateLimitError as any).status = 403;
            (rateLimitError as any).headers = {
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
            };
            mockGitHubService.createFromTemplate!.mockRejectedValue(rateLimitError);

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail with rate limit info
            expect(result.success).toBe(false);
            expect(result.phase).toBe('github-repo');

            const formattedError = formatGitHubError(rateLimitError);
            expect(formattedError.code).toBe('RATE_LIMITED');
            expect(formattedError.userMessage).toMatch(/too many requests|try again later/i);
            expect(formattedError.recoveryHint).toMatch(/wait|minute/i);
        });
    });

    // ==========================================================
    // DA.live Failures (3 tests)
    // ==========================================================
    describe('DA.live Failures', () => {
        beforeEach(() => {
            // Setup so we get past GitHub phases
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({ ok: true, status: 200 }); // Helix succeeds
        });

        it('should handle DA.live organization access denied', async () => {
            // Given: User doesn't have org access
            const accessDeniedError = new Error('Organization access denied');
            (accessDeniedError as any).code = 'ACCESS_DENIED';
            (accessDeniedError as any).statusCode = 403;
            mockDaLiveContentOps.copyCitisignalContent!.mockRejectedValue(accessDeniedError);

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should fail with access hint
            expect(result.success).toBe(false);
            expect(result.phase).toBe('dalive-content');

            const formattedError = formatDaLiveError(accessDeniedError);
            expect(formattedError.code).toBe('ACCESS_DENIED');
            expect(formattedError.userMessage).toMatch(/permission|access/i);
            expect(formattedError.recoveryHint).toMatch(/administrator|request access/i);
        });

        it('should handle DA.live API timeout', async () => {
            // Given: DA.live API times out
            const timeoutError = new Error('The operation was aborted');
            (timeoutError as any).code = 'NETWORK_ERROR';
            (timeoutError as any).name = 'AbortError';
            mockDaLiveContentOps.copyCitisignalContent!.mockRejectedValue(timeoutError);

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should fail with retry suggestion
            expect(result.success).toBe(false);
            expect(result.phase).toBe('dalive-content');

            const formattedError = formatDaLiveError(timeoutError);
            expect(formattedError.code).toBe('NETWORK_ERROR');
            expect(formattedError.userMessage).toMatch(/connection|network|timeout/i);
            expect(formattedError.recoveryHint).toMatch(/try again|check.*connection/i);
        });

        it('should handle DA.live content copy failure for single file', async () => {
            // Given: Single file fails to copy
            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
                success: false,
                copiedFiles: ['/index.html', '/about.html'],
                failedFiles: [{ path: '/products.html', error: 'Network timeout' }],
                totalFiles: 3,
            });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should fail with specific file info
            expect(result.success).toBe(false);
            expect(result.phase).toBe('dalive-content');
            expect(result.error).toContain('failed');
        });
    });

    // ==========================================================
    // Helix Failures (2 tests)
    // ==========================================================
    describe('Helix Failures', () => {
        beforeEach(() => {
            // Setup so we get past GitHub phases
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
        });

        it('should handle Helix config service unavailable', async () => {
            // Given: Helix config service returns 503
            const serviceUnavailableError = new Error('Service temporarily unavailable');
            (serviceUnavailableError as any).code = 'SERVICE_UNAVAILABLE';
            (serviceUnavailableError as any).status = 503;

            mockFetch.mockResolvedValue({
                ok: false,
                status: 503,
                statusText: 'Service Unavailable',
            });

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail with retry suggestion
            expect(result.success).toBe(false);
            expect(result.phase).toBe('helix-config');

            const formattedError = formatHelixError(serviceUnavailableError);
            expect(formattedError.code).toBe('SERVICE_UNAVAILABLE');
            expect(formattedError.userMessage).toMatch(/service.*unavailable|temporarily/i);
            expect(formattedError.recoveryHint).toMatch(/try again|few minutes/i);
        });

        it('should handle Code Sync verification timeout with GitHub App check', async () => {
            // Given: Code sync never completes (GitHub App not installed)
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200 }) // helix config POST
                .mockResolvedValueOnce({ ok: true, status: 200 }) // helix config verification GET
                .mockResolvedValue({ ok: false, status: 404 }); // code sync always 404 + app install check

            // When: Running setup (will timeout and check app installation)
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.advanceTimersByTimeAsync(130000); // Past max attempts
            const result = await resultPromise;

            // Then: Should fail with GitHub App not installed error
            expect(result.success).toBe(false);
            expect(result.phase).toBe('code-sync');
            // Now throws GitHubAppNotInstalledError when app is not installed
            expect(result.error).toContain('GitHub App not installed');
        });
    });
});
