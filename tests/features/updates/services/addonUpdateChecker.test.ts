/**
 * Unit tests for AddonUpdateChecker
 * Tests block library update detection via GitHub API
 */

import * as vscode from 'vscode';
import {
    AddonUpdateChecker,
    BlockLibraryUpdateResult,
} from '@/features/updates/services/addonUpdateChecker';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { makeCheckerSecrets, makeLibrary, makeProject } from './addonUpdateChecker.testUtils';

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
            if (url.includes('/commits/')) {
                if (branchStatus !== 200) {
                    return { ok: false, status: branchStatus, json: async () => ({}) };
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ sha: branchSha }),
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
    // A repository the builder owns ships by release; anything else follows its branch
    // =========================================================================

    describe('where a library is read', () => {
        const OWNED = { owner: 'skukla', repo: 'demo-builder-block-library', branch: 'main' };
        const OWNED_API = 'https://api.github.com/repos/skukla/demo-builder-block-library';

        /** Answers every commit asked for, so only the code's choice of ref can decide the outcome. */
        function mockReleaseApi(latestRelease: { status: number; body: unknown }): void {
            (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
                if (url.includes('/releases/latest')) {
                    const { status, body } = latestRelease;
                    return { ok: status === 200, status, json: async () => body };
                }
                if (url.includes('/commits/')) {
                    return { ok: true, status: 200, json: async () => ({ sha: 'bbb222' }) };
                }
                if (url.includes('/compare/')) {
                    return { ok: true, status: 200, json: async () => ({ ahead_by: 2 }) };
                }
                return { ok: false, status: 404, json: async () => ({}) };
            });
        }

        const askedFor = (): string[] => (global.fetch as jest.Mock).mock.calls.map(([url]) => String(url));

        beforeEach(() => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: jest.fn(() => 'stable') });
        });

        it('checks an owned library at its newest release, and says which', async () => {
            const lib = makeLibrary({ source: OWNED, commitSha: 'aaa111' });
            mockReleaseApi({ status: 200, body: { tag_name: 'v0.2.0' } });

            const results = await checker.checkBlockLibraries(makeProject({ installedBlockLibraries: [lib] }));

            expect(results).toStrictEqual<BlockLibraryUpdateResult[]>([
                { library: lib, latestCommit: 'bbb222', commitsBehind: 2, version: '0.2.0' },
            ]);
            expect(askedFor()).toContain(`${OWNED_API}/commits/v0.2.0`);
            expect(askedFor()).not.toContain(`${OWNED_API}/commits/main`);
        });

        it('offers nothing for an owned library with no release, and reads no commit', async () => {
            const lib = makeLibrary({ source: OWNED, commitSha: 'aaa111' });
            mockReleaseApi({ status: 404, body: {} });

            const results = await checker.checkBlockLibraries(makeProject({ installedBlockLibraries: [lib] }));

            expect(results).toStrictEqual([]);
            expect(askedFor()).toContain(`${OWNED_API}/releases/latest`);
            expect(askedFor().filter((url) => url.includes('/commits/'))).toStrictEqual([]);
        });

        it('follows the branch of a library the builder does not own, and looks up no release', async () => {
            const lib = makeLibrary({ commitSha: 'aaa111' });
            mockReleaseApi({ status: 200, body: { tag_name: 'v9.9.9' } });

            const results = await checker.checkBlockLibraries(makeProject({ installedBlockLibraries: [lib] }));

            expect(results).toStrictEqual<BlockLibraryUpdateResult[]>([
                { library: lib, latestCommit: 'bbb222', commitsBehind: 2 },
            ]);
            expect(askedFor()).toContain('https://api.github.com/repos/acme/blocks/commits/main');
            expect(askedFor().filter((url) => url.includes('/releases'))).toStrictEqual([]);
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
                if (url.includes('/commits/')) {
                    return { ok: true, status: 200, json: async () => ({ sha: 'bbb222' }) };
                }
                if (url.includes('/compare/')) {
                    return { ok: true, status: 200, json: async () => ({ ahead_by: 1, ...(files ? { files } : {}) }) };
                }
                return { ok: false, status: 404 };
            });
        }

        const libraryProject = () => makeProject({ installedBlockLibraries: [makeLibrary({ commitSha: 'aaa111' })] });

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
    });
});
