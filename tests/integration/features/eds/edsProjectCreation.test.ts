/**
 * Integration Tests: EDS Project Creation
 *
 * Tests for the complete EDS project creation workflow including:
 * - Full workflow orchestration (all phases)
 * - Service coordination (GitHub -> DA.live -> Helix -> .env)
 * - Progress reporting with phase callbacks
 * - Component selection with EDS frontend
 * - API Mesh step skipping for EDS projects
 *
 * Coverage: 8 tests across 2 categories
 * - Complete Workflow Tests (5 tests)
 * - Service Coordination Tests (3 tests)
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
    EdsProgressCallback,
    EdsSetupPhase,
} from '@/features/eds/services/types';
import type { GitHubServicesForProject, DaLiveServicesForProject } from '@/features/eds/services/edsProjectService';

// Type for the service we'll import dynamically
type EdsProjectServiceType = import('@/features/eds/services/edsProjectService').EdsProjectService;

describe('EDS Project Creation - Integration Tests', () => {
    let service: EdsProjectServiceType;
    let mockGitHubTokenService: jest.Mocked<Partial<GitHubTokenService>>;
    let mockGitHubRepoOps: jest.Mocked<Partial<GitHubRepoOperations>>;
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
        projectName: 'Integration Test Project',
        projectPath: '/Users/test/projects/integration-test',
        repoName: 'integration-test-site',
        daLiveOrg: 'integration-test-org',
        daLiveSite: 'integration-test-site',
        accsEndpoint: 'https://commerce.example.com/graphql',
        githubOwner: 'integrationtestuser',
        isPrivate: false,
    };

    // Default mock repo response
    const mockRepo: GitHubRepo = {
        id: 99999,
        name: 'integration-test-site',
        fullName: 'integrationtestuser/integration-test-site',
        htmlUrl: 'https://github.com/integrationtestuser/integration-test-site',
        cloneUrl: 'https://github.com/integrationtestuser/integration-test-site.git',
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

        // Mock GitHubRepoOperations
        mockGitHubRepoOps = {
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
                copiedFiles: ['/index.html', '/about.html', '/products.html'],
                failedFiles: [],
                totalFiles: 3,
            }),
            listDirectory: jest.fn(),
        };

        // Mock AuthenticationService with TokenManager
        const mockTokenManager = {
            getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
        };
        mockAuthService = {
            getTokenManager: jest.fn().mockReturnValue(mockTokenManager),
            isAuthenticated: jest.fn().mockResolvedValue(true),
        };

        // Mock ComponentManager
        mockComponentManager = {
            installComponent: jest.fn().mockResolvedValue({
                success: true,
                component: { id: 'commerce-demo-ingestion', name: 'Ingestion Tool', status: 'ready' },
            }),
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
            repoOperations: mockGitHubRepoOps as unknown as GitHubRepoOperations,
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
    // Complete Workflow Tests (5 tests)
    // ==========================================================
    describe('Complete Workflow', () => {
        it('should complete full EDS project creation workflow', async () => {
            // Given: All services are properly configured
            // When: Running the complete setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should complete successfully with all URLs
            expect(result.success).toBe(true);
            expect(result.repoUrl).toBe(mockRepo.htmlUrl);
            expect(result.previewUrl).toContain('aem.page');
            expect(result.liveUrl).toContain('aem.live');
        });

        it('should orchestrate services in correct order', async () => {
            // Given: All services configured to succeed
            const callOrder: string[] = [];

            mockGitHubRepoOps.createFromTemplate!.mockImplementation(async () => {
                callOrder.push('github-createFromTemplate');
                return mockRepo;
            });
            mockGitHubRepoOps.cloneRepository!.mockImplementation(async () => {
                callOrder.push('github-cloneRepository');
            });
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('admin.hlx.page/config')) {
                    callOrder.push('helix-config');
                } else if (url.includes('admin.hlx.page/code')) {
                    callOrder.push('helix-codeSync');
                }
                return { ok: true, status: 200 };
            });
            mockDaLiveContentOps.copyCitisignalContent!.mockImplementation(async () => {
                callOrder.push('dalive-copyContent');
                return { success: true, copiedFiles: [], failedFiles: [], totalFiles: 0 };
            });
            mockComponentManager.installComponent!.mockImplementation(async () => {
                callOrder.push('tools-install');
                return { success: true };
            });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Services should be called in correct order
            // Note: helix-config appears twice (POST config + verification GET)
            expect(callOrder).toEqual([
                'github-createFromTemplate',
                'github-cloneRepository',
                'helix-config',
                'helix-config', // verification GET
                'helix-codeSync',
                'dalive-copyContent',
                'tools-install',
            ]);
        });

        it('should report progress through all phases', async () => {
            // Given: Valid configuration
            const phasesReported: EdsSetupPhase[] = [];
            const trackingCallback: EdsProgressCallback = (phase) => {
                if (!phasesReported.includes(phase)) {
                    phasesReported.push(phase);
                }
            };

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, trackingCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: All phases should be reported
            expect(phasesReported).toContain('github-repo');
            expect(phasesReported).toContain('github-clone');
            expect(phasesReported).toContain('helix-config');
            expect(phasesReported).toContain('code-sync');
            expect(phasesReported).toContain('dalive-content');
            expect(phasesReported).toContain('tools-clone');
            expect(phasesReported).toContain('env-config');
            expect(phasesReported).toContain('complete');
        });

        it('should handle component selection with EDS frontend', async () => {
            // Given: EDS project with frontend component selection
            // This tests that the setup works with the EDS frontend choice
            // (the component manager handles the correct template)

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should complete and use EDS-specific repo
            expect(result.success).toBe(true);
            expect(mockGitHubRepoOps.createFromTemplate).toHaveBeenCalledWith(
                'skukla', // template owner
                'citisignal-one', // EDS template
                expect.any(String),
                expect.any(Boolean),
            );
        });

        it('should skip API Mesh step for EDS projects', async () => {
            // Given: EDS project setup (API Mesh is not part of EDS workflow)

            // When: Running setup
            const phasesReported: EdsSetupPhase[] = [];
            const trackingCallback: EdsProgressCallback = (phase) => {
                if (!phasesReported.includes(phase)) {
                    phasesReported.push(phase);
                }
            };

            const resultPromise = service.setupProject(defaultConfig, trackingCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: API Mesh phase should NOT be in the workflow
            // EDS uses Helix configuration instead
            expect(phasesReported).not.toContain('api-mesh');
            expect(phasesReported).toContain('helix-config');
        });
    });

    // ==========================================================
    // Service Coordination Tests (3 tests)
    // ==========================================================
    describe('Service Coordination', () => {
        it('should pass GitHub repo info to DA.live service', async () => {
            // Given: GitHub repo created successfully
            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: DA.live should be called with correct org/site from config
            expect(mockDaLiveContentOps.copyCitisignalContent).toHaveBeenCalledWith(
                defaultConfig.daLiveOrg,
                defaultConfig.daLiveSite,
                expect.any(Function), // progress callback
            );
        });

        it('should pass DA.live site info to Helix config', async () => {
            // Given: Valid configuration
            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Helix config should include DA.live mountpoint
            const helixConfigCall = mockFetch.mock.calls.find(
                (call) => call[0].includes('admin.hlx.page/config'),
            );
            expect(helixConfigCall).toBeDefined();
            const body = JSON.parse(helixConfigCall![1].body);
            expect(body.mountpoints['/']).toContain(defaultConfig.daLiveOrg);
            expect(body.mountpoints['/']).toContain(defaultConfig.daLiveSite);
        });

        it('should configure .env with all service endpoints', async () => {
            // Given: All services complete successfully
            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: .env should contain all service endpoints
            const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
                (call) => call[0].includes('.env'),
            );
            expect(writeCall).toBeDefined();
            const envContent = writeCall[1];

            // Check ACCS endpoint
            expect(envContent).toContain('ACCS_ENDPOINT');
            expect(envContent).toContain(defaultConfig.accsEndpoint);

            // Check DA.live configuration
            expect(envContent).toContain('DA_LIVE_ORG');
            expect(envContent).toContain(defaultConfig.daLiveOrg);
            expect(envContent).toContain('DA_LIVE_SITE');
            expect(envContent).toContain(defaultConfig.daLiveSite);

            // Check GitHub info
            expect(envContent).toContain('GITHUB_OWNER');
            expect(envContent).toContain(defaultConfig.githubOwner);
            expect(envContent).toContain('REPO_URL');
            expect(envContent).toContain(mockRepo.htmlUrl);

            // Check Helix URLs
            expect(envContent).toContain('PREVIEW_URL');
            expect(envContent).toContain('LIVE_URL');
        });
    });
});
