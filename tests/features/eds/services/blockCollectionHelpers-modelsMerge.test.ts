/**
 * Block Collection Helpers - Single Library: Component Models Merge
 *
 * Tests merging of discovered blocks into component-models.json. Shared fixture
 * builders live in blockCollectionHelpers.testUtils.ts.
 */

import {
    installBlockCollections,
} from '@/features/eds/services/blockCollectionHelpers';
import type { Logger } from '@/types/logger';
import type { GitHubFileOperations } from '@/features/eds/services/githubFileOperations';
import type { AddonSource } from '@/types/demoPackages';
import {
    createDestComponentDef,
    createComponentModels,
    createDestComponentModels,
    createBlockFileEntries,
} from './blockCollectionHelpers.testUtils';

describe('installBlockCollections (single library)', () => {
    const TEST_SOURCE: AddonSource = { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' };
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

    describe('component-models merge', () => {
        /** Set up mocks for models merge tests with path-based dispatch. */
        function setupModelsInstall(opts: {
            blockIds?: string[];
            sourceModels?: string | null;
            destModels?: string | null;
        }): void {
            const blockIds = opts.blockIds ?? ['hero-v2', 'tabs'];

            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(blockIds));

            mockGithubFileOps.getBlobContent.mockResolvedValue('export default function() {}');

            mockGithubFileOps.getFileContent.mockImplementation(
                async (owner: string, repo: string, path: string) => {
                    if (owner === 'stephen-garner-adobe' && repo === 'isle5') {
                        if (path === 'component-models.json') {
                            if (opts.sourceModels === null) return null;
                            return { content: opts.sourceModels, sha: 'sha-cm' };
                        }
                        return null; // no comp-def or filters for these tests
                    }
                    // destination
                    if (path === 'component-models.json') {
                        if (opts.destModels === null || opts.destModels === undefined) return null;
                        return { content: opts.destModels, sha: 'dest-sha-cm' };
                    }
                    if (path === 'component-definition.json') {
                        return { content: createDestComponentDef(), sha: 'dest-sha' };
                    }
                    return null;
                },
            );

            mockGithubFileOps.getBranchInfo.mockResolvedValue({
                treeSha: 'tree-sha', commitSha: 'commit-sha',
            });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);
        }

        it('should merge component-models.json with library model entries', async () => {
            const sourceModels = createComponentModels([
                { id: 'hero-v2', fields: [{ name: 'title', component: 'text' }] },
                { id: 'tabs', fields: [{ name: 'label', component: 'text' }] },
            ]);
            const destModels = createDestComponentModels();

            setupModelsInstall({
                blockIds: ['hero-v2', 'tabs'],
                sourceModels,
                destModels,
            });

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const modelsEntry = treeEntries.find(e => e.path === 'component-models.json');
            expect(modelsEntry).toBeDefined();

            const merged = JSON.parse(modelsEntry!.content!);
            const ids = merged.map((m: { id: string }) => m.id);
            expect(ids).toContain('hero-v2');
            expect(ids).toContain('tabs');
            // Existing models should still be present
            expect(ids).toContain('hero');
            expect(ids).toContain('cards');
        });

        it('should not duplicate existing model entries', async () => {
            // Source has 'hero' which already exists in destination
            const sourceModels = createComponentModels([
                { id: 'hero' }, { id: 'hero-v2' },
            ]);
            const destModels = createDestComponentModels(); // already has 'hero'

            setupModelsInstall({
                blockIds: ['hero', 'hero-v2'],
                sourceModels,
                destModels,
            });

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const modelsEntry = treeEntries.find(e => e.path === 'component-models.json');
            expect(modelsEntry).toBeDefined();

            const merged = JSON.parse(modelsEntry!.content!);
            const heroCount = merged.filter((m: { id: string }) => m.id === 'hero').length;
            expect(heroCount).toBe(1);
        });

        it('should handle missing source component-models.json', async () => {
            setupModelsInstall({
                blockIds: ['hero-v2'],
                sourceModels: null,
                destModels: createDestComponentModels(),
            });

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string }>;
            const modelsEntry = treeEntries.find(e => e.path === 'component-models.json');
            expect(modelsEntry).toBeUndefined();
        });

        it('should handle missing destination component-models.json', async () => {
            const sourceModels = createComponentModels([{ id: 'hero-v2' }]);

            setupModelsInstall({
                blockIds: ['hero-v2'],
                sourceModels,
                destModels: null,
            });

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string }>;
            const modelsEntry = treeEntries.find(e => e.path === 'component-models.json');
            expect(modelsEntry).toBeUndefined();
        });

        it('should include sub-component models matching block ID prefix', async () => {
            // tabs-item model should be included because 'tabs' is a block ID
            const sourceModels = createComponentModels([
                { id: 'tabs', fields: [{ name: 'label', component: 'text' }] },
                { id: 'tabs-item', fields: [{ name: 'content', component: 'text' }] },
            ]);
            const destModels = createDestComponentModels();

            setupModelsInstall({
                blockIds: ['tabs'],
                sourceModels,
                destModels,
            });

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const modelsEntry = treeEntries.find(e => e.path === 'component-models.json');
            expect(modelsEntry).toBeDefined();

            const merged = JSON.parse(modelsEntry!.content!);
            const ids = merged.map((m: { id: string }) => m.id);
            expect(ids).toContain('tabs');
            expect(ids).toContain('tabs-item');
        });
    });
});
