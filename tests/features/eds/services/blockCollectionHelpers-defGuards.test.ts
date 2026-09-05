/**
 * The component-definition merge, driven with the SHAPES real repos have.
 *
 * `buildMergedComponentDefinitionMultiSource` walks four levels of two JSON
 * documents it did not write — a source `component-definition.json` from each
 * library and the destination's own — and every level is optional in practice.
 * A group with no `components`, a definition with no `groups`, an entry whose
 * `plugins` object exists but is empty: all of these are ordinary in block
 * collections, and each is guarded here.
 *
 * The guards matter because of where the throw would land. This runs inside
 * `installBlockCollections`'s try, so a TypeError four levels down does not
 * surface as "that library's definition is malformed" — it comes back as the
 * whole installation failing, with the message of a property access.
 *
 * Every test therefore asserts the RESULT of the install as well as the merged
 * document, because those are the two different things a mistake here breaks.
 */

import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { Logger } from '@/types/logger';
import type { AddonSource } from '@/types/demoPackages';
import {
    createBlockFileEntries,
    setupBlockCollectionMocks,
} from './blockCollectionHelpers.testUtils';

const DEST_OWNER = 'dest-owner';
const DEST_REPO = 'dest-repo';
const sourceOf = (repo: string): AddonSource => ({ owner: 'lib-owner', repo, branch: 'main' });

/** A component-definition document, as a JSON string. */
const def = (groups: unknown) => JSON.stringify({ groups });

type Group = {
    id: string;
    title?: string;
    components?: Array<Record<string, unknown>>;
};

