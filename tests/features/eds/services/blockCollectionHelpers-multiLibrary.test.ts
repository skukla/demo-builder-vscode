/**
 * Block Collection Helpers - Multi-Library Tests
 *
 * Tests for installBlockCollections (plural) with multiple library sources:
 * cross-library deduplication, single atomic commit, multi-source
 * component-definition.json merge, edge cases, and version tracking.
 */

import {
    installBlockCollections,
} from '@/features/eds/services/blockCollectionHelpers';
import type { Logger } from '@/types/logger';
import type { GitHubFileOperations } from '@/features/eds/services/githubFileOperations';
import type { AddonSource } from '@/types/demoPackages';

// --- Shared test helpers ---

/** Create a component-definition.json with specified blocks */
function createComponentDef(
    blocks: Array<{ title: string; id: string; unsafeHTML?: string }>,
): string {
    return JSON.stringify({
        groups: [{
            id: 'blocks',
            title: 'Blocks',
            components: blocks.map(b => ({
                title: b.title,
                id: b.id,
                plugins: b.unsafeHTML ? { da: { unsafeHTML: b.unsafeHTML } } : undefined,
            })),
        }],
    });
}

/** Create a destination component-definition.json with existing blocks */
function createDestComponentDef(
    blocks: Array<{ title: string; id: string }> = [
        { title: 'Hero', id: 'hero' },
        { title: 'Cards', id: 'cards' },
    ],
): string {
    return JSON.stringify({
        groups: [{
            id: 'blocks',
            title: 'Blocks',
            components: blocks.map(b => ({ title: b.title, id: b.id })),
        }],
    });
}

/** Create a source component-filters.json */
function createComponentFilters(
    sectionBlocks: string[],
    subFilters: Array<{ id: string; components: string[] }> = [],
): string {
    return JSON.stringify([
        { id: 'main', components: ['section'] },
        { id: 'section', components: sectionBlocks },
        ...subFilters,
    ]);
}

/** Create a destination component-filters.json with common defaults */
function createDestComponentFilters(
    sectionBlocks: string[] = ['hero', 'cards', 'enrichment', 'fragment', 'text', 'image'],
): string {
    return JSON.stringify([
        { id: 'main', components: ['section'] },
        { id: 'section', components: sectionBlocks },
    ]);
}

/** Create mock file entries for blocks/ directories */
function createBlockFileEntries(
    blockIds: string[],
): Array<{ path: string; mode: string; type: 'blob'; sha: string }> {
    return blockIds.map(id => ({
        path: `blocks/${id}/${id}.js`,
        mode: '100644',
        type: 'blob' as const,
        sha: `sha-${id}`,
    }));
}

