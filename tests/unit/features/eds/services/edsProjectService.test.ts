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

// Mock timeout config - uses semantic categories
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000, // Standard API calls (replaces EDS_HELIX_CONFIG)
        LONG: 180000, // Complex operations (replaces EDS_CODE_SYNC_TOTAL, COMPONENT_CLONE, DA_LIVE_COPY)
        POLL: {
            INITIAL: 500,
            MAX: 5000,
            INTERVAL: 1000,
            PROCESS_CHECK: 100,
        },
    },
}));

// Mock GitHubAppService - default to true (app installed), tests can override for error scenarios
const mockGitHubAppService = {
    isAppInstalled: jest.fn().mockResolvedValue(true),
    getInstallUrl: jest.fn().mockReturnValue('https://github.com/apps/aem-code-sync/installations/new'),
};
jest.mock('@/features/eds/services/githubAppService', () => ({
    GitHubAppService: jest.fn().mockImplementation(() => mockGitHubAppService),
}));

// Mock HelixService for content-publish phase
const mockHelixService = {
    publishAllSiteContent: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn().mockResolvedValue({ status: 'ready' }),
};
jest.mock('@/features/eds/services/helixService', () => ({
    HelixService: jest.fn().mockImplementation(() => mockHelixService),
}));

// Import types
import type { GitHubTokenService } from '@/features/eds/services/githubTokenService';
import type { GitHubRepoOperations } from '@/features/eds/services/githubRepoOperations';
import type { GitHubFileOperations } from '@/features/eds/services/githubFileOperations';
import type { DaLiveOrgOperations } from '@/features/eds/services/daLiveOrgOperations';
import type { DaLiveContentOperations } from '@/features/eds/services/daLiveContentOperations';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { ComponentManager } from '@/features/components/services/componentManager';
import type { GitHubRepo } from '@/features/eds/services/types';
import {
    EdsProjectError,
    GitHubAppNotInstalledError,
    type EdsProjectConfig,
    type EdsProgressCallback,
    type EdsSetupPhase,
} from '@/features/eds/services/types';
import type { GitHubServicesForProject, DaLiveServicesForProject } from '@/features/eds/services/edsProjectService';

// Type for the service we'll import dynamically
type EdsProjectServiceType = import('@/features/eds/services/edsProjectService').EdsProjectService;

