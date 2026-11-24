/**
 * Block Collection Helpers - Multi-Library Tests: Template Preservation
 *
 * Tests for installBlockCollections (plural) covering template block
 * preservation (regression tests): a block the storefront already has is never
 * overwritten, by one library or several. The component-definition, filters and
 * models merges this suite also covered were removed with EDS-71 step 6.
 */

import {
    installBlockCollections,
} from '@/features/eds/services/blockCollectionHelpers';
import type { Logger } from '@/types/logger';
import type { AddonSource } from '@/types/demoPackages';
import {
    createBlockFileEntries,
    setupBlockCollectionMocks,
    type MockGithubFileOps,
} from './blockCollectionHelpers.testUtils';

describe('installBlockCollections', () => {
    const SOURCE_A: AddonSource = { owner: 'adobe', repo: 'isle5', branch: 'main' };
    const SOURCE_B: AddonSource = { owner: 'partner', repo: 'custom-blocks', branch: 'v2' };
    let mockGithubFileOps: MockGithubFileOps;
    let mockLogger: jest.Mocked<Logger>;

    /**
     * The four mocks every write path needs: a branch to read, a tree/commit to
     * create, a ref to move.
     */
    function mockGitWriteSucceeds(): void {
        mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
        mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
        mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
        mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);
    }

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockLogger, mockGithubFileOps } = setupBlockCollectionMocks());
    });

    describe('template block preservation (regression)', () => {
        it('should not overwrite blocks that already exist in the destination repo', async () => {
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
            mockGitWriteSucceeds();

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
            mockGitWriteSucceeds();

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
            mockGitWriteSucceeds();

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
            mockGitWriteSucceeds();

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
});
