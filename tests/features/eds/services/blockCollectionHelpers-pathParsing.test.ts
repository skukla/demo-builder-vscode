/**
 * What counts as a BLOCK, and what order the ids come back in.
 *
 * `installBlockCollections` decides three times whether a repo path names a
 * block, using the same rule each time: at least three segments, and the first
 * is `blocks`. It applies that rule to the destination repo (to protect blocks
 * the template already installed), to the source repo (to discover what a
 * library offers), and again when selecting which FILES to copy. Only the third
 * of those had any test pointed at the rule itself.
 *
 * Both directions are quiet failures. Too loose, and `blocks/README.md` becomes
 * a block id that gets committed and shows up in DA.live's Insert-block palette;
 * too strict, and a library's blocks are silently not installed while the run
 * still reports success.
 *
 * The two sorts are here for the same reason: `blockIds` is what the caller
 * records as the installed set, and an unsorted one differs run to run with the
 * repo listing order.
 */

import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { GitHubTreeInput } from '@/features/eds/services/types';
import type { Logger } from '@/types/logger';
import type { AddonSource } from '@/types/demoPackages';
import {
    createBlockFileEntries,
    primeCommitPath,
    setupBlockCollectionMocks,
} from './blockCollectionHelpers.testUtils';

const DEST_OWNER = 'dest-owner';
const DEST_REPO = 'dest-repo';

const sourceOf = (repo: string): AddonSource => ({ owner: 'lib-owner', repo, branch: 'main' });

type FileEntry = { path: string; sha: string };

const entries = (...paths: string[]): FileEntry[] =>
    paths.map((path) => ({ path, sha: `sha-${path}` }));

describe('installBlockCollections — which paths name a block', () => {
    let mockGithubFileOps: jest.Mocked<GitHubFileOperations>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockLogger, mockGithubFileOps } = setupBlockCollectionMocks());
        primeCommitPath(mockGithubFileOps);
    });

    /** Run an install: the destination listing first, then one per library. */
    async function install(
        destFiles: FileEntry[],
        sourceFileSets: FileEntry[][],
        additionalTreeEntries?: GitHubTreeInput[],
    ) {
        mockGithubFileOps.listRepoFiles.mockResolvedValueOnce(
            destFiles as unknown as Awaited<ReturnType<GitHubFileOperations['listRepoFiles']>>,
        );
        for (const set of sourceFileSets) {
            mockGithubFileOps.listRepoFiles.mockResolvedValueOnce(
                set as unknown as Awaited<ReturnType<GitHubFileOperations['listRepoFiles']>>,
            );
        }
        const libraries = sourceFileSets.map((_, i) => ({
            source: sourceOf(`lib-${i + 1}`),
            name: `Library ${i + 1}`,
        }));
        return installBlockCollections(
            mockGithubFileOps,
            DEST_OWNER,
            DEST_REPO,
            libraries,
            mockLogger,
            additionalTreeEntries,
        );
    }

    /** The paths that went into the single atomic commit. */
    const committedPaths = (): string[] =>
        (mockGithubFileOps.createTree.mock.calls[0][2] as Array<{ path: string }>).map(
            (e) => e.path,
        );

    it('takes only paths that are three segments deep under blocks/', async () => {
        const result = await install(
            [],
            [
                entries(
                    'blocks/alpha/alpha.js',
                    'blocks/alpha/alpha.css',
                    // Two segments — a file directly under blocks/, not a block.
                    'blocks/beta',
                    // Three segments, wrong root — a stylesheet that merely shares
                    // the block's name.
                    'styles/alpha/extra.css',
                    // Three segments, wrong root, and a second segment that names
                    // nothing else in the repo: the case where dropping the
                    // `blocks` check invents a block id out of a script folder.
                    'scripts/widget/widget.js',
                    'README.md',
                ),
            ],
        );

        expect(result.blockIds).toEqual(['alpha']);
        expect(committedPaths()).toEqual(['blocks/alpha/alpha.js', 'blocks/alpha/alpha.css']);
    });

    it('copies no files for a block the destination already has', async () => {
        // First-seen-wins across the destination and every library: the template's
        // own copy of a block must never be overwritten.
        const result = await install(entries('blocks/gamma/gamma.js'), [
            entries('blocks/alpha/alpha.js', 'blocks/gamma/gamma.js'),
        ]);

        expect(result.blockIds).toEqual(['alpha']);
        expect(committedPaths()).toEqual(['blocks/alpha/alpha.js']);
    });

    it('applies the same path rule to the DESTINATION listing', async () => {
        // Neither of these names a block, so neither may claim an id and block a
        // library from installing one.
        const result = await install(entries('blocks/delta', 'docs/epsilon/x.md'), [
            createBlockFileEntries(['delta', 'epsilon']),
        ]);

        expect(result.blockIds).toEqual(['delta', 'epsilon']);
    });
});

