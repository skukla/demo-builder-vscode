/**
 * Unit tests for AddonUpdateChecker
 * Tests block library and Inspector SDK update detection via GitHub API
 */

import {
    AddonUpdateChecker,
    BlockLibraryUpdateResult,
    InspectorSdkUpdateResult,
} from '@/features/updates/services/addonUpdateChecker';
import type { Project } from '@/types';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import type { Logger } from '@/types/logger';

// Mock modules
jest.mock('vscode', () => ({}), { virtual: true });
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000 },
}));
jest.mock('@/features/eds/services/inspectorHelpers', () => ({
    SDK_SOURCE: {
        owner: 'skukla',
        repo: 'demo-inspector-sdk',
        branch: 'main',
        srcDir: 'src',
        destDir: 'scripts/demo-inspector-sdk',
    },
}));

// Mock fetch globally
global.fetch = jest.fn() as jest.Mock;

describe('AddonUpdateChecker', () => {
    let checker: AddonUpdateChecker;
    let mockLogger: Logger;
    let mockSecrets: { get: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = {
            trace: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as unknown as Logger;

        mockSecrets = {
            get: jest.fn().mockResolvedValue('fake-github-token'),
        };

        checker = new AddonUpdateChecker(mockSecrets as any, mockLogger);
    });

    // -------------------------------------------------------------------------
    // Helper factories
    // -------------------------------------------------------------------------

    function makeLibrary(overrides: Partial<InstalledBlockLibrary> = {}): InstalledBlockLibrary {
        return {
            name: 'Test Library',
            source: { owner: 'acme', repo: 'blocks', branch: 'main' },
            commitSha: 'aaa111',
            blockIds: ['hero', 'footer'],
            installedAt: '2025-01-01T00:00:00Z',
            ...overrides,
        };
    }

    function makeProject(overrides: Partial<Project> = {}): Project {
        return {
            name: 'test-project',
            created: new Date(),
            lastModified: new Date(),
            path: '/tmp/test',
            status: 'ready',
            ...overrides,
        };
    }

    /** Mock fetch to respond to branches and compare endpoints */
    function mockGitHubApi(
        branchSha: string | null,
        behindBy: number = 0,
        branchStatus: number = 200,
    ): void {
        (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
            if (url.includes('/branches/')) {
                if (branchStatus !== 200) {
                    return { ok: false, status: branchStatus, json: async () => ({}) };
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ commit: { sha: branchSha } }),
                };
            }
            if (url.includes('/compare/')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ ahead_by: behindBy }),
                };
            }
            return { ok: false, status: 404 };
        });
    }

    // =========================================================================
    // checkBlockLibraries
    // =========================================================================

    describe('checkBlockLibraries', () => {
        it('should detect outdated library when SHA differs', async () => {
            const lib = makeLibrary({ commitSha: 'aaa111' });
            const project = makeProject({ installedBlockLibraries: [lib] });
            mockGitHubApi('bbb222', 5);

            const results = await checker.checkBlockLibraries(project);

            expect(results).toHaveLength(1);
            expect(results[0]).toEqual<BlockLibraryUpdateResult>({
                library: lib,
                latestCommit: 'bbb222',
                commitsBehind: 5,
            });
        });

        it('should return empty array when library is up to date', async () => {
            const lib = makeLibrary({ commitSha: 'aaa111' });
            const project = makeProject({ installedBlockLibraries: [lib] });
            mockGitHubApi('aaa111'); // same SHA

            const results = await checker.checkBlockLibraries(project);

            expect(results).toEqual([]);
        });

        it('should return empty array when project has no installed libraries', async () => {
            const project = makeProject({ installedBlockLibraries: undefined });

            const results = await checker.checkBlockLibraries(project);

            expect(results).toEqual([]);
        });

        it('should skip library with missing source and log warning', async () => {
            const lib = makeLibrary({ source: undefined as any });
            const project = makeProject({ installedBlockLibraries: [lib] });

            const results = await checker.checkBlockLibraries(project);

            expect(results).toEqual([]);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Updates]'),
            );
        });

        it('should handle GitHub API failure gracefully and return empty', async () => {
            const lib = makeLibrary();
            const project = makeProject({ installedBlockLibraries: [lib] });
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            const results = await checker.checkBlockLibraries(project);

            expect(results).toEqual([]);
            expect(mockLogger.warn).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // checkInspectorSdk
    // =========================================================================

    describe('checkInspectorSdk', () => {
        it('should detect outdated SDK when SHA differs', async () => {
            const project = makeProject({
                installedInspectorSdk: {
                    commitSha: 'old111',
                    installedAt: '2025-01-01T00:00:00Z',
                },
            });
            mockGitHubApi('new222', 3);

            const result = await checker.checkInspectorSdk(project);

            expect(result).toEqual<InspectorSdkUpdateResult>({
                hasUpdate: true,
                currentCommit: 'old111',
                latestCommit: 'new222',
                commitsBehind: 3,
            });
        });

        it('should report up-to-date SDK when SHA matches', async () => {
            const project = makeProject({
                installedInspectorSdk: {
                    commitSha: 'same111',
                    installedAt: '2025-01-01T00:00:00Z',
                },
            });
            mockGitHubApi('same111');

            const result = await checker.checkInspectorSdk(project);

            expect(result).toEqual<InspectorSdkUpdateResult>({
                hasUpdate: false,
                currentCommit: 'same111',
                latestCommit: 'same111',
                commitsBehind: 0,
            });
        });

        it('should return null when project has no SDK installed', async () => {
            const project = makeProject({ installedInspectorSdk: undefined });

            const result = await checker.checkInspectorSdk(project);

            expect(result).toBeNull();
        });

        it('should return null on 403 rate limit', async () => {
            const project = makeProject({
                installedInspectorSdk: {
                    commitSha: 'old111',
                    installedAt: '2025-01-01T00:00:00Z',
                },
            });
            mockGitHubApi(null, 0, 403);

            const result = await checker.checkInspectorSdk(project);

            expect(result).toBeNull();
        });
    });
});