describe('the component-definition merge — shapes it must survive', () => {
    let mockGithubFileOps: jest.Mocked<GitHubFileOperations>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockLogger, mockGithubFileOps } = setupBlockCollectionMocks());
        mockGithubFileOps.getBlobContent.mockResolvedValue('content');
        mockGithubFileOps.getBranchInfo.mockResolvedValue({
            treeSha: 'tree-sha',
            commitSha: 'commit-sha',
        });
        mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
        mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
        mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);
    });

    /**
     * One install, with each library's block ids and its component-definition
     * document named explicitly. Filters and models are absent throughout —
     * they have their own suite.
     */
    async function install(
        libs: Array<{ repo: string; blocks: string[]; definition: string | null }>,
        destDefinition: string | null,
    ) {
        mockGithubFileOps.listRepoFiles.mockResolvedValueOnce(
            [] as unknown as Awaited<ReturnType<GitHubFileOperations['listRepoFiles']>>,
        );
        for (const lib of libs) {
            mockGithubFileOps.listRepoFiles.mockResolvedValueOnce(
                createBlockFileEntries(lib.blocks) as unknown as Awaited<
                    ReturnType<GitHubFileOperations['listRepoFiles']>
                >,
            );
        }
        mockGithubFileOps.getFileContent.mockImplementation(
            async (_owner: string, repo: string, path: string) => {
                if (path !== 'component-definition.json') return null;
                const content =
                    repo === DEST_REPO ? destDefinition : libs.find((l) => l.repo === repo)?.definition;
                return content ? { content, sha: 's', path, encoding: 'base64' } : null;
            },
        );
        return installBlockCollections(
            mockGithubFileOps,
            DEST_OWNER,
            DEST_REPO,
            libs.map((l) => ({ source: sourceOf(l.repo), name: l.repo })),
            mockLogger,
        );
    }

    /** The merged component-definition document, or undefined if none was written. */
    function mergedDefinition(): { groups: Group[] } | undefined {
        const tree = mockGithubFileOps.createTree.mock.calls[0]?.[2] as
            | Array<{ path: string; content: string }>
            | undefined;
        const entry = tree?.find((e) => e.path === 'component-definition.json');
        return entry ? JSON.parse(entry.content) : undefined;
    }

    it('skips a source definition that has no groups at all', async () => {
        const result = await install(
            [{ repo: 'lib-1', blocks: ['alpha'], definition: JSON.stringify({ version: 1 }) }],
            def([{ id: 'blocks', title: 'Blocks', components: [] }]),
        );

        expect(result.success).toBe(true);
        expect(mergedDefinition()).toBeUndefined();
    });

    it('skips a source group that lists no components', async () => {
        const result = await install(
            [{ repo: 'lib-1', blocks: ['alpha'], definition: def([{ id: 'blocks', title: 'Blocks' }]) }],
            def([{ id: 'blocks', title: 'Blocks', components: [] }]),
        );

        expect(result.success).toBe(true);
        expect(mergedDefinition()).toBeUndefined();
    });

    it('adds an entry once even when the source lists it under two groups', async () => {
        const result = await install(
            [
                {
                    repo: 'lib-1',
                    blocks: ['alpha'],
                    definition: def([
                        { id: 'blocks', title: 'Blocks', components: [{ id: 'alpha', title: 'A' }] },
                        { id: 'extras', title: 'Extras', components: [{ id: 'alpha', title: 'A' }] },
                    ]),
                },
            ],
            def([{ id: 'blocks', title: 'Blocks', components: [] }]),
        );

        expect(result.success).toBe(true);
        const groups = mergedDefinition()!.groups;
        expect(groups.flatMap((g) => g.components ?? []).filter((c) => c.id === 'alpha')).toHaveLength(1);
    });

    it('writes nothing when the DESTINATION definition has no groups', async () => {
        const result = await install(
            [
                {
                    repo: 'lib-1',
                    blocks: ['alpha'],
                    definition: def([
                        { id: 'blocks', title: 'Blocks', components: [{ id: 'alpha', title: 'A' }] },
                    ]),
                },
            ],
            JSON.stringify({ version: 1 }),
        );

        expect(result.success).toBe(true);
        expect(mergedDefinition()).toBeUndefined();
    });

    it('fills in a destination group that has no components list', async () => {
        const result = await install(
            [
                {
                    repo: 'lib-1',
                    blocks: ['alpha'],
                    definition: def([
                        { id: 'blocks', title: 'Blocks', components: [{ id: 'alpha', title: 'A' }] },
                    ]),
                },
            ],
            def([{ id: 'blocks', title: 'Blocks' }]),
        );

        expect(result.success).toBe(true);
        expect(mergedDefinition()!.groups[0].components).toEqual([{ id: 'alpha', title: 'A' }]);
    });

    it('writes the merged definition when entries were added', async () => {
        await install(
            [
                {
                    repo: 'lib-1',
                    blocks: ['alpha'],
                    definition: def([
                        { id: 'blocks', title: 'Blocks', components: [{ id: 'alpha', title: 'A' }] },
                    ]),
                },
            ],
            def([{ id: 'blocks', title: 'Blocks', components: [{ id: 'hero', title: 'Hero' }] }]),
        );

        expect(mergedDefinition()!.groups[0].components).toEqual([
            { id: 'hero', title: 'Hero' },
            { id: 'alpha', title: 'A' },
        ]);
    });
});

/**
 * The unsafeHTML enrichment pass — the second walk over the same documents.
 *
 * It exists for blocks the destination already had: their files were correctly
 * preserved, but their component-definition entry came from the template and may
 * lack the `plugins.da.unsafeHTML` the library's own entry carries. Without it
 * the block renders in DA.live with its markup escaped.
 *
 * It is additive only, so the shapes it has to tolerate are the half-built ones:
 * a `plugins` object with no `da`, a destination group with no components.
 */