describe('installBlockCollections — the order ids come back in', () => {
    let mockGithubFileOps: jest.Mocked<GitHubFileOperations>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockLogger, mockGithubFileOps } = setupBlockCollectionMocks());
        primeCommitPath(mockGithubFileOps);
    });

    async function installLibraries(...blockSets: string[][]) {
        mockGithubFileOps.listRepoFiles.mockResolvedValueOnce(
            [] as unknown as Awaited<ReturnType<GitHubFileOperations['listRepoFiles']>>,
        );
        for (const blocks of blockSets) {
            mockGithubFileOps.listRepoFiles.mockResolvedValueOnce(
                createBlockFileEntries(blocks) as unknown as Awaited<
                    ReturnType<GitHubFileOperations['listRepoFiles']>
                >,
            );
        }
        return installBlockCollections(
            mockGithubFileOps,
            DEST_OWNER,
            DEST_REPO,
            blockSets.map((_, i) => ({ source: sourceOf(`lib-${i + 1}`), name: `Library ${i + 1}` })),
            mockLogger,
        );
    }

    it('sorts the ids ONE library claimed, not the order the repo listed them', async () => {
        const result = await installLibraries(['zebra', 'alpha']);

        expect(result.libraryVersions?.[0].blockIds).toEqual(['alpha', 'zebra']);
    });

    it('sorts the ids ACROSS libraries, not by which library ran first', async () => {
        const result = await installLibraries(['zebra'], ['alpha']);

        expect(result.blockIds).toEqual(['alpha', 'zebra']);
    });

    it('records a version only for a library that actually contributed', async () => {
        // The second library offers nothing the first did not already claim, so
        // pinning a commit SHA for it would claim a provenance that is not real.
        const result = await installLibraries(['alpha'], ['alpha']);

        expect(result.libraryVersions).toHaveLength(1);
        expect(result.libraryVersions?.[0].name).toBe('Library 1');
    });

    it('reports nothing-to-add as a success when the destination already has it all', async () => {
        mockGithubFileOps.listRepoFiles
            .mockResolvedValueOnce(
                createBlockFileEntries(['alpha']) as unknown as Awaited<
                    ReturnType<GitHubFileOperations['listRepoFiles']>
                >,
            )
            .mockResolvedValueOnce(
                createBlockFileEntries(['alpha']) as unknown as Awaited<
                    ReturnType<GitHubFileOperations['listRepoFiles']>
                >,
            );

        const result = await installBlockCollections(
            mockGithubFileOps,
            DEST_OWNER,
            DEST_REPO,
            [{ source: sourceOf('lib-1'), name: 'Library 1' }],
            mockLogger,
        );

        expect(result).toEqual({
            success: true,
            blocksCount: 0,
            blockIds: [],
            libraryVersions: [],
        });
        expect(mockGithubFileOps.createTree).not.toHaveBeenCalled();
    });
});

/**
 * The extra files that ride along in the same commit — inspector tagging, today.
 * They exist to keep the repo history clean, so they must land in the SAME tree
 * as the blocks, and an absent or empty list must not disturb it.
 */
describe('installBlockCollections — additional tree entries', () => {
    let mockGithubFileOps: jest.Mocked<GitHubFileOperations>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockLogger, mockGithubFileOps } = setupBlockCollectionMocks());
        primeCommitPath(mockGithubFileOps);
        mockGithubFileOps.listRepoFiles
            .mockResolvedValueOnce(
                [] as unknown as Awaited<ReturnType<GitHubFileOperations['listRepoFiles']>>,
            )
            .mockResolvedValueOnce(
                createBlockFileEntries(['alpha']) as unknown as Awaited<
                    ReturnType<GitHubFileOperations['listRepoFiles']>
                >,
            );
    });

    const run = (additional?: GitHubTreeInput[]) =>
        installBlockCollections(
            mockGithubFileOps,
            DEST_OWNER,
            DEST_REPO,
            [{ source: sourceOf('lib-1'), name: 'Library 1' }],
            mockLogger,
            additional,
        );

    const committedPaths = (): string[] =>
        (mockGithubFileOps.createTree.mock.calls[0][2] as Array<{ path: string }>).map(
            (e) => e.path,
        );

    it('adds them to the same commit as the blocks', async () => {
        await run([
            { path: '.da/tagging.json', mode: '100644', type: 'blob', content: '{}' },
        ]);

        expect(committedPaths()).toEqual(['blocks/alpha/alpha.js', '.da/tagging.json']);
    });

    it('commits the blocks alone when the list is empty', async () => {
        await run([]);

        expect(committedPaths()).toEqual(['blocks/alpha/alpha.js']);
    });

    it('commits the blocks alone when no list is passed at all', async () => {
        const result = await run(undefined);

        expect(result.success).toBe(true);
        expect(committedPaths()).toEqual(['blocks/alpha/alpha.js']);
    });
});
