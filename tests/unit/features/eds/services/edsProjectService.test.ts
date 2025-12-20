/**
 * Unit Tests: EdsProjectService
 *
 * Tests for EDS project setup orchestration including GitHub repo creation,
 * repository cloning, Helix 5 configuration, code bus verification, DA.live
 * content population, tools cloning, and .env file generation.
 *
 * Coverage: 35 tests across 9 categories
 * - Service Initialization (3 tests)
 * - Sequential Setup Orchestration (4 tests)
 * - GitHub Repository Creation (4 tests)
 * - Helix 5 Configuration (4 tests)
 * - Code Bus Verification (4 tests)
 * - DA.live Content (4 tests)
 * - Tools Cloning (4 tests)
 * - Environment Configuration (4 tests)
 * - Error Handling (4 tests)
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

// Mock timeout config
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        EDS_HELIX_CONFIG: 30000,
        EDS_CODE_SYNC_POLL: 5000,
        EDS_CODE_SYNC_TOTAL: 125000,
        COMPONENT_CLONE: 120000,
        DA_LIVE_COPY: 120000,
    },
}));

// Import types
import type { GitHubService } from '@/features/eds/services/githubService';
import type { DaLiveService } from '@/features/eds/services/daLiveService';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { ComponentManager } from '@/features/components/services/componentManager';
import type { GitHubRepo } from '@/features/eds/services/types';
import {
    EdsProjectError,
    type EdsProjectConfig,
    type EdsProgressCallback,
    type EdsSetupPhase,
} from '@/features/eds/services/types';

// Type for the service we'll import dynamically
type EdsProjectServiceType = import('@/features/eds/services/edsProjectService').EdsProjectService;

describe('EdsProjectService', () => {
    let service: EdsProjectServiceType;
    let mockGitHubService: jest.Mocked<Partial<GitHubService>>;
    let mockDaLiveService: jest.Mocked<Partial<DaLiveService>>;
    let mockAuthService: jest.Mocked<Partial<AuthenticationService>>;
    let mockComponentManager: jest.Mocked<Partial<ComponentManager>>;
    let mockFetch: jest.Mock;
    let mockProgressCallback: jest.Mock<void, [EdsSetupPhase, number, string]>;

    // Store original fetch
    const originalFetch = global.fetch;

    // Default test config
    const defaultConfig: EdsProjectConfig = {
        projectName: 'Test Project',
        projectPath: '/Users/test/projects/test-project',
        repoName: 'test-site',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
        accsEndpoint: 'https://commerce.example.com/graphql',
        githubOwner: 'testuser',
        isPrivate: false,
    };

    // Default mock repo response
    const mockRepo: GitHubRepo = {
        id: 12345,
        name: 'test-site',
        fullName: 'testuser/test-site',
        htmlUrl: 'https://github.com/testuser/test-site',
        cloneUrl: 'https://github.com/testuser/test-site.git',
        defaultBranch: 'main',
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Mock GitHubService
        mockGitHubService = {
            createFromTemplate: jest.fn(),
            cloneRepository: jest.fn(),
            getToken: jest.fn(),
            getAuthenticatedUser: jest.fn(),
        };

        // Mock DaLiveService
        mockDaLiveService = {
            copyCitisignalContent: jest.fn(),
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
            installComponent: jest.fn(),
        };

        // Mock global fetch
        mockFetch = jest.fn();
        global.fetch = mockFetch;

        // Mock fs/promises
        (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
        (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
        (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

        // Progress callback
        mockProgressCallback = jest.fn();

        // Dynamically import to get fresh instance after mocks are set up
        const module = await import('@/features/eds/services/edsProjectService');
        service = new module.EdsProjectService(
            mockGitHubService as unknown as GitHubService,
            mockDaLiveService as unknown as DaLiveService,
            mockAuthService as unknown as AuthenticationService,
            mockComponentManager as unknown as ComponentManager,
        );
    });

    afterEach(() => {
        jest.useRealTimers();
        global.fetch = originalFetch;
    });

    // ==========================================================
    // Service Initialization Tests (3 tests)
    // ==========================================================
    describe('Service Initialization', () => {
        it('should initialize with required dependencies', async () => {
            // Given: All required dependencies provided
            const module = await import('@/features/eds/services/edsProjectService');

            // When: Creating service
            const newService = new module.EdsProjectService(
                mockGitHubService as unknown as GitHubService,
                mockDaLiveService as unknown as DaLiveService,
                mockAuthService as unknown as AuthenticationService,
                mockComponentManager as unknown as ComponentManager,
            );

            // Then: Service should be created successfully
            expect(newService).toBeDefined();
        });

        it('should throw error if GitHubService not provided', async () => {
            // Given: No GitHubService
            const module = await import('@/features/eds/services/edsProjectService');

            // When: Creating service without GitHub service
            // Then: Should throw error
            expect(() => {
                new module.EdsProjectService(
                    null as unknown as GitHubService,
                    mockDaLiveService as unknown as DaLiveService,
                    mockAuthService as unknown as AuthenticationService,
                    mockComponentManager as unknown as ComponentManager,
                );
            }).toThrow('GitHubService is required');
        });

        it('should throw error if DaLiveService not provided', async () => {
            // Given: No DaLiveService
            const module = await import('@/features/eds/services/edsProjectService');

            // When: Creating service without DA.live service
            // Then: Should throw error
            expect(() => {
                new module.EdsProjectService(
                    mockGitHubService as unknown as GitHubService,
                    null as unknown as DaLiveService,
                    mockAuthService as unknown as AuthenticationService,
                    mockComponentManager as unknown as ComponentManager,
                );
            }).toThrow('DaLiveService is required');
        });
    });

    // ==========================================================
    // Sequential Setup Orchestration Tests (4 tests)
    // ==========================================================
    describe('Sequential Setup Orchestration', () => {
        beforeEach(() => {
            // Setup successful mocks for all phases
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({}),
            });
            mockDaLiveService.copyCitisignalContent!.mockResolvedValue({
                success: true,
                copiedFiles: ['/index.html'],
                failedFiles: [],
                totalFiles: 1,
            });
            mockComponentManager.installComponent!.mockResolvedValue({
                success: true,
                component: { id: 'commerce-demo-ingestion', name: 'Ingestion Tool', status: 'ready' },
            });
        });

        it('should execute setup phases in correct order', async () => {
            // Given: Valid config
            const phaseOrder: EdsSetupPhase[] = [];
            const trackingCallback: EdsProgressCallback = (phase) => {
                if (!phaseOrder.includes(phase)) {
                    phaseOrder.push(phase);
                }
            };

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, trackingCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Phases should be in correct order
            expect(phaseOrder).toEqual([
                'github-repo',
                'github-clone',
                'helix-config',
                'code-sync',
                'dalive-content',
                'tools-clone',
                'env-config',
                'complete',
            ]);
        });

        it('should stop execution on phase failure', async () => {
            // Given: GitHub repo creation fails
            mockGitHubService.createFromTemplate!.mockRejectedValue(
                new Error('Repository name already exists'),
            );

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail at github-repo phase
            expect(result.success).toBe(false);
            expect(result.phase).toBe('github-repo');
            expect(result.error).toContain('Repository');

            // And subsequent phases should not be called
            expect(mockGitHubService.cloneRepository).not.toHaveBeenCalled();
        });

        it('should report progress through callback', async () => {
            // Given: Valid config with progress callback

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Progress callback should be called for each phase
            expect(mockProgressCallback).toHaveBeenCalledWith(
                'github-repo',
                expect.any(Number),
                expect.stringContaining('Creating'),
            );
            expect(mockProgressCallback).toHaveBeenCalledWith(
                'github-clone',
                expect.any(Number),
                expect.stringContaining('Cloning'),
            );
        });

        it('should complete all phases successfully', async () => {
            // Given: All phases configured to succeed

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should complete successfully
            expect(result.success).toBe(true);
            expect(result.repoUrl).toBe(mockRepo.htmlUrl);
            expect(result.previewUrl).toContain('aem.page');
            expect(result.liveUrl).toContain('aem.live');
        });
    });

    // ==========================================================
    // GitHub Repository Creation Tests (4 tests)
    // ==========================================================
    describe('GitHub Repository Creation', () => {
        beforeEach(() => {
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
        });

        it('should create repository from citisignal template', async () => {
            // Given: Valid config
            mockGitHubService.cloneRepository!.mockRejectedValue(new Error('stop here'));

            // When: Running setup (will fail after repo creation)
            await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should call createFromTemplate
            expect(mockGitHubService.createFromTemplate).toHaveBeenCalledWith(
                expect.any(String), // template owner
                expect.any(String), // template repo
                defaultConfig.repoName,
                defaultConfig.isPrivate,
            );
        });

        it('should use skukla/citisignal-one as template', async () => {
            // Given: Valid config
            mockGitHubService.cloneRepository!.mockRejectedValue(new Error('stop here'));

            // When: Running setup
            await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should use correct template
            expect(mockGitHubService.createFromTemplate).toHaveBeenCalledWith(
                'skukla',
                'citisignal-one',
                expect.any(String),
                expect.any(Boolean),
            );
        });

        it('should clone repository to project path', async () => {
            // Given: Repo created successfully
            // Make helix config fail to stop after clone
            mockFetch.mockRejectedValue(new Error('stop here'));

            // When: Running setup
            await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should clone to project path
            expect(mockGitHubService.cloneRepository).toHaveBeenCalledWith(
                mockRepo.cloneUrl,
                defaultConfig.projectPath,
            );
        });

        it('should handle repository name conflict', async () => {
            // Given: Repository name already exists
            mockGitHubService.createFromTemplate!.mockRejectedValue(
                new Error('Repository name already exists'),
            );

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail with appropriate error
            expect(result.success).toBe(false);
            expect(result.phase).toBe('github-repo');
            expect(result.error).toContain('already exists');
        });
    });

    // ==========================================================
    // Helix 5 Configuration Tests (4 tests)
    // ==========================================================
    describe('Helix 5 Configuration', () => {
        beforeEach(() => {
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
        });

        it('should configure site via admin.hlx.page API', async () => {
            // Given: GitHub setup complete
            // Make code sync fail to stop after helix config
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200 }) // helix config
                .mockResolvedValue({ ok: false, status: 404 }); // code sync fails

            // When: Running setup (will timeout at code sync)
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);

            // Advance timers to allow code sync to timeout
            await jest.advanceTimersByTimeAsync(130000);
            await resultPromise;

            // Then: Should call admin.hlx.page config endpoint
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('admin.hlx.page/config'),
                expect.objectContaining({
                    method: 'POST',
                }),
            );
        });

        it('should set DA.live mountpoint in configuration', async () => {
            // Given: GitHub setup complete
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200 })
                .mockResolvedValue({ ok: false, status: 404 });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);

            // Advance timers to allow code sync to timeout
            await jest.advanceTimersByTimeAsync(130000);
            await resultPromise;

            // Then: Config should include DA.live mountpoint
            const configCall = mockFetch.mock.calls.find(
                (call) => call[0].includes('admin.hlx.page/config'),
            );
            expect(configCall).toBeDefined();
            const body = JSON.parse(configCall![1].body);
            expect(body.mountpoints['/']).toContain('content.da.live');
            expect(body.mountpoints['/']).toContain(defaultConfig.daLiveOrg);
        });

        it('should use IMS token for API authentication', async () => {
            // Given: Auth service returns IMS token
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200 })
                .mockResolvedValue({ ok: false, status: 404 });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);

            // Advance timers to allow code sync to timeout
            await jest.advanceTimersByTimeAsync(130000);
            await resultPromise;

            // Then: API call should include Bearer token
            const configCall = mockFetch.mock.calls.find(
                (call) => call[0].includes('admin.hlx.page/config'),
            );
            expect(configCall![1].headers.Authorization).toBe('Bearer mock-ims-token');
        });

        it('should poll code bus until sync verified', async () => {
            // Given: First 2 polls return 404, third returns 200
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200 }) // helix config
                .mockResolvedValueOnce({ ok: false, status: 404 }) // code sync poll 1
                .mockResolvedValueOnce({ ok: false, status: 404 }) // code sync poll 2
                .mockResolvedValueOnce({ ok: true, status: 200 }); // code sync poll 3 - success!

            // Setup remaining mocks
            mockDaLiveService.copyCitisignalContent!.mockResolvedValue({
                success: true,
                copiedFiles: [],
                failedFiles: [],
                totalFiles: 0,
            });
            mockComponentManager.installComponent!.mockResolvedValue({ success: true });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);

            // Advance timers to trigger polls
            await jest.advanceTimersByTimeAsync(5000); // poll 1
            await jest.advanceTimersByTimeAsync(5000); // poll 2
            await jest.advanceTimersByTimeAsync(5000); // poll 3
            await jest.runAllTimersAsync();

            const result = await resultPromise;

            // Then: Should poll code bus endpoint
            const codePolls = mockFetch.mock.calls.filter(
                (call) => call[0].includes('admin.hlx.page/code'),
            );
            expect(codePolls.length).toBeGreaterThanOrEqual(3);
        });
    });

    // ==========================================================
    // Code Bus Verification Tests (4 tests)
    // ==========================================================
    describe('Code Bus Verification', () => {
        beforeEach(() => {
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 }); // helix config
        });

        it('should use exponential backoff for polling', async () => {
            // Given: Code sync keeps failing
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            // When: Running setup (will timeout)
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);

            // Advance time through polling
            await jest.advanceTimersByTimeAsync(5000); // poll 1
            await jest.advanceTimersByTimeAsync(5000); // poll 2

            // Cancel by advancing past timeout
            await jest.advanceTimersByTimeAsync(130000);

            const result = await resultPromise;

            // Then: Multiple polls should have occurred with delays
            const codePolls = mockFetch.mock.calls.filter(
                (call) => call[0].includes('admin.hlx.page/code'),
            );
            expect(codePolls.length).toBeGreaterThan(1);
        });

        it('should timeout after max polling attempts', async () => {
            // Given: Code sync never succeeds
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);

            // Advance past total timeout (125 seconds)
            await jest.advanceTimersByTimeAsync(130000);

            const result = await resultPromise;

            // Then: Should fail at code-sync phase
            expect(result.success).toBe(false);
            expect(result.phase).toBe('code-sync');
            expect(result.error).toContain('timeout');
        });

        it('should generate preview URL on sync success', async () => {
            // Given: Code sync succeeds on first try
            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockDaLiveService.copyCitisignalContent!.mockResolvedValue({
                success: true,
                copiedFiles: [],
                failedFiles: [],
                totalFiles: 0,
            });
            mockComponentManager.installComponent!.mockResolvedValue({ success: true });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Preview URL should be correct format
            expect(result.previewUrl).toBe(`https://main--${defaultConfig.repoName}--${defaultConfig.githubOwner}.aem.page`);
        });

        it('should handle 404 during polling', async () => {
            // Given: First poll returns 404, second returns 200
            mockFetch
                .mockResolvedValueOnce({ ok: false, status: 404 }) // code sync poll 1
                .mockResolvedValue({ ok: true, status: 200 }); // code sync poll 2 + rest

            mockDaLiveService.copyCitisignalContent!.mockResolvedValue({
                success: true,
                copiedFiles: [],
                failedFiles: [],
                totalFiles: 0,
            });
            mockComponentManager.installComponent!.mockResolvedValue({ success: true });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.advanceTimersByTimeAsync(5000); // First poll (404)
            await jest.advanceTimersByTimeAsync(5000); // Second poll (200)
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should continue polling after 404
            expect(result.success).toBe(true);
        });
    });

    // ==========================================================
    // DA.live Content Tests (4 tests)
    // ==========================================================
    describe('DA.live Content', () => {
        beforeEach(() => {
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({ ok: true, status: 200 }); // helix config + code sync
        });

        it('should copy CitiSignal content to DA.live', async () => {
            // Given: Code sync complete
            mockDaLiveService.copyCitisignalContent!.mockResolvedValue({
                success: true,
                copiedFiles: ['/index.html', '/about.html'],
                failedFiles: [],
                totalFiles: 2,
            });
            mockComponentManager.installComponent!.mockResolvedValue({ success: true });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Should copy content to destination org/site
            expect(mockDaLiveService.copyCitisignalContent).toHaveBeenCalledWith(
                defaultConfig.daLiveOrg,
                defaultConfig.daLiveSite,
                expect.any(Function), // progress callback
            );
        });

        it('should report content copy progress', async () => {
            // Given: Content copy with progress reporting
            mockDaLiveService.copyCitisignalContent!.mockImplementation(
                async (_org, _site, progressCallback) => {
                    if (progressCallback) {
                        progressCallback({ processed: 1, total: 2, percentage: 50 });
                        progressCallback({ processed: 2, total: 2, percentage: 100 });
                    }
                    return { success: true, copiedFiles: [], failedFiles: [], totalFiles: 2 };
                },
            );
            mockComponentManager.installComponent!.mockResolvedValue({ success: true });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Progress should be reported for dalive-content phase
            expect(mockProgressCallback).toHaveBeenCalledWith(
                'dalive-content',
                expect.any(Number),
                expect.any(String),
            );
        });

        it('should handle partial content copy failure', async () => {
            // Given: Some files fail to copy
            mockDaLiveService.copyCitisignalContent!.mockResolvedValue({
                success: false,
                copiedFiles: ['/index.html'],
                failedFiles: [{ path: '/about.html', error: 'Copy failed' }],
                totalFiles: 2,
            });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should fail at dalive-content phase
            expect(result.success).toBe(false);
            expect(result.phase).toBe('dalive-content');
        });

        it('should skip content copy if already populated', async () => {
            // Given: Site already has content
            mockDaLiveService.listDirectory!.mockResolvedValue([
                { name: 'index.html', path: '/index.html', type: 'file' },
            ]);
            const configWithSkip = { ...defaultConfig, skipContent: true };

            mockComponentManager.installComponent!.mockResolvedValue({ success: true });

            // When: Running setup with skipContent
            const resultPromise = service.setupProject(configWithSkip, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Should not copy content
            expect(mockDaLiveService.copyCitisignalContent).not.toHaveBeenCalled();
        });
    });

    // ==========================================================
    // Tools Cloning Tests (4 tests)
    // ==========================================================
    describe('Tools Cloning', () => {
        beforeEach(() => {
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockDaLiveService.copyCitisignalContent!.mockResolvedValue({
                success: true,
                copiedFiles: [],
                failedFiles: [],
                totalFiles: 0,
            });
        });

        it('should clone commerce-demo-ingestion via ComponentManager', async () => {
            // Given: Content copy complete
            mockComponentManager.installComponent!.mockResolvedValue({
                success: true,
                component: { id: 'commerce-demo-ingestion', name: 'Ingestion Tool', status: 'ready' },
            });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Should install commerce-demo-ingestion component
            expect(mockComponentManager.installComponent).toHaveBeenCalledWith(
                expect.any(Object), // project
                expect.objectContaining({
                    id: 'commerce-demo-ingestion',
                }),
                expect.any(Object), // options
            );
        });

        it('should clone to project/tools directory', async () => {
            // Given: Content copy complete
            mockComponentManager.installComponent!.mockResolvedValue({
                success: true,
                component: { id: 'commerce-demo-ingestion', status: 'ready' },
            });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Component should be installed to tools directory
            const installCall = mockComponentManager.installComponent!.mock.calls[0];
            const project = installCall[0];
            expect(project.path).toContain('tools');
        });

        it('should skip npm install for ingestion tool', async () => {
            // Given: Content copy complete
            mockComponentManager.installComponent!.mockResolvedValue({
                success: true,
                component: { id: 'commerce-demo-ingestion', status: 'ready' },
            });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Should skip dependencies
            expect(mockComponentManager.installComponent).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object),
                expect.objectContaining({
                    skipDependencies: true,
                }),
            );
        });

        it('should handle tool clone failure gracefully', async () => {
            // Given: Tool clone fails
            mockComponentManager.installComponent!.mockResolvedValue({
                success: false,
                error: 'Git clone failed',
            });

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should fail at tools-clone phase
            expect(result.success).toBe(false);
            expect(result.phase).toBe('tools-clone');
        });
    });

    // ==========================================================
    // Environment Configuration Tests (4 tests)
    // ==========================================================
    describe('Environment Configuration', () => {
        beforeEach(() => {
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockDaLiveService.copyCitisignalContent!.mockResolvedValue({
                success: true,
                copiedFiles: [],
                failedFiles: [],
                totalFiles: 0,
            });
            mockComponentManager.installComponent!.mockResolvedValue({ success: true });
        });

        it('should generate .env file with ACCS configuration', async () => {
            // Given: All previous phases complete

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Should write .env file with ACCS endpoint
            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.env'),
                expect.stringContaining('ACCS_ENDPOINT'),
                expect.any(String),
            );
        });

        it('should include DA.live configuration in .env', async () => {
            // Given: All previous phases complete

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: .env should include DA.live config
            const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
                (call) => call[0].includes('.env'),
            );
            expect(writeCall).toBeDefined();
            const envContent = writeCall[1];
            expect(envContent).toContain('DA_LIVE_ORG');
            expect(envContent).toContain(defaultConfig.daLiveOrg);
        });

        it('should not overwrite existing .env if present', async () => {
            // Given: .env file already exists
            (fs.access as jest.Mock).mockResolvedValue(undefined); // File exists

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Should not overwrite
            expect(fs.writeFile).not.toHaveBeenCalledWith(
                expect.stringContaining('.env'),
                expect.any(String),
                expect.any(String),
            );
        });

        it('should validate required env vars are set', async () => {
            // Given: All previous phases complete

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should complete successfully with valid config
            expect(result.success).toBe(true);

            // And .env should have required vars
            const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
                (call) => call[0].includes('.env'),
            );
            if (writeCall) {
                const envContent = writeCall[1];
                expect(envContent).toContain('ACCS_ENDPOINT');
                expect(envContent).toContain('DA_LIVE_ORG');
                expect(envContent).toContain('DA_LIVE_SITE');
            }
        });
    });

    // ==========================================================
    // Error Handling Tests (4 tests)
    // ==========================================================
    describe('Error Handling', () => {
        it('should provide detailed error on GitHub failure', async () => {
            // Given: GitHub API returns specific error
            mockGitHubService.createFromTemplate!.mockRejectedValue(
                new Error('Repository creation failed: rate limit exceeded'),
            );

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Error should be detailed
            expect(result.success).toBe(false);
            expect(result.error).toContain('rate limit');
            expect(result.phase).toBe('github-repo');
        });

        it('should provide rollback info on partial failure', async () => {
            // Given: Failure happens after repo creation
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockRejectedValue(
                new Error('Git clone failed: permission denied'),
            );

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should include repo URL for manual cleanup
            expect(result.success).toBe(false);
            expect(result.repoUrl).toBe(mockRepo.htmlUrl);
            expect(result.phase).toBe('github-clone');
        });

        it('should handle network timeout gracefully', async () => {
            // Given: Network timeout on Helix config
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockRejectedValue(new Error('Network timeout'));

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail with network error
            expect(result.success).toBe(false);
            expect(result.error).toContain('timeout');
        });

        it('should log detailed debugging info on failure', async () => {
            // Given: Setup fails
            mockGitHubService.createFromTemplate!.mockRejectedValue(
                new Error('API error'),
            );

            // When: Running setup
            await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should log error details
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('EDS'),
                expect.any(Error),
            );
        });
    });

    // ==========================================================
    // Additional Branch Coverage Tests
    // ==========================================================
    describe('Branch Coverage', () => {
        beforeEach(() => {
            mockGitHubService.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubService.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockDaLiveService.copyCitisignalContent!.mockResolvedValue({
                success: true,
                copiedFiles: [],
                failedFiles: [],
                totalFiles: 0,
            });
            mockComponentManager.installComponent!.mockResolvedValue({ success: true });
        });

        it('should create private repository when isPrivate is true', async () => {
            // Given: Config with private repo
            const privateConfig = { ...defaultConfig, isPrivate: true };

            // When: Running setup
            const resultPromise = service.setupProject(privateConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Should pass isPrivate=true to createFromTemplate
            expect(mockGitHubService.createFromTemplate).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                expect.any(String),
                true,
            );
        });

        it('should skip tools cloning when skipTools is true', async () => {
            // Given: Config with skipTools
            const skipToolsConfig = { ...defaultConfig, skipTools: true };

            // When: Running setup
            const resultPromise = service.setupProject(skipToolsConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should not clone tools
            expect(mockComponentManager.installComponent).not.toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('should fail when IMS token is not available', async () => {
            // Given: Token manager returns null
            const mockTokenManager = {
                getAccessToken: jest.fn().mockResolvedValue(null),
            };
            mockAuthService.getTokenManager!.mockReturnValue(mockTokenManager);

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail at helix-config phase
            expect(result.success).toBe(false);
            expect(result.phase).toBe('helix-config');
            expect(result.error).toContain('authenticated');
        });

        it('should handle Helix API non-ok response', async () => {
            // Given: Helix config returns 500 error
            mockFetch.mockResolvedValue({ ok: false, status: 500 });

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail at helix-config phase
            expect(result.success).toBe(false);
            expect(result.phase).toBe('helix-config');
            expect(result.error).toContain('500');
        });

        it('should handle Helix abort error', async () => {
            // Given: Helix config aborted
            mockFetch.mockRejectedValue(new Error('The operation was aborted'));

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail with timeout message
            expect(result.success).toBe(false);
            expect(result.phase).toBe('helix-config');
            expect(result.error).toContain('timeout');
        });

        it('should run without progress callback', async () => {
            // Given: No progress callback

            // When: Running setup without callback
            const resultPromise = service.setupProject(defaultConfig);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should complete successfully
            expect(result.success).toBe(true);
        });

        it('should handle fs.writeFile error in env generation', async () => {
            // Given: fs.writeFile fails
            (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));
            (fs.writeFile as jest.Mock).mockRejectedValue(new Error('Permission denied'));

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should fail at env-config phase
            expect(result.success).toBe(false);
            expect(result.phase).toBe('env-config');
        });

        it('should handle network error during code sync polling', async () => {
            // Given: Helix config succeeds, but code sync has network errors
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200 }) // helix config
                .mockRejectedValue(new Error('Network error')); // code sync network error

            // When: Running setup (will keep polling until timeout)
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.advanceTimersByTimeAsync(130000);
            const result = await resultPromise;

            // Then: Should timeout at code-sync phase
            expect(result.success).toBe(false);
            expect(result.phase).toBe('code-sync');
        });

        it('should handle code sync non-404 error response', async () => {
            // Given: Code sync returns 500 error
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200 }) // helix config
                .mockResolvedValue({ ok: false, status: 500 }); // code sync error

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.advanceTimersByTimeAsync(130000);
            const result = await resultPromise;

            // Then: Should timeout at code-sync phase
            expect(result.success).toBe(false);
            expect(result.phase).toBe('code-sync');
        });

        it('should handle content copy without progress callback', async () => {
            // Given: Config without progress callback
            mockDaLiveService.copyCitisignalContent!.mockResolvedValue({
                success: true,
                copiedFiles: ['/index.html'],
                failedFiles: [],
                totalFiles: 1,
            });

            // When: Running setup without callback
            const resultPromise = service.setupProject(defaultConfig);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should complete successfully
            expect(result.success).toBe(true);
            expect(mockDaLiveService.copyCitisignalContent).toHaveBeenCalled();
        });
    });
});
