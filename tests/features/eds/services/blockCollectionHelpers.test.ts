/**
 * Block Collection Helpers - Single Library Tests
 *
 * Tests for single-library block discovery and component-definition.json merging.
 *
 * Multi-library tests (deduplication, atomic commit, version tracking) are in
 * blockCollectionHelpers-multiLibrary.test.ts.
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

/** Create a source component-models.json (flat array of model objects) */
function createComponentModels(
    models: Array<{ id: string; fields?: Array<{ name: string; component: string }> }>,
): string {
    return JSON.stringify(models.map(m => ({
        id: m.id,
        fields: m.fields ?? [{ component: 'text', name: 'text', label: 'Text', valueType: 'string' }],
    })));
}

/** Create a destination component-models.json with common defaults */
function createDestComponentModels(
    models: Array<{ id: string }> = [
        { id: 'hero' }, { id: 'cards' }, { id: 'section' }, { id: 'page-metadata' },
    ],
): string {
    return JSON.stringify(models.map(m => ({
        id: m.id,
        fields: [{ component: 'text', name: 'text', label: 'Text', valueType: 'string' }],
    })));
}

/** Create mock file entries for blocks/ directories */
function createBlockFileEntries(
    blockIds: string[],
    extraFiles: Array<{ path: string; sha: string }> = [],
): Array<{ path: string; mode: string; type: 'blob'; sha: string }> {
    const blockEntries = blockIds.map(id => ({
        path: `blocks/${id}/${id}.js`,
        mode: '100644',
        type: 'blob' as const,
        sha: `sha-${id}`,
    }));
    const extras = extraFiles.map(f => ({
        path: f.path,
        mode: '100644',
        type: 'blob' as const,
        sha: f.sha,
    }));
    return [...blockEntries, ...extras];
}

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

    // ---------------------------------------------------------------
    // Component definition merge tests (source repo is sole authority)
    // ---------------------------------------------------------------
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

    // ---------------------------------------------------------------
    // Dynamic block discovery tests
    // ---------------------------------------------------------------
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

            // Then: Should fail with "No block files found"
            expect(result.success).toBe(false);
            expect(result.blocksCount).toBe(0);
            expect(result.blockIds).toEqual([]);
            expect(result.error).toBe('No block files found');
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

    // ---------------------------------------------------------------
    // Discovery + component definition merge integration tests
    // ---------------------------------------------------------------
    describe('discovery with component definition merge', () => {
        it('should not add metadata when source component-def is missing', async () => {
            // Given: Source has 2 blocks, no source component-def
            const blocks = ['hero-cta', 'newsletter'];
            setupSuccessfulInstall(null, createDestComponentDef(), blocks);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Files installed, but no component-def entry
            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeUndefined();
        });

        it('should not add metadata for blocks without source entries', async () => {
            // Given: Source has a block with NO entry in source comp-def
            const blocks = ['product-grid'];
            setupSuccessfulInstall(null, createDestComponentDef(), blocks);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Files installed, but no component-def entry for product-grid
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(1);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;

            // Block files should be in tree
            const blockFiles = treeEntries.filter(e => e.path.startsWith('blocks/'));
            expect(blockFiles).toHaveLength(1);

            // component-definition.json should NOT be added (no entries to merge)
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeUndefined();
        });

        it('should include source component-def entries for discovered blocks', async () => {
            // Given: Source has "product-grid" block with an entry in source comp-def
            const blocks = ['product-grid'];
            const sourceComponentDef = createComponentDef([
                { title: 'Product Grid', id: 'product-grid', unsafeHTML: '<div class="product-grid">Grid</div>' },
            ]);
            setupSuccessfulInstall(sourceComponentDef, createDestComponentDef(), blocks);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: product-grid should appear in merged component-def via source
            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeDefined();

            const merged = JSON.parse(compDefEntry!.content!);
            const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
            const productGrid = blocksGroup.components.find(
                (c: { id: string }) => c.id === 'product-grid',
            );
            expect(productGrid).toBeDefined();
            expect(productGrid.plugins.da.unsafeHTML).toBe('<div class="product-grid">Grid</div>');
        });

        it('should only add metadata for blocks with source entries', async () => {
            // Given: Source has 3 blocks, but source comp-def only has entries for 1
            const blocks = ['hero-cta', 'product-grid', 'newsletter'];
            const sourceComponentDef = createComponentDef([
                { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: '<div class="hero-cta">source</div>' },
            ]);
            setupSuccessfulInstall(sourceComponentDef, createDestComponentDef(), blocks);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: All 3 blocks discovered, but only hero-cta gets a comp-def entry
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(3);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeDefined();

            const merged = JSON.parse(compDefEntry!.content!);
            const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
            const mergedIds = blocksGroup.components.map((c: { id: string }) => c.id);

            // Only hero-cta has a source entry
            expect(mergedIds).toContain('hero-cta');

            // product-grid and newsletter have no source entries
            expect(mergedIds).not.toContain('product-grid');
            expect(mergedIds).not.toContain('newsletter');
        });

        it('should include sub-components for dynamically discovered blocks from source', async () => {
            // Given: Source has product-grid with sub-components in source comp-def
            const blocks = ['product-grid'];
            const sourceComponentDef = JSON.stringify({
                groups: [{
                    id: 'blocks',
                    title: 'Blocks',
                    components: [
                        { title: 'Product Grid', id: 'product-grid', plugins: { da: { name: 'product-grid' } } },
                        { title: 'Product Grid Item', id: 'product-grid-item', plugins: { da: { name: 'product-grid-item' } } },
                    ],
                }],
            });
            setupSuccessfulInstall(sourceComponentDef, createDestComponentDef(), blocks);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Both parent and sub-component should be in merged comp-def
            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeDefined();

            const merged = JSON.parse(compDefEntry!.content!);
            const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
            const mergedIds = blocksGroup.components.map((c: { id: string }) => c.id);

            expect(mergedIds).toContain('product-grid');
            expect(mergedIds).toContain('product-grid-item');
        });

        it('should use source entry metadata as provided', async () => {
            // Given: Source has hero-cta with specific metadata
            const blocks = ['hero-cta'];
            const sourceHtml = '<div class="hero-cta">Custom Source Version</div>';
            const sourceComponentDef = createComponentDef([
                { title: 'Hero CTA Custom', id: 'hero-cta', unsafeHTML: sourceHtml },
            ]);
            setupSuccessfulInstall(sourceComponentDef, createDestComponentDef(), blocks);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Source entry metadata should be used verbatim
            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            const merged = JSON.parse(compDefEntry!.content!);
            const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
            const heroCta = blocksGroup.components.find(
                (c: { id: string }) => c.id === 'hero-cta',
            );
            expect(heroCta.plugins.da.unsafeHTML).toBe(sourceHtml);
        });

        it('should only add entries for blocks that are actually discovered', async () => {
            // Given: Source has 2 blocks, source comp-def has entries for both
            const twoBlocks = ['blog-list', 'top-banner'];
            const sourceComponentDef = createComponentDef([
                { title: 'Blog List', id: 'blog-list', unsafeHTML: '<div class="blog-list">source</div>' },
                { title: 'Top Banner', id: 'top-banner', unsafeHTML: '<div class="top-banner">source</div>' },
                { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: '<div class="hero-cta">source</div>' },
            ]);
            setupSuccessfulInstall(sourceComponentDef, createDestComponentDef(), twoBlocks);

            // When
            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            // Then: Only 2 entries added (matching discovered blocks)
            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeDefined();

            const merged = JSON.parse(compDefEntry!.content!);
            const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
            const customBlockIds = blocksGroup.components
                .map((c: { id: string }) => c.id)
                .filter((id: string) => ['blog-list', 'top-banner'].includes(id));
            expect(customBlockIds).toHaveLength(2);

            // hero-cta is in source comp-def but not discovered, so not included
            const heroEntry = blocksGroup.components.find(
                (c: { id: string }) => c.id === 'hero-cta',
            );
            expect(heroEntry).toBeUndefined();
        });
    });

    // ---------------------------------------------------------------
    // Component-filters merge tests
    // ---------------------------------------------------------------
    describe('component-filters merge', () => {
        /** Set up mocks for filter merge tests with path-based dispatch. */
        function setupFilterInstall(opts: {
            blockIds?: string[];
            sourceCompDef?: string | null;
            sourceFilters?: string | null;
            destCompDef?: string;
            destFilters?: string | null;
        }): void {
            const blockIds = opts.blockIds ?? ['hero-cta', 'newsletter'];

            mockGithubFileOps.listRepoFiles
                .mockResolvedValueOnce([]) // destination (empty)
                .mockResolvedValueOnce(createBlockFileEntries(blockIds));

            mockGithubFileOps.getBlobContent.mockResolvedValue('export default function() {}');

            mockGithubFileOps.getFileContent.mockImplementation(
                async (owner: string, repo: string, path: string) => {
                    if (path === 'component-models.json') return null;
                    if (owner === 'stephen-garner-adobe' && repo === 'isle5') {
                        if (path === 'component-filters.json') {
                            if (opts.sourceFilters === null) return null;
                            return { content: opts.sourceFilters, sha: 'sha-cf' };
                        }
                        if (opts.sourceCompDef === null) return null;
                        return { content: opts.sourceCompDef ?? null, sha: 'sha-cd' };
                    }
                    // destination
                    if (path === 'component-filters.json') {
                        if (opts.destFilters === null || opts.destFilters === undefined) return null;
                        return { content: opts.destFilters, sha: 'dest-sha-cf' };
                    }
                    return { content: opts.destCompDef ?? createDestComponentDef(), sha: 'dest-sha' };
                },
            );

            mockGithubFileOps.getBranchInfo.mockResolvedValue({
                treeSha: 'tree-sha', commitSha: 'commit-sha',
            });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);
        }

        it('should merge component-filters.json with library block IDs', async () => {
            const sourceFilters = createComponentFilters(['hero-cta', 'newsletter']);
            const destFilters = createDestComponentFilters();

            setupFilterInstall({
                blockIds: ['hero-cta', 'newsletter'],
                sourceCompDef: null,
                sourceFilters,
                destFilters,
            });

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const filtersEntry = treeEntries.find(e => e.path === 'component-filters.json');
            expect(filtersEntry).toBeDefined();

            const merged = JSON.parse(filtersEntry!.content!);
            const sectionFilter = merged.find((f: { id: string }) => f.id === 'section');
            expect(sectionFilter.components).toContain('hero-cta');
            expect(sectionFilter.components).toContain('newsletter');
        });

        it('should add sub-component filter entries', async () => {
            const sourceFilters = createComponentFilters(
                ['tabs'],
                [{ id: 'tabs', components: ['tabs-item'] }],
            );
            const destFilters = createDestComponentFilters();

            setupFilterInstall({
                blockIds: ['tabs'],
                sourceCompDef: null,
                sourceFilters,
                destFilters,
            });

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const filtersEntry = treeEntries.find(e => e.path === 'component-filters.json');
            expect(filtersEntry).toBeDefined();

            const merged = JSON.parse(filtersEntry!.content!);
            // Sub-component filter entry should be present
            const tabsFilter = merged.find((f: { id: string }) => f.id === 'tabs');
            expect(tabsFilter).toBeDefined();
            expect(tabsFilter.components).toContain('tabs-item');
        });

        it('should not duplicate existing filter entries', async () => {
            // Source section has 'hero' which already exists in destination
            const sourceFilters = createComponentFilters(['hero', 'newsletter']);
            const destFilters = createDestComponentFilters(); // already has 'hero'

            setupFilterInstall({
                blockIds: ['hero', 'newsletter'],
                sourceCompDef: null,
                sourceFilters,
                destFilters,
            });

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
            const filtersEntry = treeEntries.find(e => e.path === 'component-filters.json');
            expect(filtersEntry).toBeDefined();

            const merged = JSON.parse(filtersEntry!.content!);
            const sectionFilter = merged.find((f: { id: string }) => f.id === 'section');
            // 'hero' should appear only once
            const heroCount = sectionFilter.components.filter((c: string) => c === 'hero').length;
            expect(heroCount).toBe(1);
            // 'newsletter' should be added
            expect(sectionFilter.components).toContain('newsletter');
        });

        it('should handle missing source component-filters.json', async () => {
            setupFilterInstall({
                blockIds: ['hero-cta'],
                sourceCompDef: null,
                sourceFilters: null, // source has no filters
                destFilters: createDestComponentFilters(),
            });

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string }>;
            const filtersEntry = treeEntries.find(e => e.path === 'component-filters.json');
            expect(filtersEntry).toBeUndefined();
        });

        it('should handle missing destination component-filters.json', async () => {
            const sourceFilters = createComponentFilters(['hero-cta']);

            setupFilterInstall({
                blockIds: ['hero-cta'],
                sourceCompDef: null,
                sourceFilters,
                destFilters: null, // destination has no filters
            });

            const result = await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: TEST_SOURCE, name: 'block collection' }],
                mockLogger,
            );

            expect(result.success).toBe(true);

            const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
            const treeEntries = createTreeCall[2] as Array<{ path: string }>;
            const filtersEntry = treeEntries.find(e => e.path === 'component-filters.json');
            expect(filtersEntry).toBeUndefined();
        });
    });

    // ---------------------------------------------------------------
    // Component-models merge tests
    // ---------------------------------------------------------------
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

    // ---------------------------------------------------------------
    // Error handling
    // ---------------------------------------------------------------
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
