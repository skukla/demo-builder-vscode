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

// Mock path (partial - keep join and dirname working)
jest.mock('path', () => ({
    ...jest.requireActual('path'),
    join: jest.fn((...args: string[]) => args.join('/')),
    dirname: jest.fn((p: string) => p?.split('/').slice(0, -1).join('/') || ''),
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
import type { GitHubAppService } from '@/features/eds/services/githubAppService';
import type { GitHubServicesForPhases, PhaseProgressCallback } from '@/features/eds/services/edsSetupPhases';

describe('EDS Setup Phases - Sub-Progress Callbacks', () => {
    // Default test config
    const defaultConfig: EdsProjectConfig = {
        projectName: 'test-project',
        projectPath: '/test/projects/test-project',
        componentPath: '/test/projects/test-project/components/eds-storefront',
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
    let mockGitHubAppService: jest.Mocked<Partial<GitHubAppService>>;

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

        mockGitHubAppService = {
            isAppInstalled: jest.fn().mockResolvedValue(true),
            getInstallUrl: jest.fn().mockReturnValue('https://github.com/apps/test-app'),
        };

        // Default fetch to return success
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({}),
        });

        // Default fs.access to succeed
        mockFs.access.mockResolvedValue(undefined);

        // Default fs.mkdir to succeed
        mockFs.mkdir.mockResolvedValue(undefined);

        // Default fs.writeFile to succeed (for fstab.yaml generation)
        mockFs.writeFile.mockResolvedValue(undefined);

        // Default fs.readdir to return a mock directory listing
        mockFs.readdir.mockResolvedValue(['package.json', 'scripts', 'blocks', '.git'] as any);

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
        it('should call progress callback with "Generating fstab.yaml configuration..." message', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, mockGitHubAppService as any);

            const progressCallback = jest.fn();

            await phase.configure(defaultConfig, mockRepo, progressCallback);

            expect(progressCallback).toHaveBeenCalledWith('Generating fstab.yaml configuration...');
        });

        it('should call progress callback with "Verifying Helix config..." message', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, mockGitHubAppService as any);

            const progressCallback = jest.fn();

            await phase.configure(defaultConfig, mockRepo, progressCallback);

            expect(progressCallback).toHaveBeenCalledWith('Verifying Helix config...');
        });

        it('should call progress messages in correct order for configure', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, mockGitHubAppService as any);

            const messages: string[] = [];
            const progressCallback = jest.fn((msg: string) => messages.push(msg));

            await phase.configure(defaultConfig, mockRepo, progressCallback);

            expect(messages).toEqual([
                'Generating fstab.yaml configuration...',
                'Verifying Helix config...',
            ]);
        });

        it('should work without progress callback (optional parameter)', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, mockGitHubAppService as any);

            // Should not throw when no callback provided
            await expect(phase.configure(defaultConfig, mockRepo)).resolves.not.toThrow();
        });
    });

    describe('HelixConfigPhase.verifyCodeSync() Sub-Progress', () => {
        it('should call progress callback with "Checking code sync status..." message', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, mockGitHubAppService as any);

            const progressCallback = jest.fn();

            await phase.verifyCodeSync(defaultConfig, mockRepo, progressCallback);

            expect(progressCallback).toHaveBeenCalledWith('Checking code sync status...');
        });

        it('should work without progress callback (optional parameter)', async () => {
            const { HelixConfigPhase } = await import('@/features/eds/services/edsSetupPhases');
            const phase = new HelixConfigPhase(mockAuthService as any, mockLogger as any, mockGitHubAppService as any);

            // Should not throw when no callback provided
            await expect(phase.verifyCodeSync(defaultConfig, mockRepo)).resolves.not.toThrow();
        });
    });

    // Note: EdsProjectService Integration tests removed - class was refactored into edsSetupPhases.ts
    // Sub-progress callbacks are tested via the individual phase tests above
});