describe('EdsProjectService', () => {
    let service: EdsProjectServiceType;
    let mockGitHubTokenService: jest.Mocked<Partial<GitHubTokenService>>;
    let mockGitHubRepoOps: jest.Mocked<Partial<GitHubRepoOperations>>;
    let mockGitHubFileOps: jest.Mocked<Partial<GitHubFileOperations>>;
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
        projectName: 'Test Project',
        projectPath: '/Users/test/projects/test-project',
        componentPath: '/Users/test/projects/test-project/components/eds-storefront',
        repoName: 'test-site',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
        templateOwner: 'demo-system-stores',
        templateRepo: 'accs-citisignal',
        backendComponentId: 'accs',
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

        // Reset GitHubAppService mock to default (app installed)
        mockGitHubAppService.isAppInstalled.mockResolvedValue(true);

        // Reset HelixService mock to default (successful publish)
        mockHelixService.publishAllSiteContent.mockResolvedValue(undefined);

        // Mock GitHubTokenService
        mockGitHubTokenService = {
            getToken: jest.fn(),
            validateToken: jest.fn(),
        };

        // Mock GitHubRepoOperations
        mockGitHubRepoOps = {
            createFromTemplate: jest.fn(),
            cloneRepository: jest.fn(),
            getRepository: jest.fn(),
            deleteRepository: jest.fn(),
            waitForContent: jest.fn().mockResolvedValue(true),
        };

        // Mock GitHubFileOperations
        mockGitHubFileOps = {
            getFileContent: jest.fn().mockResolvedValue(null),
            createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
        };

        // Mock DaLiveOrgOperations
        mockDaLiveOrgOps = {
            deleteSite: jest.fn(),
            listOrgSites: jest.fn(),
        };

        // Mock DaLiveContentOperations
        mockDaLiveContentOps = {
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
        (fs.rm as jest.Mock).mockResolvedValue(undefined);
        // Mock fs.readdir for clone verification (needs at least 1 file)
        (fs.readdir as jest.Mock).mockResolvedValue(['package.json', 'README.md', 'src']);
        // Default: files don't exist (for .env check), but we override for clone verification
        (fs.access as jest.Mock).mockImplementation(async (filePath: string) => {
            // fstab.yaml exists after helix config generates it
            if (filePath.includes('fstab.yaml')) {
                return undefined; // File exists
            }
            // Clone verification files should pass after clone
            if (filePath.includes('package.json') || filePath.includes('scripts/aem.js')) {
                return undefined; // File exists
            }
            // .env file doesn't exist (so it gets created)
            throw new Error('ENOENT');
        });
        // Mock fs.readFile for fstab.yaml check and config.json reading
        (fs.readFile as jest.Mock).mockImplementation(async (filePath: string) => {
            if (filePath.includes('fstab.yaml')) {
                return 'mountpoints:\n  /: https://content.da.live/test-org/test-site';
            }
            throw new Error('ENOENT');
        });

        // Progress callback
        mockProgressCallback = jest.fn();

        // Create service interface objects
        const githubServices: GitHubServicesForProject = {
            tokenService: mockGitHubTokenService as unknown as GitHubTokenService,
            repoOperations: mockGitHubRepoOps as unknown as GitHubRepoOperations,
            fileOperations: mockGitHubFileOps as unknown as GitHubFileOperations,
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
    // Service Initialization Tests (3 tests)
    // ==========================================================
    describe('Service Initialization', () => {
        it('should initialize with required dependencies', async () => {
            // Given: All required dependencies provided
            const module = await import('@/features/eds/services/edsProjectService');

            // Create service interface objects
            const githubServices: GitHubServicesForProject = {
                tokenService: mockGitHubTokenService as unknown as GitHubTokenService,
                repoOperations: mockGitHubRepoOps as unknown as GitHubRepoOperations,
            };
            const daLiveServices: DaLiveServicesForProject = {
                orgOperations: mockDaLiveOrgOps as unknown as DaLiveOrgOperations,
                contentOperations: mockDaLiveContentOps as unknown as DaLiveContentOperations,
            };

            // When: Creating service
            const newService = new module.EdsProjectService(
                githubServices,
                daLiveServices,
                mockAuthService as unknown as AuthenticationService,
                mockComponentManager as unknown as ComponentManager,
            );

            // Then: Service should be created successfully
            expect(newService).toBeDefined();
        });

        it('should throw error if GitHubServices not provided', async () => {
            // Given: No GitHubServices
            const module = await import('@/features/eds/services/edsProjectService');
            const daLiveServices: DaLiveServicesForProject = {
                orgOperations: mockDaLiveOrgOps as unknown as DaLiveOrgOperations,
                contentOperations: mockDaLiveContentOps as unknown as DaLiveContentOperations,
            };

            // When: Creating service without GitHub services
            // Then: Should throw error
            expect(() => {
                new module.EdsProjectService(
                    null as unknown as GitHubServicesForProject,
                    daLiveServices,
                    mockAuthService as unknown as AuthenticationService,
                    mockComponentManager as unknown as ComponentManager,
                );
            }).toThrow('GitHubService is required');
        });

        it('should throw error if DaLiveServices not provided', async () => {
            // Given: No DaLiveServices
            const module = await import('@/features/eds/services/edsProjectService');
            const githubServices: GitHubServicesForProject = {
                tokenService: mockGitHubTokenService as unknown as GitHubTokenService,
                repoOperations: mockGitHubRepoOps as unknown as GitHubRepoOperations,
            };

            // When: Creating service without DA.live services
            // Then: Should throw error
            expect(() => {
                new module.EdsProjectService(
                    githubServices,
                    null as unknown as DaLiveServicesForProject,
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
            mockGitHubRepoOps.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubRepoOps.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({}),
            });
            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
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
            // Note: content-publish phase was added to sync DA.live content to CDN
            // Note: env-config phase removed - config.json now generated post-mesh in executor
            expect(phaseOrder).toEqual([
                'github-repo',
                'github-clone',
                'helix-config',
                'code-sync',
                'dalive-content',
                'content-publish',
                'tools-clone',
                'complete',
            ]);
        });

        it('should stop execution on phase failure', async () => {
            // Given: GitHub repo creation fails
            mockGitHubRepoOps.createFromTemplate!.mockRejectedValue(
                new Error('Repository name already exists'),
            );

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail at github-repo phase
            expect(result.success).toBe(false);
            expect(result.phase).toBe('github-repo');
            expect(result.error).toContain('Repository');

            // And subsequent phases should not be called
            expect(mockGitHubRepoOps.cloneRepository).not.toHaveBeenCalled();
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
            mockGitHubRepoOps.createFromTemplate!.mockResolvedValue(mockRepo);
        });

        it('should create repository from citisignal template', async () => {
            // Given: Valid config
            mockGitHubRepoOps.cloneRepository!.mockRejectedValue(new Error('stop here'));

            // When: Running setup (will fail after repo creation)
            await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should call createFromTemplate
            expect(mockGitHubRepoOps.createFromTemplate).toHaveBeenCalledWith(
                expect.any(String), // template owner
                expect.any(String), // template repo
                defaultConfig.repoName,
                defaultConfig.isPrivate,
            );
        });

        it('should use demo-system-stores/accs-citisignal as template', async () => {
            // Given: Valid config
            mockGitHubRepoOps.cloneRepository!.mockRejectedValue(new Error('stop here'));

            // When: Running setup
            await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should use correct template
            expect(mockGitHubRepoOps.createFromTemplate).toHaveBeenCalledWith(
                'demo-system-stores',
                'accs-citisignal',
                expect.any(String),
                expect.any(Boolean),
            );
        });

        it('should clone repository to component path', async () => {
            // Given: Repo created successfully
            // Make code sync fail (will timeout and throw GitHubAppNotInstalledError)
            mockFetch.mockRejectedValue(new Error('stop here'));

            // When: Running setup (code sync will timeout after 120s)
            try {
                const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
                await jest.advanceTimersByTimeAsync(130000);
                await resultPromise;
            } catch {
                // GitHubAppNotInstalledError is re-thrown - expected
            }

            // Then: Should clone to component path (components/eds-storefront)
            expect(mockGitHubRepoOps.cloneRepository).toHaveBeenCalledWith(
                mockRepo.cloneUrl,
                defaultConfig.componentPath,
            );
        }, 15000);

        it('should handle repository name conflict', async () => {
            // Given: Repository name already exists
            mockGitHubRepoOps.createFromTemplate!.mockRejectedValue(
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
    // Modern Helix 5 uses fstab.yaml file generation, not admin.hlx.page/config API
    // ==========================================================
    describe('Helix 5 Configuration', () => {
        beforeEach(() => {
            mockGitHubRepoOps.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubRepoOps.cloneRepository!.mockResolvedValue(undefined);
            // Mock fs.access to simulate fstab.yaml verification passing
            (fs.access as jest.Mock).mockImplementation(async (filePath: string) => {
                if (filePath.includes('fstab.yaml')) {
                    return undefined; // fstab.yaml exists after generation
                }
                if (filePath.includes('package.json') || filePath.includes('scripts/aem.js')) {
                    return undefined; // Clone verification files exist
                }
                throw new Error('ENOENT');
            });
        });

        it('should generate fstab.yaml configuration file', async () => {
            // Given: GitHub setup complete
            // Make code sync fail to stop after helix config
            mockFetch.mockResolvedValue({ ok: false, status: 404 }); // code sync fails

            // When: Running setup (will timeout at code sync and throw GitHubAppNotInstalledError)
            try {
                const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
                await jest.advanceTimersByTimeAsync(130000);
                await resultPromise;
            } catch {
                // GitHubAppNotInstalledError is re-thrown - expected
            }

            // Then: Should write fstab.yaml file
            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('fstab.yaml'),
                expect.any(String),
                expect.any(String),
            );
        }, 15000);

        it('should set DA.live mountpoint in fstab.yaml', async () => {
            // Given: GitHub setup complete
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            // When: Running setup (will timeout at code sync and throw GitHubAppNotInstalledError)
            try {
                const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
                await jest.advanceTimersByTimeAsync(130000);
                await resultPromise;
            } catch {
                // GitHubAppNotInstalledError is re-thrown - expected
            }

            // Then: fstab.yaml should include DA.live mountpoint
            const fstabWriteCall = (fs.writeFile as jest.Mock).mock.calls.find(
                (call) => call[0].includes('fstab.yaml'),
            );
            expect(fstabWriteCall).toBeDefined();
            const fstabContent = fstabWriteCall![1];
            expect(fstabContent).toContain('content.da.live');
            expect(fstabContent).toContain(defaultConfig.daLiveOrg);
            expect(fstabContent).toContain(defaultConfig.daLiveSite);
        }, 15000);

        it('should verify fstab.yaml was created', async () => {
            // Given: GitHub setup complete
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            // When: Running setup (will timeout at code sync and throw GitHubAppNotInstalledError)
            try {
                const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
                await jest.advanceTimersByTimeAsync(130000);
                await resultPromise;
            } catch {
                // GitHubAppNotInstalledError is re-thrown - expected
            }

            // Then: Should verify fstab.yaml exists via fs.access
            expect(fs.access).toHaveBeenCalledWith(
                expect.stringContaining('fstab.yaml'),
            );
        }, 15000);

        it('should poll code bus until sync verified', async () => {
            // Given: First 2 polls return 404, third returns 200
            mockFetch
                .mockResolvedValueOnce({ ok: false, status: 404 }) // code sync poll 1
                .mockResolvedValueOnce({ ok: false, status: 404 }) // code sync poll 2
                .mockResolvedValueOnce({ ok: true, status: 200 }); // code sync poll 3 - success!

            // Setup remaining mocks
            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
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
            mockGitHubRepoOps.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubRepoOps.cloneRepository!.mockResolvedValue(undefined);
            // Mock fs.access for fstab.yaml verification (helix config uses file-based approach now)
            (fs.access as jest.Mock).mockImplementation(async (filePath: string) => {
                if (filePath.includes('fstab.yaml')) {
                    return undefined; // fstab.yaml exists after generation
                }
                if (filePath.includes('package.json') || filePath.includes('scripts/aem.js')) {
                    return undefined; // Clone verification files exist
                }
                throw new Error('ENOENT');
            });
        });

        it('should use exponential backoff for polling', async () => {
            // Given: Code sync keeps failing
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            // When: Running setup (will timeout and throw GitHubAppNotInstalledError)
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);

            // Advance time through polling
            await jest.advanceTimersByTimeAsync(5000); // poll 1
            await jest.advanceTimersByTimeAsync(5000); // poll 2

            // Cancel by advancing past timeout
            await jest.advanceTimersByTimeAsync(130000);

            try {
                await resultPromise;
            } catch {
                // GitHubAppNotInstalledError is re-thrown - expected
            }

            // Then: Multiple polls should have occurred with delays
            const codePolls = mockFetch.mock.calls.filter(
                (call) => call[0].includes('admin.hlx.page/code'),
            );
            expect(codePolls.length).toBeGreaterThan(1);
        }, 15000);

        it('should detect GitHub App not installed when code sync fails', async () => {
            // Given: Code sync never succeeds and app not installed
            mockFetch.mockResolvedValue({ ok: false, status: 404 });
            mockGitHubAppService.isAppInstalled.mockResolvedValue(false);

            // When: Running setup - attach error handler BEFORE advancing timers
            // to avoid unhandled rejection during timer advancement
            let thrownError: Error | undefined;
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback)
                .catch((error: Error) => {
                    thrownError = error;
                });

            // Advance past total timeout (125 seconds) and let promise settle
            await jest.advanceTimersByTimeAsync(130000);
            await resultPromise;

            // Then: Should throw GitHubAppNotInstalledError (re-thrown for executor to handle)
            expect(thrownError).toBeInstanceOf(GitHubAppNotInstalledError);
            expect(thrownError?.message).toContain('GitHub App not installed');
        }, 15000);

        it('should generate preview URL on sync success', async () => {
            // Given: Code sync succeeds on first try
            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
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

            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
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
            mockGitHubRepoOps.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubRepoOps.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({ ok: true, status: 200 }); // helix config + code sync
        });

        it('should copy CitiSignal content to DA.live', async () => {
            // Given: Code sync complete
            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
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
            expect(mockDaLiveContentOps.copyCitisignalContent).toHaveBeenCalledWith(
                defaultConfig.daLiveOrg,
                defaultConfig.daLiveSite,
                expect.any(Function), // progress callback
            );
        });

        it('should report content copy progress', async () => {
            // Given: Content copy with progress reporting
            mockDaLiveContentOps.copyCitisignalContent!.mockImplementation(
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
            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
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
            mockDaLiveContentOps.listDirectory!.mockResolvedValue([
                { name: 'index.html', path: '/index.html', type: 'file' },
            ]);
            const configWithSkip = { ...defaultConfig, skipContent: true };

            mockComponentManager.installComponent!.mockResolvedValue({ success: true });

            // When: Running setup with skipContent
            const resultPromise = service.setupProject(configWithSkip, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Should not copy content
            expect(mockDaLiveContentOps.copyCitisignalContent).not.toHaveBeenCalled();
        });
    });

    // ==========================================================
    // Tools Cloning Tests (4 tests)
    // ==========================================================
    describe('Tools Cloning', () => {
        beforeEach(() => {
            mockGitHubRepoOps.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubRepoOps.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
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
        // PaaS backend config for testing config.json generation
        const paasConfig: EdsProjectConfig = {
            ...defaultConfig,
            backendComponentId: 'adobe-commerce-paas',
            meshEndpoint: 'https://edge-test.adobeio-static.net/graphql',
            backendEnvVars: {
                ADOBE_CATALOG_API_KEY: 'test-api-key',
                ADOBE_COMMERCE_ENVIRONMENT_ID: 'test-env-id',
                ADOBE_COMMERCE_STORE_VIEW_CODE: 'default',
                ADOBE_COMMERCE_WEBSITE_CODE: 'base',
                ADOBE_COMMERCE_STORE_CODE: 'main_website_store',
            },
        };

        beforeEach(() => {
            mockGitHubRepoOps.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubRepoOps.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
                success: true,
                copiedFiles: [],
                failedFiles: [],
                totalFiles: 0,
            });
            mockComponentManager.installComponent!.mockResolvedValue({ success: true });
            // Mock default-site.json template read
            (fs.readFile as jest.Mock).mockImplementation(async (filePath: string) => {
                if (filePath.includes('fstab.yaml')) {
                    return 'mountpoints:\n  /: https://content.da.live/test-org/test-site';
                }
                if (filePath.includes('default-site.json')) {
                    return JSON.stringify({
                        'commerce-endpoint': '{ENDPOINT}',
                        'store-view-code': '{STORE_VIEW_CODE}',
                    });
                }
                if (filePath.includes('config.json')) {
                    return JSON.stringify({ 'commerce-endpoint': 'https://edge-test.adobeio-static.net/graphql' });
                }
                throw new Error('ENOENT');
            });
            // Mock GitHub file operations for config.json push
            mockGitHubFileOps.getFileContent!.mockResolvedValue(null); // File doesn't exist
            mockGitHubFileOps.createOrUpdateFile!.mockResolvedValue(undefined);
        });

        it('should NOT generate config.json during EDS setup (deferred to post-mesh)', async () => {
            // Given: PaaS backend configuration
            // Phase 5 optimization: config.json is now generated AFTER mesh deployment
            // in executor.ts, not during EDS setup

            // When: Running setup with PaaS backend
            const resultPromise = service.setupProject(paasConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Should NOT write config.json (it's generated post-mesh in executor)
            expect(fs.writeFile).not.toHaveBeenCalledWith(
                expect.stringContaining('config.json'),
                expect.any(String),
                expect.any(String),
            );
        });

        it('should complete EDS setup without config.json for PaaS backend', async () => {
            // Given: PaaS backend with commerce config
            // config.json generation moved to post-mesh phase

            // When: Running setup
            const resultPromise = service.setupProject(paasConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Setup should succeed without generating config.json
            expect(result.success).toBe(true);
            // config.json will be generated in executor's EDS Post-Mesh section
        });

        it('should skip config.json for non-PaaS backends', async () => {
            // Given: ACCS backend (non-PaaS)

            // When: Running setup with ACCS backend
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Then: Should not write config.json (neither during setup nor post-mesh for non-PaaS)
            expect(fs.writeFile).not.toHaveBeenCalledWith(
                expect.stringContaining('config.json'),
                expect.any(String),
                expect.any(String),
            );
        });

        it('should complete setup successfully with valid config', async () => {
            // Given: All previous phases complete

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should complete successfully
            expect(result.success).toBe(true);
            expect(result.previewUrl).toBeDefined();
            expect(result.liveUrl).toBeDefined();
        });
    });

    // ==========================================================
    // Error Handling Tests (4 tests)
    // ==========================================================
    describe('Error Handling', () => {
        it('should provide detailed error on GitHub failure', async () => {
            // Given: GitHub API returns specific error
            mockGitHubRepoOps.createFromTemplate!.mockRejectedValue(
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
            mockGitHubRepoOps.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubRepoOps.cloneRepository!.mockRejectedValue(
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
            // Given: Network timeout on code sync polling (helix config is file-based now)
            mockGitHubRepoOps.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubRepoOps.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockRejectedValue(new Error('Network timeout'));
            // MUST set isAppInstalled to false so GitHubAppNotInstalledError is thrown
            // (otherwise EdsProjectError is thrown and caught, returning { success: false })
            mockGitHubAppService.isAppInstalled.mockResolvedValue(false);

            // When: Running setup - attach error handler BEFORE advancing timers
            let thrownError: Error | undefined;
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback)
                .catch((error: Error) => {
                    thrownError = error;
                });

            // Advance timers to exceed the 120-second code sync timeout
            await jest.advanceTimersByTimeAsync(130000);
            await resultPromise;

            // Then: Should throw GitHubAppNotInstalledError
            expect(thrownError).toBeInstanceOf(GitHubAppNotInstalledError);
            expect(thrownError?.message).toContain('GitHub App not installed');
        }, 15000);

        it('should log detailed debugging info on failure', async () => {
            // Given: Setup fails
            mockGitHubRepoOps.createFromTemplate!.mockRejectedValue(
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
            mockGitHubRepoOps.createFromTemplate!.mockResolvedValue(mockRepo);
            mockGitHubRepoOps.cloneRepository!.mockResolvedValue(undefined);
            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
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
            expect(mockGitHubRepoOps.createFromTemplate).toHaveBeenCalledWith(
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
            // Given: Token manager returns null AND DA.live content copy fails with auth error
            const mockTokenManager = {
                getAccessToken: jest.fn().mockResolvedValue(null),
            };
            mockAuthService.getTokenManager!.mockReturnValue(mockTokenManager);
            // Mock DA.live to fail when IMS token is not available
            mockDaLiveContentOps.copyCitisignalContent!.mockRejectedValue(
                new Error('User is not authenticated. Please sign in to access DA.live.'),
            );

            // When: Running setup
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should fail at dalive-content phase (helix config is file-based, doesn't need IMS)
            // DA.live content copy requires IMS token
            expect(result.success).toBe(false);
            expect(result.phase).toBe('dalive-content');
            expect(result.error).toContain('authenticated');
        });

        it('should handle fstab.yaml generation failure', async () => {
            // Given: fs.writeFile fails for fstab.yaml specifically
            (fs.writeFile as jest.Mock).mockImplementation(async (filePath: string) => {
                if (filePath.includes('fstab.yaml')) {
                    throw new Error('Permission denied');
                }
                return undefined;
            });

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail at helix-config phase
            expect(result.success).toBe(false);
            expect(result.phase).toBe('helix-config');
            expect(result.error).toContain('Permission denied');
        });

        it('should handle fstab.yaml verification failure', async () => {
            // Given: fstab.yaml doesn't exist after write (verification fails)
            (fs.access as jest.Mock).mockImplementation(async (filePath: string) => {
                if (filePath.includes('fstab.yaml')) {
                    throw new Error('ENOENT'); // File doesn't exist
                }
                if (filePath.includes('package.json') || filePath.includes('scripts/aem.js')) {
                    return undefined;
                }
                throw new Error('ENOENT');
            });

            // When: Running setup
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Then: Should fail at helix-config phase
            expect(result.success).toBe(false);
            expect(result.phase).toBe('helix-config');
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

        it('should succeed even if config.json would fail (deferred to post-mesh)', async () => {
            // Given: PaaS backend config
            // Phase 5 optimization: config.json generation moved to post-mesh in executor
            // EDS setup should succeed even if config.json write would fail
            const paasConfig: EdsProjectConfig = {
                ...defaultConfig,
                backendComponentId: 'adobe-commerce-paas',
                meshEndpoint: 'https://edge-test.adobeio-static.net/graphql',
                backendEnvVars: {
                    ADOBE_CATALOG_API_KEY: 'test-api-key',
                    ADOBE_COMMERCE_ENVIRONMENT_ID: 'test-env-id',
                    ADOBE_COMMERCE_STORE_VIEW_CODE: 'default',
                    ADOBE_COMMERCE_WEBSITE_CODE: 'base',
                    ADOBE_COMMERCE_STORE_CODE: 'main_website_store',
                },
            };
            // Mock fs.writeFile to fail for config.json specifically
            // This should NOT cause EDS setup to fail since config.json is generated post-mesh
            (fs.writeFile as jest.Mock).mockImplementation(async (filePath: string) => {
                if (filePath.includes('fstab.yaml')) {
                    return undefined;
                }
                if (filePath.includes('config.json')) {
                    throw new Error('Permission denied');
                }
                return undefined;
            });

            // When: Running setup
            const resultPromise = service.setupProject(paasConfig, mockProgressCallback);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            // Then: Should succeed (config.json not generated during EDS setup)
            expect(result.success).toBe(true);
        });

        it('should handle network error during code sync polling', async () => {
            // Given: Helix config is file-based (no API), code sync has network errors
            // Override beforeEach mock to simulate network errors on fetch
            mockFetch.mockReset();
            mockFetch.mockRejectedValue(new Error('Network error'));
            mockGitHubAppService.isAppInstalled.mockResolvedValue(false);

            // When: Running setup - attach error handler BEFORE advancing timers
            let thrownError: Error | undefined;
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback)
                .catch((error: Error) => {
                    thrownError = error;
                });

            await jest.advanceTimersByTimeAsync(130000);
            await resultPromise;

            // Then: Should throw GitHubAppNotInstalledError
            expect(thrownError).toBeInstanceOf(GitHubAppNotInstalledError);
            expect(thrownError?.message).toContain('GitHub App not installed');
        }, 15000);

        it('should handle code sync non-404 error response', async () => {
            // Given: Code sync returns 500 error (helix config is file-based, no API)
            // Override beforeEach mock to simulate server error
            mockFetch.mockReset();
            mockFetch.mockResolvedValue({ ok: false, status: 500 });
            mockGitHubAppService.isAppInstalled.mockResolvedValue(false);

            // When: Running setup - attach error handler BEFORE advancing timers
            let thrownError: Error | undefined;
            const resultPromise = service.setupProject(defaultConfig, mockProgressCallback)
                .catch((error: Error) => {
                    thrownError = error;
                });

            await jest.advanceTimersByTimeAsync(130000);
            await resultPromise;

            // Then: Should throw GitHubAppNotInstalledError
            expect(thrownError).toBeInstanceOf(GitHubAppNotInstalledError);
            expect(thrownError?.message).toContain('GitHub App not installed');
        }, 15000);

        it('should handle content copy without progress callback', async () => {
            // Given: Config without progress callback
            mockDaLiveContentOps.copyCitisignalContent!.mockResolvedValue({
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
            expect(mockDaLiveContentOps.copyCitisignalContent).toHaveBeenCalled();
        });
    });
});
