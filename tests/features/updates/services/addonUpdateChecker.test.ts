/**
 * Unit tests for AddonUpdateChecker
 * Tests block library and Inspector SDK update detection via GitHub API
 */

import {
    AddonUpdateChecker,
    BlockLibraryUpdateResult,
    InspectorSdkUpdateResult,
} from '@/features/updates/services/addonUpdateChecker';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { makeCheckerSecrets, makeLibrary, makeProject } from './addonUpdateChecker.testUtils';
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
global.fetch = jest.fn();

describe('AddonUpdateChecker', () => {
    let checker: AddonUpdateChecker;
    let mockLogger: Logger;
    let mockSecrets: ReturnType<typeof makeCheckerSecrets>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = createMockLogger() as unknown as Logger;

        mockSecrets = makeCheckerSecrets();

        checker = new AddonUpdateChecker(mockSecrets, mockLogger);
    });

    /** Mock fetch to respond to branches and compare endpoints */
    function mockGitHubApi(
        branchSha: string | null,
        behindBy: number = 0,
        branchStatus: number = 200
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

            expect(results).toStrictEqual([]);
        });

        it('should return empty array when project has no installed libraries', async () => {
            const project = makeProject({ installedBlockLibraries: undefined });

            const results = await checker.checkBlockLibraries(project);

            expect(results).toStrictEqual([]);
        });

        it('should skip library with missing source and log warning', async () => {
            const lib = makeLibrary({ source: undefined });
            const project = makeProject({ installedBlockLibraries: [lib] });

            const results = await checker.checkBlockLibraries(project);

            expect(results).toStrictEqual([]);
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('[Updates]'));
        });

        it('should handle GitHub API failure gracefully and return empty', async () => {
            const lib = makeLibrary();
            const project = makeProject({ installedBlockLibraries: [lib] });
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            const results = await checker.checkBlockLibraries(project);

            expect(results).toStrictEqual([]);
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

    // =========================================================================
    // Only a change to what the install copies is an update (2026-10-20: a CI
    // workflow added to the block library offered "1 commit behind" on every
    // project that had it, with no block changed)
    // =========================================================================

    describe('a new commit that changes nothing the install copies', () => {
        /** The compare answer's `files`, as GitHub lists them (filename, and the old name of a rename). */
        function mockCompareFiles(files: Array<{ filename: string; previous_filename?: string }> | undefined): void {
            (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
                if (url.includes('/branches/')) {
                    return { ok: true, status: 200, json: async () => ({ commit: { sha: 'bbb222' } }) };
                }
                if (url.includes('/compare/')) {
                    return { ok: true, status: 200, json: async () => ({ ahead_by: 1, ...(files ? { files } : {}) }) };
                }
                return { ok: false, status: 404 };
            });
        }

        const libraryProject = () => makeProject({ installedBlockLibraries: [makeLibrary({ commitSha: 'aaa111' })] });
        const sdkProject = () =>
            makeProject({ installedInspectorSdk: { commitSha: 'aaa111', installedAt: '2025-01-01T00:00:00Z' } });

        it('is not a library update when only CI and package.json changed', async () => {
            mockCompareFiles([{ filename: '.github/workflows/ci.yml' }, { filename: 'package.json' }]);

            expect(await checker.checkBlockLibraries(libraryProject())).toStrictEqual([]);
        });

        it.each(['blocks/hero/hero.js', 'component-definition.json', 'component-filters.json', 'component-models.json'])(
            'is a library update when %s changed',
            async (filename) => {
                mockCompareFiles([{ filename: 'package.json' }, { filename }]);

                expect(await checker.checkBlockLibraries(libraryProject())).toHaveLength(1);
            },
        );

        it('is a library update when a block file was renamed out of blocks/', async () => {
            mockCompareFiles([{ filename: 'archive/hero.js', previous_filename: 'blocks/hero/hero.js' }]);

            expect(await checker.checkBlockLibraries(libraryProject())).toHaveLength(1);
        });

        // Unknown is not "nothing changed": an update hidden by a missing list is worse
        // than one offered for nothing.
        it('is a library update when GitHub sends no file list, or a full one', async () => {
            mockCompareFiles(undefined);
            expect(await checker.checkBlockLibraries(libraryProject())).toHaveLength(1);

            mockCompareFiles(Array.from({ length: 300 }, (_, i) => ({ filename: `docs/page-${i}.md` })));
            expect(await checker.checkBlockLibraries(libraryProject())).toHaveLength(1);
        });

        it('is not an SDK update when only files outside src/ changed', async () => {
            mockCompareFiles([{ filename: '.github/workflows/ci.yml' }, { filename: 'src/README.md' }]);

            expect(await checker.checkInspectorSdk(sdkProject())).toMatchObject({ hasUpdate: false });
        });

        it('is an SDK update when a src/ script changed', async () => {
            mockCompareFiles([{ filename: 'src/inspector.js' }]);

            expect(await checker.checkInspectorSdk(sdkProject())).toMatchObject({ hasUpdate: true, commitsBehind: 1 });
        });
    });
});
