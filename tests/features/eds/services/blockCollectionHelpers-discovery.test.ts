/**
 * Block Collection Helpers - Single Library: Dynamic Block Discovery
 *
 * Tests that block installation is fully dynamic (scans the source repo's
 * blocks/ directory). Shared fixture builders live in
 * blockCollectionHelpers.testUtils.ts.
 */

import {
    installBlockCollections,
} from '@/features/eds/services/blockCollectionHelpers';
import type { Logger } from '@/types/logger';
import type { GitHubFileOperations } from '@/features/eds/services/githubFileOperations';
import type { AddonSource } from '@/types/demoPackages';
import {
    createDestComponentDef,
    createBlockFileEntries,
} from './blockCollectionHelpers.testUtils';

describe('installBlockCollections (single library)', () => {
    const TEST_SOURCE: AddonSource = { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' };
    const DEFAULT_BLOCKS = ['hero-cta', 'newsletter', 'search-bar'];
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

    /**
     * Set up mocks for a successful single-library install call.
     * Accepts variable block lists for testing dynamic discovery.
     */
    function setupSuccessfulInstall(
        sourceComponentDef: string | null,
        destComponentDef: string = createDestComponentDef(),
        blockIds: string[] = DEFAULT_BLOCKS,
    ): void {
        mockGithubFileOps.listRepoFiles
            .mockResolvedValueOnce([]) // destination (empty — no existing blocks)
            .mockResolvedValueOnce(createBlockFileEntries(blockIds));

        mockGithubFileOps.getBlobContent.mockResolvedValue('export default function() {}');

        mockGithubFileOps.getFileContent.mockImplementation(
            async (owner: string, repo: string, path: string) => {
                // Return null for filters/models (not tested by comp-def tests)
                if (path === 'component-filters.json' || path === 'component-models.json') return null;
                if (owner === 'stephen-garner-adobe' && repo === 'isle5') {
                    if (sourceComponentDef === null) return null;
                    return { content: sourceComponentDef, sha: 'source-sha' };
                }
                return { content: destComponentDef, sha: 'dest-sha' };
            },
        );

        mockGithubFileOps.getBranchInfo.mockResolvedValue({
            treeSha: 'tree-sha',
            commitSha: 'commit-sha',
        });
        mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
        mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
        mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);
    }

    describe('dynamic block discovery', () => {
        it('should discover blocks dynamically from source blocks/ directory', async () => {
            // Given: Source has only 3 blocks
            const threeBlocks = ['hero-cta', 'newsletter', 'search-bar'];
            setupSuccessfulInstall(null, createDestComponentDef(), threeBlocks);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: blocksCount should be 3 (discovered)
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(3);
        });

        it('should return sorted blockIds in result', async () => {
            // Given: Source blocks in non-alphabetical order
            const unsortedBlocks = ['search-bar', 'blog-list', 'hero-cta'];
            setupSuccessfulInstall(null, createDestComponentDef(), unsortedBlocks);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: blockIds should be sorted alphabetically
            expect(result.blockIds).toEqual(['blog-list', 'hero-cta', 'search-bar']);
        });

        it('should discover blocks from deeply nested files', async () => {
            // Given: Source has files in nested subdirectories under blocks/
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce([
                    { path: 'blocks/hero-cta/hero-cta.js', mode: '100644', type: 'blob' as const, sha: 'sha-1' },
                    { path: 'blocks/hero-cta/styles/main.css', mode: '100644', type: 'blob' as const, sha: 'sha-2' },
                    { path: 'blocks/newsletter/newsletter.js', mode: '100644', type: 'blob' as const, sha: 'sha-3' },
                    { path: 'blocks/newsletter/templates/default.html', mode: '100644', type: 'blob' as const, sha: 'sha-4' },
                ]);
            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Should discover 2 blocks and install all 4 files
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);
            expect(result.blockIds).toEqual(['hero-cta', 'newsletter']);
            // All 4 files should be fetched
            expect(mockGithubFileOps.getBlobContent).toHaveBeenCalledTimes(4);
        });

        it('should ignore files directly in blocks/ (not in subdirectories)', async () => {
            // Given: Source has a file at blocks/README.md (not in a block subdirectory)
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce([
                    { path: 'blocks/README.md', mode: '100644', type: 'blob' as const, sha: 'sha-readme' },
                    { path: 'blocks/hero-cta/hero-cta.js', mode: '100644', type: 'blob' as const, sha: 'sha-1' },
                ]);
            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Only hero-cta should be discovered (not README.md as a "block")
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(1);
            expect(result.blockIds).toEqual(['hero-cta']);
            // Only 1 file fetched (hero-cta.js), not README.md
            expect(mockGithubFileOps.getBlobContent).toHaveBeenCalledTimes(1);
        });

        it('should discover any block from source regardless of name', async () => {
            // Given: Source has a "product-grid" block not previously known
            const novelBlocks = ['hero-cta', 'product-grid'];
            setupSuccessfulInstall(null, createDestComponentDef(), novelBlocks);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Both blocks should be discovered and installed
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(2);
            expect(result.blockIds).toContain('product-grid');
            expect(result.blockIds).toContain('hero-cta');
        });

        it('should install files for all discovered blocks', async () => {
            // Given: Source has 3 blocks
            const blocks = ['hero-cta', 'newsletter', 'product-grid'];
            setupSuccessfulInstall(null, createDestComponentDef(), blocks);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: All 3 block files should be fetched
            expect(result.success).toBe(true);
            expect(mockGithubFileOps.getBlobContent).toHaveBeenCalledTimes(3);

            // Verify tree entries include files for all 3 blocks
            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string }>;
            const blockPaths = treeEntries
                .filter(e => e.path.startsWith('blocks/'))
                .map(e => e.path);
            expect(blockPaths).toContain('blocks/hero-cta/hero-cta.js');
            expect(blockPaths).toContain('blocks/newsletter/newsletter.js');
            expect(blockPaths).toContain('blocks/product-grid/product-grid.js');
        });

        it('should include discovered block count in commit message', async () => {
            // Given: Source has only 5 blocks
            const fiveBlocks = ['blog-list', 'hero-cta', 'newsletter', 'search-bar', 'top-banner'];
            setupSuccessfulInstall(null, createDestComponentDef(), fiveBlocks);

            // When
            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Commit message should say "5 blocks"
            const commitMessage = mockGithubFileOps.createCommit.mock.calls[0][2] as string;
            expect(commitMessage).toContain('5 blocks');
        });

        it('should use libraryName in commit message when provided', async () => {
            // Given: Source has 3 blocks
            setupSuccessfulInstall(null, createDestComponentDef());

            // When: libraryName is passed
            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'Commerce Block Collection' }],
                mockLogger,
            );

            // Then: Commit message should use the library name
            const commitMessage = mockGithubFileOps.createCommit.mock.calls[0][2] as string;
            expect(commitMessage).toBe('chore: add Commerce Block Collection (3 blocks)');
        });

        it('should use default label in commit message when libraryName is omitted', async () => {
            // Given: Source has 3 blocks
            setupSuccessfulInstall(null, createDestComponentDef());

            // When: no libraryName passed
            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Commit message should use the default 'block collection' label
            const commitMessage = mockGithubFileOps.createCommit.mock.calls[0][2] as string;
            expect(commitMessage).toBe('chore: add block collection (3 blocks)');
        });

        it('should return discovered blockIds in result', async () => {
            // Given: Source has a specific set of blocks
            const differentBlocks = ['alpha-block', 'beta-block', 'gamma-block'];
            setupSuccessfulInstall(null, createDestComponentDef(), differentBlocks);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: blockIds should be the discovered blocks
            expect(result.blockIds).toEqual(['alpha-block', 'beta-block', 'gamma-block']);
            expect(result.blocksCount).toBe(3);
        });

        it('should handle source with no block files', async () => {
            // Given: Source has files but none in blocks/ subdirectories
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce([
                    { path: 'README.md', mode: '100644', type: 'blob' as const, sha: 'sha-1' },
                    { path: 'package.json', mode: '100644', type: 'blob' as const, sha: 'sha-2' },
                ]);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Should fail — source had no blocks at all
            expect(result.success).toBe(false);
            expect(result.blocksCount).toBe(0);
            expect(result.blockIds).toEqual([]);
            expect(result.error).toBe('No blocks found in source libraries');
        });

        it('should handle completely empty source repo', async () => {
            // Given: Source repo has no files at all
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce([]); // source (empty too)
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Should fail gracefully
            expect(result.success).toBe(false);
            expect(result.blocksCount).toBe(0);
            expect(result.blockIds).toEqual([]);
        });

        it('should succeed when all library blocks already exist in destination', async () => {
            // Given: Destination (template) already has all the blocks the library provides.
            // This is the normal case when the CitiSignal template ships with the demo-team blocks.
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([
                    // destination already has hero-cta and newsletter from template
                    { path: 'blocks/hero-cta/hero-cta.js', mode: '100644', type: 'blob' as const, sha: 'sha-d1' },
                    { path: 'blocks/newsletter/newsletter.js', mode: '100644', type: 'blob' as const, sha: 'sha-d2' },
                ])
                .mockResolvedValueOnce([
                    // source library has the same blocks — all duplicates
                    { path: 'blocks/hero-cta/hero-cta.js', mode: '100644', type: 'blob' as const, sha: 'sha-s1' },
                    { path: 'blocks/hero-cta/hero-cta.css', mode: '100644', type: 'blob' as const, sha: 'sha-s2' },
                    { path: 'blocks/newsletter/newsletter.js', mode: '100644', type: 'blob' as const, sha: 'sha-s3' },
                ]);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'Demo Team Block Collection' }],
                mockLogger,
            );

            // Then: success — nothing to copy, blocks were already there
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(0);
            expect(result.blockIds).toEqual([]);
            // No GitHub commit should be created (nothing to write)
            expect(mockGithubFileOps.createCommit).not.toHaveBeenCalled();
        });

        it('should deduplicate block IDs from multiple files in same directory', async () => {
            // Given: Source has multiple files per block directory
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce([
                    { path: 'blocks/hero-cta/hero-cta.js', mode: '100644', type: 'blob' as const, sha: 'sha-1' },
                    { path: 'blocks/hero-cta/hero-cta.css', mode: '100644', type: 'blob' as const, sha: 'sha-2' },
                    { path: 'blocks/hero-cta/icons/arrow.svg', mode: '100644', type: 'blob' as const, sha: 'sha-3' },
                    { path: 'blocks/newsletter/newsletter.js', mode: '100644', type: 'blob' as const, sha: 'sha-4' },
                ]);
            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Should discover 2 unique blocks (not 4)
            expect(result.blocksCount).toBe(2);
            expect(result.blockIds).toEqual(['hero-cta', 'newsletter']);
        });

        it('should discover single block', async () => {
            // Given: Source has exactly one block
            setupSuccessfulInstall(null, createDestComponentDef(), ['top-banner']);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(1);
            expect(result.blockIds).toEqual(['top-banner']);
        });

        it('should not include files outside blocks/ in block file filtering', async () => {
            // Given: Source has blocks/ files mixed with other files
            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce([
                    { path: 'blocks/hero-cta/hero-cta.js', mode: '100644', type: 'blob' as const, sha: 'sha-1' },
                    { path: 'scripts/main.js', mode: '100644', type: 'blob' as const, sha: 'sha-2' },
                    { path: 'styles/global.css', mode: '100644', type: 'blob' as const, sha: 'sha-3' },
                    { path: 'component-definition.json', mode: '100644', type: 'blob' as const, sha: 'sha-4' },
                ]);
            mockGithubFileOps.getBlobContent.mockResolvedValue('content');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Only 1 block file fetched, non-blocks/ files excluded
            expect(result.blocksCount).toBe(1);
            expect(mockGithubFileOps.getBlobContent).toHaveBeenCalledTimes(1);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string }>;
            const blockPaths = treeEntries.filter(e => e.path.startsWith('blocks/'));
            expect(blockPaths).toHaveLength(1);
        });

        it('should log correct count for dynamically discovered blocks', async () => {
            // Given: Source has 4 blocks
            const fourBlocks = ['blog-list', 'hero-cta', 'newsletter', 'top-banner'];
            setupSuccessfulInstall(null, createDestComponentDef(), fourBlocks);

            // When
            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Log message should reference 4 blocks
            const infoCalls = (mockLogger.info as jest.Mock).mock.calls.map(
                (c: unknown[]) => c[0] as string,
            );
            const completedLog = infoCalls.find(msg => msg.includes('Installed'));
            expect(completedLog).toContain('4 blocks');
        });
    });
});
