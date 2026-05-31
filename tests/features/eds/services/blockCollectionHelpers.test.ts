/**
 * Block Collection Helpers - Single Library: Component Definition Merge
 *
 * Tests for single-library block discovery and component-definition.json merging,
 * plus install error handling. Shared fixture builders live in
 * blockCollectionHelpers.testUtils.ts.
 *
 * Related suites:
 *   - blockCollectionHelpers-discovery.test.ts        (dynamic block discovery)
 *   - blockCollectionHelpers-componentMerge.test.ts   (discovery + comp-def, filters merge)
 *   - blockCollectionHelpers-modelsMerge.test.ts       (component-models merge)
 *   - blockCollectionHelpers-multiLibrary-merging.test.ts (multi-library)
 */

import {
    installBlockCollections,
} from '@/features/eds/services/blockCollectionHelpers';
import type { Logger } from '@/types/logger';
import type { GitHubFileOperations } from '@/features/eds/services/githubFileOperations';
import type { AddonSource } from '@/types/demoPackages';
import {
    createComponentDef,
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

    describe('component definition merge', () => {
        it('should use source entries when they exist', async () => {
            const isle5Html = '<div class="circle-carousel">isle5 version</div>';
            const sourceComponentDef = createComponentDef([
                { title: 'Circle Carousel', id: 'circle-carousel', unsafeHTML: isle5Html },
            ]);

            setupSuccessfulInstall(sourceComponentDef, createDestComponentDef(), ['circle-carousel']);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeDefined();

            const merged = JSON.parse(compDefEntry!.content!);
            const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
            const circleEntry = blocksGroup.components.find(
                (c: { id: string }) => c.id === 'circle-carousel',
            );
            expect(circleEntry.plugins.da.unsafeHTML).toBe(isle5Html);
        });

        it('should not add component-definition entries when source has no matching blocks', async () => {
            // Source comp-def has entries, but none match discovered blocks
            const sourceComponentDef = createComponentDef([
                { title: 'Columns', id: 'columns' },
            ]);

            setupSuccessfulInstall(sourceComponentDef);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            // Block files are still installed
            expect(result.blocksCount).toBe(3);

            // But no component-definition.json entry (source has no matching entries)
            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeUndefined();
        });

        it('should merge only blocks present in source component-definition', async () => {
            // Source comp-def has 2 of 3 discovered blocks
            const sourceComponentDef = createComponentDef([
                { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: '<div class="hero-cta">source</div>' },
                { title: 'Newsletter', id: 'newsletter', unsafeHTML: '<div class="newsletter">source</div>' },
                { title: 'Columns', id: 'columns' },
            ]);

            setupSuccessfulInstall(sourceComponentDef);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
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

            // hero-cta and newsletter are in source comp-def
            expect(mergedIds).toContain('hero-cta');
            expect(mergedIds).toContain('newsletter');

            // search-bar has no source entry, so no metadata added
            expect(mergedIds).not.toContain('search-bar');

            // columns is not a discovered block, so not included
            expect(mergedIds).not.toContain('columns');
        });

        it('should not add component-definition.json when source file is missing', async () => {
            setupSuccessfulInstall(null);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeUndefined();
        });

        it('should not add component-definition.json when source has no blocks group', async () => {
            const sourceComponentDef = JSON.stringify({
                groups: [{ id: 'other', title: 'Other', components: [] }],
            });

            setupSuccessfulInstall(sourceComponentDef);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeUndefined();
        });

        it('should extract sub-component entries alongside parent blocks from source', async () => {
            const sourceComponentDef = JSON.stringify({
                groups: [{
                    id: 'blocks',
                    title: 'Blocks',
                    components: [
                        { title: 'Circle Carousel', id: 'circle-carousel', plugins: { da: { name: 'circle-carousel', rows: 8, columns: 2 } } },
                        { title: 'Circle Carousel Item', id: 'circle-carousel-item', plugins: { da: { name: 'circle-carousel-item' } } },
                        { title: 'Circle Carousel Cell', id: 'circle-carousel-cell', plugins: { da: { unsafeHTML: '<div></div>' } } },
                        { title: 'Store Locator', id: 'store-locator', plugins: { da: { name: 'store-locator', rows: 20, columns: 6 } } },
                        { title: 'Store Locator Item', id: 'store-locator-item', plugins: { da: { name: 'store-locator-item' } } },
                        { title: 'Store Locator Cell', id: 'store-locator-cell', plugins: { da: { unsafeHTML: '<div></div>' } } },
                        { title: 'Hero CTA', id: 'hero-cta', plugins: { da: { name: 'hero-cta', rows: 8, columns: 4 } } },
                        { title: 'Columns', id: 'columns', plugins: { da: { name: 'columns' } } },
                    ],
                }],
            });

            const blocks = ['circle-carousel', 'store-locator', 'hero-cta'];
            setupSuccessfulInstall(sourceComponentDef, createDestComponentDef(), blocks);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
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

            expect(mergedIds).toContain('circle-carousel');
            expect(mergedIds).toContain('store-locator');
            expect(mergedIds).toContain('hero-cta');

            expect(mergedIds).toContain('circle-carousel-item');
            expect(mergedIds).toContain('circle-carousel-cell');
            expect(mergedIds).toContain('store-locator-item');
            expect(mergedIds).toContain('store-locator-cell');

            // Columns is not a discovered block, so should not be included
            expect(mergedIds).not.toContain('columns');
        });

        it('should use provided source config for GitHub API calls', async () => {
            const customSource: AddonSource = { owner: 'my-org', repo: 'my-blocks', branch: 'develop' };

            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(['hero-cta', 'newsletter']));
            mockGithubFileOps.getBlobContent.mockResolvedValue('export default function() {}');
            mockGithubFileOps.getFileContent.mockResolvedValue(null);
            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: customSource, name: 'block collection' }],
                mockLogger,
            );

            expect(mockGithubFileOps.listRepoFiles).toHaveBeenCalledWith('my-org', 'my-blocks', 'develop');

            expect(mockGithubFileOps.getFileContent).toHaveBeenCalledWith(
                'my-org', 'my-blocks', 'component-definition.json',
            );
        });

        it('should create blocks group when dest has no blocks group', async () => {
            const destDef = JSON.stringify({
                groups: [{ id: 'other', title: 'Other', components: [] }],
            });

            const sourceComponentDef = createComponentDef([
                { title: 'Hero CTA', id: 'hero-cta' },
            ]);

            setupSuccessfulInstall(sourceComponentDef, destDef, ['hero-cta']);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeDefined();

            const merged = JSON.parse(compDefEntry!.content!);
            const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
            expect(blocksGroup).toBeDefined();
            expect(blocksGroup.components[0].id).toBe('hero-cta');
        });

        it('should deduplicate entries already in destination', async () => {
            // Destination already has hero-cta
            const destDef = createDestComponentDef([
                { title: 'Hero', id: 'hero' },
                { title: 'Hero CTA', id: 'hero-cta' },
            ]);
            const sourceComponentDef = createComponentDef([
                { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: '<div class="hero-cta">source</div>' },
                { title: 'Newsletter', id: 'newsletter', unsafeHTML: '<div class="newsletter">source</div>' },
            ]);

            setupSuccessfulInstall(sourceComponentDef, destDef, ['hero-cta', 'newsletter']);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
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

            // newsletter should be added (new)
            expect(mergedIds).toContain('newsletter');

            // hero-cta should appear only once (already in dest, so not duplicated)
            const heroCtaCount = mergedIds.filter((id: string) => id === 'hero-cta').length;
            expect(heroCtaCount).toBe(1);
        });

        it('should return null (no comp-def) when all source entries already exist in dest', async () => {
            // Destination already has all blocks the source would add
            const destDef = createDestComponentDef([
                { title: 'Hero CTA', id: 'hero-cta' },
                { title: 'Newsletter', id: 'newsletter' },
            ]);
            const sourceComponentDef = createComponentDef([
                { title: 'Hero CTA', id: 'hero-cta' },
                { title: 'Newsletter', id: 'newsletter' },
            ]);

            setupSuccessfulInstall(sourceComponentDef, destDef, ['hero-cta', 'newsletter']);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeUndefined();
        });

        it('should extract entries from non-blocks groups', async () => {
            // Source has product-teaser in 'product' group (not 'blocks')
            const sourceComponentDef = JSON.stringify({
                groups: [
                    {
                        id: 'blocks',
                        title: 'Blocks',
                        components: [
                            { title: 'Hero CTA', id: 'hero-cta', plugins: { da: { name: 'hero-cta' } } },
                        ],
                    },
                    {
                        id: 'product',
                        title: 'Product',
                        components: [
                            { title: 'Product Teaser', id: 'product-teaser', plugins: { da: { name: 'product-teaser' } } },
                        ],
                    },
                ],
            });
            // Destination has both groups
            const destDef = JSON.stringify({
                groups: [
                    { id: 'blocks', title: 'Blocks', components: [{ title: 'Hero', id: 'hero' }] },
                    { id: 'product', title: 'Product', components: [] },
                ],
            });

            setupSuccessfulInstall(sourceComponentDef, destDef, ['hero-cta', 'product-teaser']);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeDefined();

            const merged = JSON.parse(compDefEntry!.content!);
            // product-teaser should be in the 'product' group
            const productGroup = merged.groups.find((g: { id: string }) => g.id === 'product');
            expect(productGroup).toBeDefined();
            const productIds = productGroup.components.map((c: { id: string }) => c.id);
            expect(productIds).toContain('product-teaser');

            // hero-cta should be in the 'blocks' group
            const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
            const blocksIds = blocksGroup.components.map((c: { id: string }) => c.id);
            expect(blocksIds).toContain('hero-cta');
        });

        it('should create destination group when it does not exist', async () => {
            // Source has product-teaser in 'product' group
            // Destination has NO 'product' group
            const sourceComponentDef = JSON.stringify({
                groups: [
                    {
                        id: 'product',
                        title: 'Product',
                        components: [
                            { title: 'Product Teaser', id: 'product-teaser', plugins: { da: { name: 'product-teaser' } } },
                        ],
                    },
                ],
            });
            const destDef = JSON.stringify({
                groups: [
                    { id: 'blocks', title: 'Blocks', components: [{ title: 'Hero', id: 'hero' }] },
                ],
            });

            setupSuccessfulInstall(sourceComponentDef, destDef, ['product-teaser']);

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeDefined();

            const merged = JSON.parse(compDefEntry!.content!);
            // A new 'product' group should have been created
            const productGroup = merged.groups.find((g: { id: string }) => g.id === 'product');
            expect(productGroup).toBeDefined();
            expect(productGroup.title).toBe('Product');
            const productIds = productGroup.components.map((c: { id: string }) => c.id);
            expect(productIds).toContain('product-teaser');

            // Existing 'blocks' group should be untouched
            const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
            expect(blocksGroup.components).toHaveLength(1);
            expect(blocksGroup.components[0].id).toBe('hero');
        });
    });

    describe('error handling', () => {
        it('should return error result on API failure', async () => {
            mockGithubFileOps.listRepoFiles.mockRejectedValue(new Error('API rate limit'));

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('API rate limit');
            expect(result.blocksCount).toBe(0);
            expect(result.blockIds).toEqual([]);
        });

        it('should return error result on commit failure', async () => {
            setupSuccessfulInstall(null);
            mockGithubFileOps.createCommit.mockRejectedValue(new Error('Commit failed'));

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('Commit failed');
        });
    });
});
