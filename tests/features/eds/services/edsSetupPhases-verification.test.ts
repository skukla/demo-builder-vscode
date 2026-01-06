/**
 * Tests for EDS Setup Phase Verification Logic
 *
 * Priority 1: Helix config verification
 * Priority 2: PollingService integration
 * Priority 3: Post-clone spot check
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Mock vscode
jest.mock('vscode');

// Mock fs/promises
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock path (partial - keep join working)
jest.mock('path', () => ({
    ...jest.requireActual('path'),
    join: jest.fn((...args: string[]) => args.join('/')),
}));

// Mock logging
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => mockLogger),
}));

// Mock PollingService
const mockPollUntilCondition = jest.fn();
jest.mock('@/core/shell/pollingService', () => ({
    PollingService: jest.fn().mockImplementation(() => ({
        pollUntilCondition: mockPollUntilCondition,
    })),
}));

// Mock GitHubAppService
const mockIsAppInstalled = jest.fn().mockResolvedValue(false);
const mockGetInstallUrl = jest.fn().mockReturnValue('https://admin.hlx.page/github/install/owner/repo');
jest.mock('@/features/eds/services/githubAppService', () => ({
    GitHubAppService: jest.fn().mockImplementation(() => ({
        isAppInstalled: mockIsAppInstalled,
        getInstallUrl: mockGetInstallUrl,
    })),
}));

// Mock timeouts - uses semantic categories
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000, // Standard API calls (replaces EDS_HELIX_CONFIG)
        LONG: 180000, // Complex operations (replaces EDS_CODE_SYNC_TOTAL)
        POLL: {
            INITIAL: 500,
            MAX: 5000,
            INTERVAL: 1000,
            PROCESS_CHECK: 100,
        },
    },
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Import types
import type { EdsProjectConfig, GitHubRepo } from '@/features/eds/services/types';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { GitHubRepoOperations } from '@/features/eds/services/githubRepoOperations';
import type { GitHubTokenService } from '@/features/eds/services/githubTokenService';
import type { DaLiveOrgOperations } from '@/features/eds/services/daLiveOrgOperations';
import type { GitHubServicesForPhases } from '@/features/eds/services/edsSetupPhases';

describe('EDS Setup Phases - Verification', () => {
    // Default test config
    const defaultConfig: EdsProjectConfig = {
        projectName: 'test-project',
        projectPath: '/test/projects/test-project',
        repoName: 'test-site',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
        githubOwner: 'testuser',
    };

    const mockRepo: GitHubRepo = {
        id: 12345,
        name: 'test-site',
        fullName: 'testuser/test-site',
        htmlUrl: 'https://github.com/testuser/test-site',
        cloneUrl: 'https://github.com/testuser/test-site.git',
        defaultBranch: 'main',
        isPrivate: false,
    };

    let mockAuthService: jest.Mocked<Partial<AuthenticationService>>;
    let mockRepoOperations: jest.Mocked<Partial<GitHubRepoOperations>>;
    let mockTokenService: jest.Mocked<Partial<GitHubTokenService>>;
    let mockGitHubServices: GitHubServicesForPhases;
    let mockDaLiveOrgOps: jest.Mocked<Partial<DaLiveOrgOperations>>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockAuthService = {
            getTokenManager: jest.fn().mockReturnValue({
                getAccessToken: jest.fn().mockResolvedValue('test-token'),
            }),
        };

        mockRepoOperations = {
            cloneRepository: jest.fn().mockResolvedValue(undefined),
        };

        mockTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'test-token' }),
        };

        mockGitHubServices = {
            tokenService: mockTokenService as any,
            repoOperations: mockRepoOperations as any,
        };

        mockDaLiveOrgOps = {
            deleteSite: jest.fn().mockResolvedValue(undefined),
        };

        // Default fetch to return success
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({}),
        });

        // Default polling to succeed immediately
        mockPollUntilCondition.mockImplementation(async (checkFn) => {
            const result = await checkFn();
            if (!result) {
                throw new Error('Polling condition not met');
            }
        });
    });

    describe('Priority 1: Helix Config Verification', () => {
        it('should verify Helix config exists after configuration', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, { isAppInstalled: mockIsAppInstalled, getInstallUrl: mockGetInstallUrl } as any);

            // Configure should succeed
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

            await phase.configure(defaultConfig, mockRepo);

            // Verify the config URL was called with POST
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('admin.hlx.page/config'),
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('should call verifyHelixConfig after configure', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, { isAppInstalled: mockIsAppInstalled, getInstallUrl: mockGetInstallUrl } as any);

            // Mock configure success, then verify success
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200 }) // configure POST
                .mockResolvedValueOnce({ ok: true, status: 200 }); // verify GET

            // PollingService should be called for verification
            mockPollUntilCondition.mockImplementation(async (checkFn) => {
                await checkFn();
            });

            await phase.configure(defaultConfig, mockRepo);

            // Should have used PollingService for verification
            expect(mockPollUntilCondition).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({
                    name: expect.stringContaining('helix-config'),
                })
            );
        });

        it('should throw EdsProjectError if Helix config verification fails', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const { EdsProjectError } = await import('@/features/eds/services/types');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, { isAppInstalled: mockIsAppInstalled, getInstallUrl: mockGetInstallUrl } as any);

            // Configure succeeds but verification fails
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 }); // configure POST
            mockPollUntilCondition.mockRejectedValueOnce(new Error('Polling timeout'));

            await expect(phase.configure(defaultConfig, mockRepo)).rejects.toThrow(EdsProjectError);
        });

        it('should verify config at correct URL', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, { isAppInstalled: mockIsAppInstalled, getInstallUrl: mockGetInstallUrl } as any);

            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockPollUntilCondition.mockImplementation(async (checkFn) => {
                await checkFn();
            });

            await phase.configure(defaultConfig, mockRepo);

            // The polling check function should fetch the config URL
            const pollCall = mockPollUntilCondition.mock.calls[0];
            const checkFn = pollCall[0];
            await checkFn();

            // Should have fetched config with GET
            const getCalls = mockFetch.mock.calls.filter(
                call => call[1]?.method === 'GET' || !call[1]?.method
            );
            expect(getCalls.length).toBeGreaterThan(0);
        });
    });

    describe('Priority 2: PollingService Integration', () => {
        it('should use PollingService for code sync verification', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, { isAppInstalled: mockIsAppInstalled, getInstallUrl: mockGetInstallUrl } as any);

            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockPollUntilCondition.mockResolvedValue(undefined);

            await phase.verifyCodeSync(defaultConfig, mockRepo);

            expect(mockPollUntilCondition).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({
                    name: expect.stringContaining('code-sync'),
                    maxAttempts: expect.any(Number),
                    timeout: expect.any(Number),
                })
            );
        });

        it('should pass correct options to PollingService', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, { isAppInstalled: mockIsAppInstalled, getInstallUrl: mockGetInstallUrl } as any);

            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockPollUntilCondition.mockResolvedValue(undefined);

            await phase.verifyCodeSync(defaultConfig, mockRepo);

            const pollOptions = mockPollUntilCondition.mock.calls[0][1];
            expect(pollOptions).toMatchObject({
                name: expect.any(String),
                maxAttempts: expect.any(Number),
                timeout: expect.any(Number),
            });
        });

        it('should check correct code URL in polling function', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, { isAppInstalled: mockIsAppInstalled, getInstallUrl: mockGetInstallUrl } as any);

            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            mockPollUntilCondition.mockImplementation(async (checkFn) => {
                await checkFn();
            });

            await phase.verifyCodeSync(defaultConfig, mockRepo);

            // Verify fetch was called with code URL
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('admin.hlx.page/code/testuser/test-site'),
                expect.any(Object)
            );
        });

        it('should throw EdsProjectError on polling timeout', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const { EdsProjectError } = await import('@/features/eds/services/types');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, { isAppInstalled: mockIsAppInstalled, getInstallUrl: mockGetInstallUrl } as any);

            mockPollUntilCondition.mockRejectedValue(new Error('Polling timeout'));

            await expect(phase.verifyCodeSync(defaultConfig, mockRepo)).rejects.toThrow(EdsProjectError);
        });
    });

    describe('Priority 3: Post-Clone Spot Check', () => {
        it('should verify key files exist after clone', async () => {
            const { GitHubRepoPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new GitHubRepoPhase(
                mockGitHubServices,
                mockDaLiveOrgOps as any,
                mockLogger as any
            );

            // Mock fs.access to succeed (file exists)
            mockFs.access.mockResolvedValue(undefined);

            await phase.clone(mockRepo, defaultConfig);

            // Should check for key files
            expect(mockFs.access).toHaveBeenCalledWith(
                expect.stringContaining('scripts/aem.js')
            );
        });

        it('should check for package.json after clone', async () => {
            const { GitHubRepoPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new GitHubRepoPhase(
                mockGitHubServices,
                mockDaLiveOrgOps as any,
                mockLogger as any
            );

            mockFs.access.mockResolvedValue(undefined);

            await phase.clone(mockRepo, defaultConfig);

            expect(mockFs.access).toHaveBeenCalledWith(
                expect.stringContaining('package.json')
            );
        });

        it('should throw EdsProjectError if key file missing', async () => {
            const { GitHubRepoPhase } = await import('@/features/eds/services/edsSetupPhases');
            const { EdsProjectError } = await import('@/features/eds/services/types');
            const phase = new GitHubRepoPhase(
                mockGitHubServices,
                mockDaLiveOrgOps as any,
                mockLogger as any
            );

            // Clone succeeds but file check fails
            mockRepoOperations.cloneRepository!.mockResolvedValue(undefined);
            mockFs.access.mockRejectedValue(new Error('ENOENT'));

            await expect(phase.clone(mockRepo, defaultConfig)).rejects.toThrow(EdsProjectError);
        });

        it('should include missing file name in error message', async () => {
            const { GitHubRepoPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new GitHubRepoPhase(
                mockGitHubServices,
                mockDaLiveOrgOps as any,
                mockLogger as any
            );

            mockRepoOperations.cloneRepository!.mockResolvedValue(undefined);
            mockFs.access.mockRejectedValue(new Error('ENOENT'));

            await expect(phase.clone(mockRepo, defaultConfig)).rejects.toThrow(/package\.json|aem\.js/);
        });
    });

    describe('Error Handling Integration', () => {
        it('should throw GitHubAppNotInstalledError when app not installed and polling fails', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const { GitHubAppNotInstalledError } = await import('@/features/eds/services/types');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, { isAppInstalled: mockIsAppInstalled, getInstallUrl: mockGetInstallUrl } as any);

            mockPollUntilCondition.mockRejectedValue(new Error('Network error'));
            mockIsAppInstalled.mockResolvedValue(false); // App not installed

            try {
                await phase.verifyCodeSync(defaultConfig, mockRepo);
                throw new Error('Should have thrown GitHubAppNotInstalledError');
            } catch (error: any) {
                expect(error).toBeInstanceOf(GitHubAppNotInstalledError);
                expect(error.phase).toBe('code-sync');
                expect(error.installUrl).toBeDefined();
            }
        });

        it('should throw EdsProjectError when app is installed but polling fails', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, { isAppInstalled: mockIsAppInstalled, getInstallUrl: mockGetInstallUrl } as any);

            const originalError = new Error('Network error');
            mockPollUntilCondition.mockRejectedValue(originalError);
            mockIsAppInstalled.mockResolvedValue(true); // App is installed, so it's a real error

            try {
                await phase.verifyCodeSync(defaultConfig, mockRepo);
                throw new Error('Should have thrown EdsProjectError');
            } catch (error: any) {
                // EdsProjectError with phase and cause
                expect(error.phase).toBe('code-sync');
                expect(error.message).toContain('Code sync timeout');
            }
        });
    });
});