describe('the unsafeHTML enrichment pass', () => {
    let mockGithubFileOps: jest.Mocked<GitHubFileOperations>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockLogger, mockGithubFileOps } = setupBlockCollectionMocks());
        mockGithubFileOps.getBlobContent.mockResolvedValue('content');
        mockGithubFileOps.getBranchInfo.mockResolvedValue({
            treeSha: 'tree-sha',
            commitSha: 'commit-sha',
        });
        mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
        mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
        mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);
    });

    /** Install one library whose blocks are ALREADY in the destination repo. */
    async function enrich(sourceGroups: unknown, destGroups: unknown) {
        mockGithubFileOps.listRepoFiles
            .mockResolvedValueOnce(
                createBlockFileEntries(['omega']) as unknown as Awaited<
                    ReturnType<GitHubFileOperations['listRepoFiles']>
                >,
            )
            .mockResolvedValueOnce(
                createBlockFileEntries(['alpha', 'omega']) as unknown as Awaited<
                    ReturnType<GitHubFileOperations['listRepoFiles']>
                >,
            );
        mockGithubFileOps.getFileContent.mockImplementation(
            async (_owner: string, repo: string, path: string) => {
                if (path !== 'component-definition.json') return null;
                const content = repo === DEST_REPO ? def(destGroups) : def(sourceGroups);
                return { content, sha: 's', path, encoding: 'base64' };
            },
        );
        return installBlockCollections(
            mockGithubFileOps,
            DEST_OWNER,
            DEST_REPO,
            [{ source: sourceOf('lib-1'), name: 'lib-1' }],
            mockLogger,
        );
    }

    function mergedGroups(): Group[] | undefined {
        const tree = mockGithubFileOps.createTree.mock.calls[0]?.[2] as
            | Array<{ path: string; content: string }>
            | undefined;
        const entry = tree?.find((e) => e.path === 'component-definition.json');
        return entry ? (JSON.parse(entry.content) as { groups: Group[] }).groups : undefined;
    }

    it('copies unsafeHTML onto a destination entry that lacks it', async () => {
        const result = await enrich(
            [
                {
                    id: 'blocks',
                    title: 'Blocks',
                    components: [{ id: 'omega', plugins: { da: { unsafeHTML: '<div/>' } } }],
                },
            ],
            [{ id: 'blocks', title: 'Blocks', components: [{ id: 'omega', plugins: {} }] }],
        );

        expect(result.success).toBe(true);
        expect(mergedGroups()![0].components![0]).toMatchObject({
            id: 'omega',
            plugins: { da: { unsafeHTML: '<div/>' } },
        });
    });

    it('leaves an entry that already has its own unsafeHTML alone', async () => {
        // Additive only: the destination's value is the one the SC may have
        // edited, and overwriting it is the one thing this pass must not do.
        await enrich(
            [
                {
                    id: 'blocks',
                    title: 'Blocks',
                    components: [{ id: 'omega', plugins: { da: { unsafeHTML: '<from-source/>' } } }],
                },
            ],
            [
                {
                    id: 'blocks',
                    title: 'Blocks',
                    components: [{ id: 'omega', plugins: { da: { unsafeHTML: '<from-dest/>' } } }],
                },
            ],
        );

        expect(mergedGroups()).toBeUndefined();
    });

    it('steps over a source entry whose plugins object names no da', async () => {
        const result = await enrich(
            [
                {
                    id: 'blocks',
                    title: 'Blocks',
                    components: [
                        { id: 'omega', plugins: {} },
                        { id: 'alpha', plugins: { da: { unsafeHTML: '<div/>' } } },
                    ],
                },
            ],
            [{ id: 'blocks', title: 'Blocks', components: [{ id: 'omega' }] }],
        );

        expect(result.success).toBe(true);
    });

    it('steps over a destination group that lists no components', async () => {
        const result = await enrich(
            [
                {
                    id: 'blocks',
                    title: 'Blocks',
                    components: [{ id: 'omega', plugins: { da: { unsafeHTML: '<div/>' } } }],
                },
            ],
            [
                { id: 'empty', title: 'Empty' },
                { id: 'blocks', title: 'Blocks', components: [{ id: 'omega' }] },
            ],
        );

        expect(result.success).toBe(true);
        expect(mergedGroups()![1].components![0]).toMatchObject({
            plugins: { da: { unsafeHTML: '<div/>' } },
        });
    });
});