describe('installBlockCollections', () => {
    const SOURCE_A: AddonSource = { owner: 'adobe', repo: 'isle5', branch: 'main' };
    const SOURCE_B: AddonSource = { owner: 'partner', repo: 'custom-blocks', branch: 'v2' };
    let mockGithubFileOps: jest.Mocked<GitHubFileOperations>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as jest.Mocked<Logger>;

        mockGithubFileOps = {
            listRepoFiles: jest.fn(),
            getBlobContent: jest.fn(),
            getFileContent: jest.fn(),
            getBranchInfo: jest.fn(),
            createTree: jest.fn(),
            createCommit: jest.fn(),
            updateBranchRef: jest.fn(),
        } as unknown as jest.Mocked<GitHubFileOperations>;
    });

    describe('cross-library block deduplication', () => {
        it('should deduplicate blocks across libraries (first source wins)', async () => {
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(['hero-cta', 'newsletter', 'search-bar']))
                .mockResolvedValueOnce(createBlockFileEntries(['newsletter', 'search-bar', 'product-grid']));

            mockGithubFileOps.getBlobContent.mockResolvedValue('export default function() {}');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Isle5' },
                    { source: SOURCE_B, name: 'Custom Blocks' },
                ],
                mockLogger,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(4);
            expect(mockGithubFileOps.getBlobContent).toHaveBeenCalledTimes(4);
        });

        it('should fetch overlapping blocks only from the first source (first wins)', async () => {
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce([
                    { path: 'blocks/newsletter/newsletter.js', mode: '100644', type: 'blob' as const, sha: 'sha-A-newsletter' },
                ])
                .mockResolvedValueOnce([
                    { path: 'blocks/newsletter/newsletter.js', mode: '100644', type: 'blob' as const, sha: 'sha-B-newsletter' },
                ]);

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Isle5' },
                    { source: SOURCE_B, name: 'Custom Blocks' },
                ],
                mockLogger,
            );

            expect(result.blocksCount).toBe(1);
            expect(mockGithubFileOps.getBlobContent).toHaveBeenCalledTimes(1);
            expect(mockGithubFileOps.getBlobContent).toHaveBeenCalledWith(
                SOURCE_A.owner, SOURCE_A.repo, 'sha-A-newsletter',
            );
        });

        it('should return unique blockIds in result (no duplicates)', async () => {
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(['alpha', 'beta']))
                .mockResolvedValueOnce(createBlockFileEntries(['beta', 'gamma']));

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Source A' },
                    { source: SOURCE_B, name: 'Source B' },
                ],
                mockLogger,
            );

            expect(result.blockIds).toEqual(['alpha', 'beta', 'gamma']);
            expect(result.blocksCount).toBe(3);
        });
    });

    describe('single atomic commit', () => {
        it('should create exactly one commit for multiple libraries', async () => {
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(['hero-cta']))
                .mockResolvedValueOnce(createBlockFileEntries(['product-grid']));

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Isle5' },
                    { source: SOURCE_B, name: 'Custom Blocks' },
                ],
                mockLogger,
            );

            expect(mockGithubFileOps.createCommit).toHaveBeenCalledTimes(1);
            expect(mockGithubFileOps.createTree).toHaveBeenCalledTimes(1);
            expect(mockGithubFileOps.updateBranchRef).toHaveBeenCalledTimes(1);
        });

        it('should include blocks from all libraries in the single commit tree', async () => {
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(['hero-cta']))
                .mockResolvedValueOnce(createBlockFileEntries(['product-grid']));

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Isle5' },
                    { source: SOURCE_B, name: 'Custom Blocks' },
                ],
                mockLogger,
            );

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string }>;
            const blockPaths = treeEntries
                .filter(e => e.path.startsWith('blocks/'))
                .map(e => e.path);

            expect(blockPaths).toContain('blocks/hero-cta/hero-cta.js');
            expect(blockPaths).toContain('blocks/product-grid/product-grid.js');
        });

        it('should mention total unique block count in commit message', async () => {
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(['hero-cta', 'newsletter']))
                .mockResolvedValueOnce(createBlockFileEntries(['newsletter', 'product-grid']));

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Isle5' },
                    { source: SOURCE_B, name: 'Custom Blocks' },
                ],
                mockLogger,
            );

            const commitMessage = mockGithubFileOps.createCommit.mock.calls[0][2] as string;
            expect(commitMessage).toContain('3 blocks');
            expect(commitMessage).toContain('2 libraries');
        });
    });

    describe('multi-source component-definition.json merge', () => {
        it('should merge component-definition.json entries from all sources without duplicates', async () => {
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(['block-a', 'block-b', 'block-c']))
                .mockResolvedValueOnce(createBlockFileEntries(['block-b', 'block-c', 'block-d']));

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');

            const sourceACompDef = createComponentDef([
                { title: 'Block A', id: 'block-a' },
                { title: 'Block B', id: 'block-b' },
                { title: 'Block C', id: 'block-c' },
            ]);
            const sourceBCompDef = createComponentDef([
                { title: 'Block B (Custom)', id: 'block-b' },
                { title: 'Block C (Custom)', id: 'block-c' },
                { title: 'Block D', id: 'block-d' },
            ]);
            const destCompDef = createDestComponentDef();

            mockGithubFileOps.getFileContent.mockImplementation(
                async (owner: string, repo: string, path: string) => {
                    if (path === 'component-filters.json' || path === 'component-models.json') return null;
                    if (owner === SOURCE_A.owner && repo === SOURCE_A.repo) {
                        return { content: sourceACompDef, sha: 'source-a-sha' };
                    }
                    if (owner === SOURCE_B.owner && repo === SOURCE_B.repo) {
                        return { content: sourceBCompDef, sha: 'source-b-sha' };
                    }
                    return { content: destCompDef, sha: 'dest-sha' };
                },
            );

            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Isle5' },
                    { source: SOURCE_B, name: 'Custom Blocks' },
                ],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeDefined();

            const merged = JSON.parse(compDefEntry!.content!);
            const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
            const mergedIds = blocksGroup.components.map((c: { id: string }) => c.id);

            expect(mergedIds).toContain('block-a');
            expect(mergedIds).toContain('block-b');
            expect(mergedIds).toContain('block-c');
            expect(mergedIds).toContain('block-d');

            const blockBCount = mergedIds.filter((id: string) => id === 'block-b').length;
            expect(blockBCount).toBe(1);
            const blockCCount = mergedIds.filter((id: string) => id === 'block-c').length;
            expect(blockCCount).toBe(1);
        });
    });

    describe('edge cases', () => {
        it('should handle mixed success (some sources have no blocks)', async () => {
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(['hero-cta', 'newsletter']))
                .mockResolvedValueOnce([
                    { path: 'README.md', mode: '100644', type: 'blob' as const, sha: 'sha-readme' },
                ]);

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Isle5' },
                    { source: SOURCE_B, name: 'Empty Lib' },
                ],
                mockLogger,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);
            expect(result.blockIds).toEqual(['hero-cta', 'newsletter']);
        });

        it('should return empty success result when no libraries provided', async () => {
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [],
                mockLogger,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(0);
            expect(result.blockIds).toEqual([]);
            expect(mockGithubFileOps.listRepoFiles).not.toHaveBeenCalled();
            expect(mockGithubFileOps.createCommit).not.toHaveBeenCalled();
        });

        it('should return error when all sources fail to list files', async () => {
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockRejectedValueOnce(new Error('API rate limit'))
                .mockRejectedValueOnce(new Error('Not found'));

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Isle5' },
                    { source: SOURCE_B, name: 'Custom Blocks' },
                ],
                mockLogger,
            );

            expect(result.success).toBe(false);
            expect(result.blocksCount).toBe(0);
            expect(result.blockIds).toEqual([]);
        });

        it('should work correctly with a single library (backward compatible behavior)', async () => {
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(['hero-cta', 'newsletter']));
            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: SOURCE_A, name: 'Isle5' }],
                mockLogger,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);
            expect(result.blockIds).toEqual(['hero-cta', 'newsletter']);
            expect(mockGithubFileOps.createCommit).toHaveBeenCalledTimes(1);
        });
    });

    describe('libraryVersions tracking', () => {
        it('should return libraryVersions with source commit SHAs when install succeeds', async () => {
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(['hero-cta', 'newsletter']))
                .mockResolvedValueOnce(createBlockFileEntries(['product-grid']));

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);

            mockGithubFileOps.getBranchInfo.mockImplementation(
                async (owner: string, repo: string) => {
                    if (owner === SOURCE_A.owner && repo === SOURCE_A.repo) {
                        return { treeSha: 'tree-sha-a', commitSha: 'source-commit-sha-a' };
                    }
                    if (owner === SOURCE_B.owner && repo === SOURCE_B.repo) {
                        return { treeSha: 'tree-sha-b', commitSha: 'source-commit-sha-b' };
                    }
                    return { treeSha: 'dest-tree-sha', commitSha: 'dest-commit-sha' };
                },
            );
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Isle5' },
                    { source: SOURCE_B, name: 'Custom Blocks' },
                ],
                mockLogger,
            );

            expect(result.success).toBe(true);
            expect(result.libraryVersions).toBeDefined();
            expect(result.libraryVersions).toHaveLength(2);
        });

        it('should map libraryVersions correctly to each library (name, source, commitSha, blockIds)', async () => {
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(['hero-cta', 'newsletter']))
                .mockResolvedValueOnce(createBlockFileEntries(['product-grid']));

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);

            mockGithubFileOps.getBranchInfo.mockImplementation(
                async (owner: string, repo: string) => {
                    if (owner === SOURCE_A.owner && repo === SOURCE_A.repo) {
                        return { treeSha: 'tree-sha-a', commitSha: 'abc123' };
                    }
                    if (owner === SOURCE_B.owner && repo === SOURCE_B.repo) {
                        return { treeSha: 'tree-sha-b', commitSha: 'def456' };
                    }
                    return { treeSha: 'dest-tree', commitSha: 'dest-sha' };
                },
            );
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Isle5' },
                    { source: SOURCE_B, name: 'Custom Blocks' },
                ],
                mockLogger,
            );

            expect(result.libraryVersions).toEqual([
                {
                    source: SOURCE_A,
                    name: 'Isle5',
                    commitSha: 'abc123',
                    blockIds: ['hero-cta', 'newsletter'],
                },
                {
                    source: SOURCE_B,
                    name: 'Custom Blocks',
                    commitSha: 'def456',
                    blockIds: ['product-grid'],
                },
            ]);
        });

        it('should return empty libraryVersions when library list is empty', async () => {
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [],
                mockLogger,
            );

            expect(result.success).toBe(true);
            expect(result.libraryVersions ?? []).toEqual([]);
        });
    });

    describe('template block preservation (regression)', () => {
        it('should not overwrite blocks that already exist in the destination repo', async () => {
            // Destination already has cards and hero from template reset
            // Library offers cards, hero (overlap) + newsletter (new)
            // Only newsletter should be installed
            mockGithubFileOps.listRepoFiles.mockImplementation(
                async (owner: string, repo: string) => {
                    if (owner === 'dest-owner' && repo === 'dest-repo') {
                        return createBlockFileEntries(['cards', 'hero']);
                    }
                    if (owner === SOURCE_A.owner && repo === SOURCE_A.repo) {
                        return createBlockFileEntries(['cards', 'hero', 'newsletter']);
                    }
                    return [];
                },
            );

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: SOURCE_A, name: 'Isle5' }],
                mockLogger,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(1);
            expect(result.blockIds).toEqual(['newsletter']);
        });

        it('should log count of preserved template blocks', async () => {
            mockGithubFileOps.listRepoFiles.mockImplementation(
                async (owner: string, repo: string) => {
                    if (owner === 'dest-owner' && repo === 'dest-repo') {
                        return createBlockFileEntries(['cards', 'hero', 'columns']);
                    }
                    if (owner === SOURCE_A.owner && repo === SOURCE_A.repo) {
                        return createBlockFileEntries(['cards', 'hero', 'newsletter']);
                    }
                    return [];
                },
            );

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: SOURCE_A, name: 'Isle5' }],
                mockLogger,
            );

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('3 existing blocks'),
            );
        });

        it('should still install all blocks when destination has no blocks', async () => {
            mockGithubFileOps.listRepoFiles.mockImplementation(
                async (owner: string, repo: string) => {
                    if (owner === 'dest-owner' && repo === 'dest-repo') {
                        return []; // Empty destination
                    }
                    if (owner === SOURCE_A.owner && repo === SOURCE_A.repo) {
                        return createBlockFileEntries(['hero-cta', 'newsletter']);
                    }
                    return [];
                },
            );

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: SOURCE_A, name: 'Isle5' }],
                mockLogger,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);
            expect(result.blockIds).toEqual(['hero-cta', 'newsletter']);
        });

        it('should preserve template blocks across multiple libraries', async () => {
            // Destination has cards from template
            // Library A has cards (overlap) + newsletter (new)
            // Library B has cards (overlap) + product-grid (new)
            // Should install: newsletter + product-grid only
            mockGithubFileOps.listRepoFiles.mockImplementation(
                async (owner: string, repo: string) => {
                    if (owner === 'dest-owner' && repo === 'dest-repo') {
                        return createBlockFileEntries(['cards']);
                    }
                    if (owner === SOURCE_A.owner && repo === SOURCE_A.repo) {
                        return createBlockFileEntries(['cards', 'newsletter']);
                    }
                    if (owner === SOURCE_B.owner && repo === SOURCE_B.repo) {
                        return createBlockFileEntries(['cards', 'product-grid']);
                    }
                    return [];
                },
            );

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Isle5' },
                    { source: SOURCE_B, name: 'Custom Blocks' },
                ],
                mockLogger,
            );

            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);
            expect(result.blockIds).toEqual(['newsletter', 'product-grid']);
        });
    });

    describe('component-filters merge (multi-library)', () => {
        it('should merge filters from multiple libraries', async () => {
            // Lib A: hero-v2, tabs (with sub-filter)
            // Lib B: blog-tiles, circle-carousel (with sub-filter)
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(['hero-v2', 'tabs']))
                .mockResolvedValueOnce(createBlockFileEntries(['blog-tiles', 'circle-carousel']));

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');

            const sourceAFilters = createComponentFilters(
                ['hero-v2', 'tabs'],
                [{ id: 'tabs', components: ['tabs-item'] }],
            );
            const sourceBFilters = createComponentFilters(
                ['blog-tiles', 'circle-carousel'],
                [{ id: 'circle-carousel', components: ['circle-carousel-item'] }],
            );
            const destFilters = createDestComponentFilters();

            mockGithubFileOps.getFileContent.mockImplementation(
                async (owner: string, repo: string, path: string) => {
                    if (owner === SOURCE_A.owner && repo === SOURCE_A.repo) {
                        if (path === 'component-filters.json') {
                            return { content: sourceAFilters, sha: 'sha-cf-a' };
                        }
                        return null; // no comp-def
                    }
                    if (owner === SOURCE_B.owner && repo === SOURCE_B.repo) {
                        if (path === 'component-filters.json') {
                            return { content: sourceBFilters, sha: 'sha-cf-b' };
                        }
                        return null; // no comp-def
                    }
                    // destination
                    if (path === 'component-filters.json') {
                        return { content: destFilters, sha: 'dest-sha-cf' };
                    }
                    return null;
                },
            );

            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Isle5' },
                    { source: SOURCE_B, name: 'Custom Blocks' },
                ],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const filtersEntry = treeEntries.find(e => e.path === 'component-filters.json');
            expect(filtersEntry).toBeDefined();

            const merged = JSON.parse(filtersEntry!.content!);
            const sectionFilter = merged.find((f: { id: string }) => f.id === 'section');

            // All four block IDs should be in section
            expect(sectionFilter.components).toContain('hero-v2');
            expect(sectionFilter.components).toContain('tabs');
            expect(sectionFilter.components).toContain('blog-tiles');
            expect(sectionFilter.components).toContain('circle-carousel');

            // Sub-filters should be present
            const tabsFilter = merged.find((f: { id: string }) => f.id === 'tabs');
            expect(tabsFilter).toBeDefined();
            expect(tabsFilter.components).toContain('tabs-item');

            const carouselFilter = merged.find((f: { id: string }) => f.id === 'circle-carousel');
            expect(carouselFilter).toBeDefined();
            expect(carouselFilter.components).toContain('circle-carousel-item');
        });

        it('should not duplicate filter entries across libraries', async () => {
            // Both libs have 'hero' in section filters
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(['hero', 'newsletter']))
                .mockResolvedValueOnce(createBlockFileEntries(['hero', 'product-grid']));

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');

            const sourceAFilters = createComponentFilters(['hero', 'newsletter']);
            const sourceBFilters = createComponentFilters(['hero', 'product-grid']);
            const destFilters = createDestComponentFilters();

            mockGithubFileOps.getFileContent.mockImplementation(
                async (owner: string, repo: string, path: string) => {
                    if (owner === SOURCE_A.owner && repo === SOURCE_A.repo) {
                        if (path === 'component-filters.json') {
                            return { content: sourceAFilters, sha: 'sha-cf-a' };
                        }
                        return null;
                    }
                    if (owner === SOURCE_B.owner && repo === SOURCE_B.repo) {
                        if (path === 'component-filters.json') {
                            return { content: sourceBFilters, sha: 'sha-cf-b' };
                        }
                        return null;
                    }
                    if (path === 'component-filters.json') {
                        return { content: destFilters, sha: 'dest-sha-cf' };
                    }
                    return null;
                },
            );

            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [
                    { source: SOURCE_A, name: 'Isle5' },
                    { source: SOURCE_B, name: 'Custom Blocks' },
                ],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const filtersEntry = treeEntries.find(e => e.path === 'component-filters.json');
            expect(filtersEntry).toBeDefined();

            const merged = JSON.parse(filtersEntry!.content!);
            const sectionFilter = merged.find((f: { id: string }) => f.id === 'section');

            // 'hero' already in dest defaults, so should appear only once
            const heroCount = sectionFilter.components.filter((c: string) => c === 'hero').length;
            expect(heroCount).toBe(1);

            // 'newsletter' and 'product-grid' should be added
            expect(sectionFilter.components).toContain('newsletter');
            expect(sectionFilter.components).toContain('product-grid');
        });
    });
});
