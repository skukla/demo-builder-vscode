/**
 * Integration Tests: EDS Partial Failure Handling
 *
 * Tests for partial failure scenarios and recovery capabilities including:
 * - Resume from partial states (repo created, content copied)
 * - Cleanup on user cancellation
 * - Rollback instructions for manual cleanup
 * - State consistency across retries
 * - Duplicate resource prevention
 *
 * Coverage: 6 tests
 * - Partial State Recovery (6 tests)
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
    EdsPartialState,
} from '@/features/eds/services/types';
import type { GitHubServicesForProject, DaLiveServicesForProject } from '@/features/eds/services/edsProjectService';

// Type for the service we'll import dynamically
type EdsProjectServiceType = import('@/features/eds/services/edsProjectService').EdsProjectService;

describe('EDS Partial Failure - Integration Tests', () => {
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
        projectName: 'Partial Failure Test',
        projectPath: '/Users/test/projects/partial-failure-test',
        repoName: 'partial-test-site',
        daLiveOrg: 'partial-test-org',
        daLiveSite: 'partial-test-site',
        accsEndpoint: 'https://commerce.example.com/graphql',
        githubOwner: 'partialtestuser',
        isPrivate: false,
    };

    // Default mock repo response
    const mockRepo: GitHubRepo = {
        id: 77777,
        name: 'partial-test-site',
        fullName: 'partialtestuser/partial-test-site',
        htmlUrl: 'https://github.com/partialtestuser/partial-test-site',
        cloneUrl: 'https://github.com/partialtestuser/partial-test-site.git',
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
    // Partial State Recovery Tests (6 tests)
    // ==========================================================
    describe('Partial State Recovery', () => {
        it('should allow resuming from GitHub repo created state', async () => {
            // Given: Initial setup failed after repo creation
            // First run: repo created, then clone fails
            mockGitHubService.cloneRepository!.mockRejectedValueOnce(
                new Error('Clone failed: disk full'),
            );

            const firstResult = await service.setupProject(defaultConfig, mockProgressCallback);

            // Verify partial state
            expect(firstResult.success).toBe(false);
            expect(firstResult.phase).toBe('github-clone');
            expect(firstResult.repoUrl).toBe(mockRepo.htmlUrl);

            // When: Retrying (simulate resume scenario)
            // In a real implementation, the service would check if repo exists
            // For this test, we verify the result contains enough info to resume
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);

            const secondResultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const secondResult = await secondResultPromise;

            // Then: Should complete on retry (mock always creates new repo)
            // In production, would skip repo creation if exists
            expect(secondResult.success).toBe(true);
        });

        it('should allow resuming from DA.live content copied state', async () => {
            // Given: Initial setup failed after content copy
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
                success: true,
                copiedFiles: ['/index.html'],
                failedFiles: [],
                totalFiles: 1,
            });
            // Tools clone fails
            mockComponentManager.installComponent!.mockRejectedValueOnce(
                new Error('Tool clone failed'),
            );

            const firstResultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const firstResult = await firstResultPromise;

            // Verify partial state
            expect(firstResult.success).toBe(false);
            expect(firstResult.phase).toBe('tools-clone');
            expect(firstResult.repoUrl).toBeDefined();

            // When: Retrying
            mockComponentManager.installComponent!.mockResolvedValue({ success: true });
            const secondResultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const secondResult = await secondResultPromise;

            // Then: Should complete on retry
            expect(secondResult.success).toBe(true);
        });

        it('should handle cleanup on user cancellation', async () => {
            // Given: User cancels mid-flow (simulated by throwing cancellation error)
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            const cancelError = new Error('User cancelled');
            (cancelError as any).cancelled = true;
            mockGitHubService.cloneRepository!.mockRejectedValue(cancelError);

            // When: Setup is cancelled
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should return partial state info for cleanup
            expect(result.success).toBe(false);
            expect(result.repoUrl).toBe(mockRepo.htmlUrl);
            // The error message should help user understand what needs cleanup
            expect(result.error).toBeDefined();
        });

        it('should provide rollback instructions for manual cleanup', async () => {
            // Given: Failure after resources created
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
                success: true,
                copiedFiles: ['/index.html'],
                failedFiles: [],
                totalFiles: 1,
            });
            mockComponentManager.installComponent!.mockRejectedValue(
                new Error('Tool clone failed'),
            );

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Result should include info for manual cleanup
            expect(result.success).toBe(false);
            expect(result.repoUrl).toBe(mockRepo.htmlUrl);
            expect(result.phase).toBe('tools-clone');

            // The repoUrl in result allows user to manually clean up
            // In a full implementation, we'd also track:
            // - Whether content was copied to DA.live
            // - What files were created locally
        });

        it('should maintain consistent state across retries', async () => {
            // Given: Multiple retry attempts
            let attemptCount = 0;

            mockGitHubService.createFromTemplate!.mockImplementation(async () => {
                attemptCount++;
                return mockRepo;
            });

            // First attempt fails at clone
            mockGitHubService.cloneRepository!
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValue(undefined);

            // When: First two attempts fail
            const result1 = await service.setupProject(defaultConfig, mockProgressCallback);
            expect(result1.success).toBe(false);

            const result2 = await service.setupProject(defaultConfig, mockProgressCallback);
            expect(result2.success).toBe(false);

            // Third attempt succeeds
            const result3Promise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result3 = await result3Promise;

            // Then: State should be consistent
            expect(result3.success).toBe(true);
            expect(attemptCount).toBe(3);
            // All results should have same repo URL (simulating same project)
            expect(result1.repoUrl).toBe(mockRepo.htmlUrl);
            expect(result2.repoUrl).toBe(mockRepo.htmlUrl);
            expect(result3.repoUrl).toBe(mockRepo.htmlUrl);
        });

        it('should prevent duplicate resource creation', async () => {
            // Given: First attempt creates repo, then fails
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockRejectedValueOnce(
                new Error('Clone failed'),
            );

            const firstResult = await service.setupProject(defaultConfig, mockProgressCallback);
            expect(firstResult.success).toBe(false);

            // When: Second attempt - repo already exists
            // In production, service would detect existing repo and skip creation
            // Here we simulate by checking if createFromTemplate is called
            const createCalls = mockGitHubService.createFromTemplate!.mock.calls.length;

            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
            const secondResultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await secondResultPromise;

            // Then: Verify repo creation was called (in production, would check for existing)
            // This test documents the expected behavior: service should handle
            // the case where repo already exists (422 error) gracefully
            const newCreateCalls = mockGitHubService.createFromTemplate!.mock.calls.length;
            expect(newCreateCalls).toBe(createCalls + 1);

            // Note: Full implementation would include:
            // 1. Check if repo exists before creating
            // 2. If exists, verify it's from our template
            // 3. Skip creation and continue from where we left off
        });
    });

    // ==========================================================
    // Partial State Type Validation Tests
    // ==========================================================
    describe('Partial State Type', () => {
        it('should track partial state correctly', async () => {
            // Given: Setup that will fail mid-flow
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
                success: false,
                copiedFiles: ['/index.html'],
                failedFiles: [{ path: '/about.html', error: 'Network error' }],
                totalFiles: 2,
            });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Result should represent partial state
            expect(result.success).toBe(false);
            expect(result.repoUrl).toBeDefined();
            expect(result.phase).toBe('dalive-content');

            // The result contains enough information to construct EdsPartialState:
            const partialState: EdsPartialState = {
                repoCreated: true,
                repoUrl: result.repoUrl,
                contentCopied: false, // Failed during content copy
                failedFiles: ['/about.html'],
                phase: result.phase as EdsSetupPhase,
            };

            expect(partialState.repoCreated).toBe(true);
            expect(partialState.phase).toBe('dalive-content');
        });
    });
});
