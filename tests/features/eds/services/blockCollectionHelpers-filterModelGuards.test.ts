/**
 * The filters and models merges — what they take, and what they refuse.
 *
 * Both walk a source document and copy the entries that belong to blocks this
 * run actually installed. "Belong to" is the whole decision, and it is different
 * in each: filters match an id EXACTLY, models match the id or a `${id}-`
 * prefix, because a model may describe a sub-component (`tabs-item` for `tabs`).
 *
 * A merge that is too generous is worse than one that is too strict. Every
 * unmatched entry it copies names a component that has no block files in the
 * repo, so DA.live's Insert-block palette offers it and inserting it renders
 * nothing.
 *
 * Two other decisions are pinned here because neither is visible in the output:
 * both merges return null — and skip the destination fetch entirely — when they
 * collected nothing, and the filters merge returns null when everything it
 * collected was already present. Writing an unchanged file would put an empty
 * commit in a repo an SC is looking at.
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

type Filter = { id: string; components: string[] };
type Model = { id: string; fields?: unknown[] };

interface Docs {
    filters?: Filter[];
    models?: Model[];
}

describe('the filters and models merges', () => {
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

    /** Install libraries whose filter/model documents are named explicitly. */
    async function install(
        libs: Array<{ repo: string; blocks: string[]; docs: Docs }>,
        dest: Docs,
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
                const docs = repo === DEST_REPO ? dest : libs.find((l) => l.repo === repo)?.docs;
                const doc =
                    path === 'component-filters.json'
                        ? docs?.filters
                        : path === 'component-models.json'
                          ? docs?.models
                          : undefined;
                return doc
                    ? { content: JSON.stringify(doc), sha: 's', path, encoding: 'base64' }
                    : null;
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

    /** The written document at `path`, or undefined if it was not committed. */
    function written<T>(path: string): T | undefined {
        const tree = mockGithubFileOps.createTree.mock.calls[0]?.[2] as
            | Array<{ path: string; content: string }>
            | undefined;
        const entry = tree?.find((e) => e.path === path);
        return entry ? (JSON.parse(entry.content) as T) : undefined;
    }

    /** Whether the destination copy of `path` was read at all. */
    const destWasRead = (path: string) =>
        mockGithubFileOps.getFileContent.mock.calls.some(
            (c) => c[1] === DEST_REPO && c[2] === path,
        );

    describe('component-filters.json', () => {
        it('takes only the section entries that name an installed block', async () => {
            await install(
                [
                    {
                        repo: 'lib-1',
                        blocks: ['alpha'],
                        docs: {
                            filters: [
                                { id: 'main', components: ['section'] },
                                { id: 'section', components: ['alpha', 'unrelated'] },
                            ],
                        },
                    },
                ],
                { filters: [{ id: 'section', components: ['hero'] }] },
            );

            expect(written<Filter[]>('component-filters.json')).toEqual([
                { id: 'section', components: ['hero', 'alpha'] },
            ]);
        });

        it('takes only the sub-filters that name an installed block', async () => {
            await install(
                [
                    {
                        repo: 'lib-1',
                        blocks: ['alpha'],
                        docs: {
                            filters: [
                                { id: 'section', components: ['alpha'] },
                                { id: 'alpha', components: ['text'] },
                                { id: 'unrelated', components: ['text'] },
                            ],
                        },
                    },
                ],
                { filters: [{ id: 'section', components: [] }] },
            );

            expect(written<Filter[]>('component-filters.json')).toEqual([
                { id: 'section', components: ['alpha'] },
                { id: 'alpha', components: ['text'] },
            ]);
        });

        it('never treats the reserved filter ids as sub-filters', async () => {
            // `main` and `section` are the filter document's own structural ids.
            // A library that ships blocks under those names would otherwise have
            // its section filter copied in as a sub-filter of itself.
            await install(
                [
                    {
                        repo: 'lib-1',
                        blocks: ['main', 'section', 'alpha'],
                        docs: {
                            filters: [
                                { id: 'main', components: ['section'] },
                                { id: 'section', components: ['alpha'] },
                                { id: 'alpha', components: ['text'] },
                            ],
                        },
                    },
                ],
                { filters: [{ id: 'main', components: ['section'] }] },
            );

            expect(written<Filter[]>('component-filters.json')).toEqual([
                { id: 'main', components: ['section'] },
                { id: 'alpha', components: ['text'] },
            ]);
        });

        it('refuses the reserved ids even when the destination lacks them', async () => {
            // The test above cannot see the `main` half of the guard: a
            // destination that already HAS a main filter would reject the
            // duplicate anyway. Here nothing downstream would catch it.
            await install(
                [
                    {
                        repo: 'lib-1',
                        blocks: ['main', 'alpha'],
                        docs: {
                            filters: [
                                { id: 'main', components: ['section'] },
                                { id: 'alpha', components: ['text'] },
                            ],
                        },
                    },
                ],
                { filters: [{ id: 'section', components: [] }] },
            );

            expect(written<Filter[]>('component-filters.json')).toEqual([
                { id: 'section', components: [] },
                { id: 'alpha', components: ['text'] },
            ]);
        });

        it('merges sub-filters into a destination that has no section filter', async () => {
            const result = await install(
                [
                    {
                        repo: 'lib-1',
                        blocks: ['alpha'],
                        docs: { filters: [{ id: 'alpha', components: ['text'] }] },
                    },
                ],
                { filters: [{ id: 'main', components: ['section'] }] },
            );

            expect(result.success).toBe(true);
            expect(written<Filter[]>('component-filters.json')).toEqual([
                { id: 'main', components: ['section'] },
                { id: 'alpha', components: ['text'] },
            ]);
        });

        it('survives a source document with no section filter', async () => {
            const result = await install(
                [
                    {
                        repo: 'lib-1',
                        blocks: ['alpha'],
                        docs: { filters: [{ id: 'alpha', components: ['text'] }] },
                    },
                ],
                { filters: [{ id: 'section', components: [] }] },
            );

            expect(result.success).toBe(true);
        });

        it('does not even read the destination when nothing matched', async () => {
            await install(
                [
                    {
                        repo: 'lib-1',
                        blocks: ['alpha'],
                        docs: { filters: [{ id: 'section', components: ['unrelated'] }] },
                    },
                ],
                { filters: [{ id: 'section', components: [] }] },
            );

            expect(destWasRead('component-filters.json')).toBe(false);
        });

        it('writes nothing when everything it collected is already there', async () => {
            await install(
                [
                    {
                        repo: 'lib-1',
                        blocks: ['alpha'],
                        docs: {
                            filters: [
                                { id: 'section', components: ['alpha'] },
                                { id: 'alpha', components: ['text'] },
                            ],
                        },
                    },
                ],
                {
                    filters: [
                        { id: 'section', components: ['alpha'] },
                        { id: 'alpha', components: ['text'] },
                    ],
                },
            );

            expect(written('component-filters.json')).toBeUndefined();
        });
    });

    describe('component-models.json', () => {
        it('takes the block model and its sub-component models, and nothing else', async () => {
            await install(
                [
                    {
                        repo: 'lib-1',
                        blocks: ['tabs'],
                        docs: {
                            models: [
                                { id: 'tabs' },
                                { id: 'tabs-item' },
                                { id: 'unrelated' },
                            ],
                        },
                    },
                ],
                { models: [{ id: 'hero' }] },
            );

            expect(written<Model[]>('component-models.json')).toEqual([
                { id: 'hero' },
                { id: 'tabs' },
                { id: 'tabs-item' },
            ]);
        });

        it('collects a repeated model id once', async () => {
            await install(
                [
                    {
                        repo: 'lib-1',
                        blocks: ['alpha'],
                        docs: { models: [{ id: 'alpha' }, { id: 'alpha' }] },
                    },
                ],
                { models: [] },
            );

            expect(written<Model[]>('component-models.json')).toEqual([{ id: 'alpha' }]);
        });

        it('does not even read the destination when nothing matched', async () => {
            await install(
                [
                    {
                        repo: 'lib-1',
                        blocks: ['alpha'],
                        docs: { models: [{ id: 'unrelated' }] },
                    },
                ],
                { models: [] },
            );

            expect(destWasRead('component-models.json')).toBe(false);
        });

        it('writes nothing when the destination already has the model', async () => {
            await install(
                [{ repo: 'lib-1', blocks: ['alpha'], docs: { models: [{ id: 'alpha' }] } }],
                { models: [{ id: 'alpha' }] },
            );

            expect(written('component-models.json')).toBeUndefined();
        });
    });
});
