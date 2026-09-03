/**
 * AddonUpdateChecker — what it hands the GitHub client and how each answer is read.
 *
 * The sibling suite drives the REAL githubApiClient through a fetch fake and pins
 * the results. This one mocks the client so the ARGUMENTS are the subject: which
 * branch is asked for per library and for the Inspector SDK (the real SDK_SOURCE),
 * which libraries are refused before any request and which still get checked after
 * a sibling fails, what a failed or empty comparison turns into, and that a
 * throwing lookup costs only its own item.
 */

jest.mock('@/features/updates/services/githubApiClient', () => ({
    getLatestBranchCommit: jest.fn(),
    compareCommits: jest.fn(),
}));

import { makeCheckerSecrets, makeLibrary, makeProject } from './addonUpdateChecker.testUtils';
import { SDK_SOURCE } from '@/features/eds/services/inspectorHelpers';
import { AddonUpdateChecker } from '@/features/updates/services/addonUpdateChecker';
import { compareCommits, getLatestBranchCommit } from '@/features/updates/services/githubApiClient';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import { createMockLogger } from '../../../helpers/loggerFake';

const mockGetLatestBranchCommit = getLatestBranchCommit as jest.Mock;
const mockCompareCommits = compareCommits as jest.Mock;

const OLD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);

let logger: ReturnType<typeof createMockLogger>;
let secrets: ReturnType<typeof makeCheckerSecrets>;
let checker: AddonUpdateChecker;

