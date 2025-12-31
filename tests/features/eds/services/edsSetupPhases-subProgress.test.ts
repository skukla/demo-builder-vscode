/**
 * Tests for EDS Setup Phase Sub-Progress Callbacks
 *
 * Verifies that phase methods report granular progress
 * during long-running operations like verification.
 */

import * as fs from 'fs/promises';

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

// Mock timeouts
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        EDS_HELIX_CONFIG: 30000,
        EDS_CODE_SYNC_POLL: 5000,
        EDS_CODE_SYNC_TOTAL: 125000,
        POLL_INITIAL_DELAY: 1000,
        POLL_MAX_DELAY: 10000,
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
import type { GitHubServicesForPhases, PhaseProgressCallback } from '@/features/eds/services/edsSetupPhases';

describe('EDS Setup Phases - Sub-Progress Callbacks', () => {
    // Default test config
    const defaultConfig: EdsProjectConfig = {
        projectName: 'test-project',
        projectPath: '/test/projects/test-project',
        repoName: 'test-site',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
        githubOwner: 'testuser',
        accsEndpoint: '',
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

        // Default fs.access to succeed
        mockFs.access.mockResolvedValue(undefined);

        // Default polling to succeed immediately
        mockPollUntilCondition.mockResolvedValue(undefined);
    });

    describe('GitHubRepoPhase.clone() Sub-Progress', () => {
        it('should call progress callback with "Cloning repository..." message', async () => {
            const { GitHubRepoPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new GitHubRepoPhase(
                mockGitHubServices,
                mockDaLiveOrgOps as any,
                mockLogger as any
            );

            const progressCallback = jest.fn();

            await phase.clone(mockRepo, defaultConfig, progressCallback);

            expect(progressCallback).toHaveBeenCalledWith('Cloning repository...');
        });

        it('should call progress callback with "Verifying clone integrity..." message', async () => {
            const { GitHubRepoPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new GitHubRepoPhase(
                mockGitHubServices,
                mockDaLiveOrgOps as any,
                mockLogger as any
            );

            const progressCallback = jest.fn();

            await phase.clone(mockRepo, defaultConfig, progressCallback);

            expect(progressCallback).toHaveBeenCalledWith('Verifying clone integrity...');
        });

        it('should call progress messages in correct order', async () => {
            const { GitHubRepoPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new GitHubRepoPhase(
                mockGitHubServices,
                mockDaLiveOrgOps as any,
                mockLogger as any
            );

            const messages: string[] = [];
            const progressCallback = jest.fn((msg: string) => messages.push(msg));

            await phase.clone(mockRepo, defaultConfig, progressCallback);

            expect(messages).toEqual([
                'Cloning repository...',
                'Verifying clone integrity...',
            ]);
        });

        it('should work without progress callback (optional parameter)', async () => {
            const { GitHubRepoPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new GitHubRepoPhase(
                mockGitHubServices,
                mockDaLiveOrgOps as any,
                mockLogger as any
            );

            // Should not throw when no callback provided
            await expect(phase.clone(mockRepo, defaultConfig)).resolves.not.toThrow();
        });
    });

    describe('HelixConfigPhase.configure() Sub-Progress', () => {
        it('should call progress callback with "Sending Helix configuration..." message', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any);

            const progressCallback = jest.fn();

            await phase.configure(defaultConfig, mockRepo, progressCallback);

            expect(progressCallback).toHaveBeenCalledWith('Sending Helix configuration...');
        });

        it('should call progress callback with "Verifying Helix config..." message', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any);

            const progressCallback = jest.fn();

            await phase.configure(defaultConfig, mockRepo, progressCallback);

            expect(progressCallback).toHaveBeenCalledWith('Verifying Helix config...');
        });

        it('should call progress messages in correct order for configure', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any);

            const messages: string[] = [];
            const progressCallback = jest.fn((msg: string) => messages.push(msg));

            await phase.configure(defaultConfig, mockRepo, progressCallback);

            expect(messages).toEqual([
                'Sending Helix configuration...',
                'Verifying Helix config...',
            ]);
        });

        it('should work without progress callback (optional parameter)', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any);

            // Should not throw when no callback provided
            await expect(phase.configure(defaultConfig, mockRepo)).resolves.not.toThrow();
        });
    });

    describe('HelixConfigPhase.verifyCodeSync() Sub-Progress', () => {
        it('should call progress callback with "Checking code sync status..." message', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any);

            const progressCallback = jest.fn();

            await phase.verifyCodeSync(defaultConfig, mockRepo, progressCallback);

            expect(progressCallback).toHaveBeenCalledWith('Checking code sync status...');
        });

        it('should work without progress callback (optional parameter)', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any);

            // Should not throw when no callback provided
            await expect(phase.verifyCodeSync(defaultConfig, mockRepo)).resolves.not.toThrow();
        });
    });

    describe('EdsProjectService Integration', () => {
        it('should report sub-progress messages through main progress callback', async () => {
            // This test verifies the integration by checking that EdsProjectService
            // passes sub-progress callbacks to the phase methods.
            // Since EdsProjectService creates its own phase instances internally,
            // we need to mock the phase classes at the module level.

            // Mock the phase classes before importing EdsProjectService
            const mockClone = jest.fn().mockImplementation(async (_repo, _config, onProgress) => {
                onProgress?.('Cloning repository...');
                onProgress?.('Verifying clone integrity...');
            });
            const mockConfigure = jest.fn().mockImplementation(async (_config, _repo, onProgress) => {
                onProgress?.('Sending Helix configuration...');
                onProgress?.('Verifying Helix config...');
            });
            const mockVerifyCodeSync = jest.fn().mockImplementation(async (_config, _repo, onProgress) => {
                onProgress?.('Checking code sync status...');
            });
            const mockCreateFromTemplate = jest.fn().mockResolvedValue(mockRepo);
            const mockGenerateEnvFile = jest.fn().mockResolvedValue(undefined);

            jest.doMock('@/features/eds/services/edsSetupPhases', () => ({
                GitHubRepoPhase: jest.fn().mockImplementation(() => ({
                    clone: mockClone,
                    createFromTemplate: mockCreateFromTemplate,
                })),
                HelixConfigPhase: jest.fn().mockImplementation(() => ({
                    configure: mockConfigure,
                    verifyCodeSync: mockVerifyCodeSync,
                })),
                ContentPhase: jest.fn().mockImplementation(() => ({
                    populateDaLiveContent: jest.fn().mockResolvedValue(undefined),
                    cloneIngestionTool: jest.fn().mockResolvedValue(undefined),
                })),
                EnvConfigPhase: jest.fn().mockImplementation(() => ({
                    generateEnvFile: mockGenerateEnvFile,
                })),
                generatePreviewUrl: jest.fn().mockReturnValue('https://preview.example.com'),
                generateLiveUrl: jest.fn().mockReturnValue('https://live.example.com'),
            }));

            // Clear the module cache and re-import
            jest.resetModules();
            const { EdsProjectService } = await import('@/features/eds/services/edsProjectService');

            const mockComponentManager = {
                installComponent: jest.fn().mockResolvedValue({ success: true }),
            };

            const mockDaLiveContentOps = {
                copyCitisignalContent: jest.fn().mockResolvedValue({
                    success: true,
                    copiedFiles: [],
                    failedFiles: [],
                    totalFiles: 0,
                }),
            };

            const service = new EdsProjectService(
                mockGitHubServices as any,
                {
                    orgOperations: mockDaLiveOrgOps as any,
                    contentOperations: mockDaLiveContentOps as any,
                },
                mockAuthService as any,
                mockComponentManager as any,
                mockLogger as any
            );

            const progressMessages: string[] = [];
            const progressCallback = jest.fn((_phase, _progress, message) => {
                progressMessages.push(message);
            });

            // Run setup with skipContent and skipTools to minimize test surface
            await service.setupProject(
                { ...defaultConfig, skipContent: true, skipTools: true },
                progressCallback
            );

            // Should include sub-progress messages from phases
            expect(progressMessages).toContain('Cloning repository...');
            expect(progressMessages).toContain('Verifying clone integrity...');
            expect(progressMessages).toContain('Sending Helix configuration...');
            expect(progressMessages).toContain('Verifying Helix config...');
            expect(progressMessages).toContain('Checking code sync status...');
        });
    });
});