/** A library named `name`, sourced from acme/<name>, recorded at OLD. */
function library(
    name: string,
    overrides: Partial<InstalledBlockLibrary> = {}
): InstalledBlockLibrary {
    return makeLibrary({
        name,
        source: { owner: 'acme', repo: name, branch: 'main' },
        commitSha: OLD,
        ...overrides,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    logger = createMockLogger();
    secrets = makeCheckerSecrets();
    checker = new AddonUpdateChecker(secrets, logger);
    mockGetLatestBranchCommit.mockResolvedValue(NEW);
    mockCompareCommits.mockResolvedValue({ ahead_by: 3 });
});

describe('checkBlockLibraries', () => {
    it('an empty library list asks nothing', async () => {
        await expect(
            checker.checkBlockLibraries(makeProject({ installedBlockLibraries: [] }))
        ).resolves.toEqual([]);

        expect(mockGetLatestBranchCommit).not.toHaveBeenCalled();
    });

    it("asks for each library's own branch and compares its recorded SHA against the answer", async () => {
        const blocks = library('blocks', {
            source: { owner: 'acme', repo: 'blocks', branch: 'develop' },
        });

        const results = await checker.checkBlockLibraries(
            makeProject({ installedBlockLibraries: [blocks] })
        );

        expect(mockGetLatestBranchCommit).toHaveBeenCalledWith(
            secrets,
            'acme',
            'blocks',
            'develop'
        );
        expect(mockCompareCommits).toHaveBeenCalledWith(secrets, 'acme', 'blocks', OLD, NEW);
        expect(results).toEqual([{ library: blocks, latestCommit: NEW, commitsBehind: 3 }]);
    });

    it.each([
        ['owner', { owner: '', repo: 'blocks', branch: 'main' }],
        ['repo', { owner: 'acme', repo: '', branch: 'main' }],
        ['branch', { owner: 'acme', repo: 'blocks', branch: '' }],
    ])(
        'a library missing its source %s is skipped, and the next one is still checked',
        async (_field, source) => {
            const broken = library('broken', { source });
            const fine = library('fine');

            const results = await checker.checkBlockLibraries(
                makeProject({ installedBlockLibraries: [broken, fine] })
            );

            expect(mockGetLatestBranchCommit).toHaveBeenCalledTimes(1);
            expect(mockGetLatestBranchCommit).toHaveBeenCalledWith(secrets, 'acme', 'fine', 'main');
            expect(results.map((r) => r.library.name)).toEqual(['fine']);
        }
    );

    it('a library whose branch cannot be read is skipped without a comparison', async () => {
        mockGetLatestBranchCommit.mockResolvedValue(null);

        const results = await checker.checkBlockLibraries(
            makeProject({ installedBlockLibraries: [library('blocks')] })
        );

        expect(results).toEqual([]);
        expect(mockCompareCommits).not.toHaveBeenCalled();
    });

    it('a library already at the branch head is skipped without a comparison', async () => {
        mockGetLatestBranchCommit.mockResolvedValue(OLD);

        const results = await checker.checkBlockLibraries(
            makeProject({ installedBlockLibraries: [library('blocks')] })
        );

        expect(results).toEqual([]);
        expect(mockCompareCommits).not.toHaveBeenCalled();
    });

    it('a library behind whose comparison fails is still listed, zero commits behind', async () => {
        mockCompareCommits.mockResolvedValue(null);
        const blocks = library('blocks');

        const results = await checker.checkBlockLibraries(
            makeProject({ installedBlockLibraries: [blocks] })
        );

        expect(results).toEqual([{ library: blocks, latestCommit: NEW, commitsBehind: 0 }]);
    });

    it('a throwing lookup costs only its own library', async () => {
        mockGetLatestBranchCommit
            .mockRejectedValueOnce(new Error('socket hang up'))
            .mockResolvedValueOnce(NEW);
        const fine = library('fine');

        const results = await checker.checkBlockLibraries(
            makeProject({ installedBlockLibraries: [library('broken'), fine] })
        );

        expect(results).toEqual([{ library: fine, latestCommit: NEW, commitsBehind: 3 }]);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});

describe('checkInspectorSdk', () => {
    const installed = {
        installedInspectorSdk: { commitSha: OLD, installedAt: '2025-01-01T00:00:00Z' },
    };

    it('asks for the SDK source branch and compares the installed SHA against it', async () => {
        const result = await checker.checkInspectorSdk(makeProject(installed));

        expect(mockGetLatestBranchCommit).toHaveBeenCalledWith(
            secrets,
            SDK_SOURCE.owner,
            SDK_SOURCE.repo,
            SDK_SOURCE.branch
        );
        expect(mockCompareCommits).toHaveBeenCalledWith(
            secrets,
            SDK_SOURCE.owner,
            SDK_SOURCE.repo,
            OLD,
            NEW
        );
        expect(result).toEqual({
            hasUpdate: true,
            currentCommit: OLD,
            latestCommit: NEW,
            commitsBehind: 3,
        });
    });

    it('no SDK installed asks nothing', async () => {
        await expect(
            checker.checkInspectorSdk(makeProject({ installedInspectorSdk: undefined }))
        ).resolves.toBeNull();

        expect(mockGetLatestBranchCommit).not.toHaveBeenCalled();
    });

    it('a branch that cannot be read is null: a warning, no error, no comparison made', async () => {
        mockGetLatestBranchCommit.mockResolvedValue(null);

        await expect(checker.checkInspectorSdk(makeProject(installed))).resolves.toBeNull();

        expect(mockCompareCommits).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('already at the branch head: no update, with no comparison made', async () => {
        mockGetLatestBranchCommit.mockResolvedValue(OLD);

        const result = await checker.checkInspectorSdk(makeProject(installed));

        expect(result).toEqual({
            hasUpdate: false,
            currentCommit: OLD,
            latestCommit: OLD,
            commitsBehind: 0,
        });
        expect(mockCompareCommits).not.toHaveBeenCalled();
    });

    it('behind, but the comparison fails: still an update, zero commits behind', async () => {
        mockCompareCommits.mockResolvedValue(null);

        const result = await checker.checkInspectorSdk(makeProject(installed));

        expect(result).toEqual({
            hasUpdate: true,
            currentCommit: OLD,
            latestCommit: NEW,
            commitsBehind: 0,
        });
    });

    it('a throwing lookup answers null rather than rejecting', async () => {
        mockGetLatestBranchCommit.mockRejectedValue(new Error('boom'));

        await expect(checker.checkInspectorSdk(makeProject(installed))).resolves.toBeNull();
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});
