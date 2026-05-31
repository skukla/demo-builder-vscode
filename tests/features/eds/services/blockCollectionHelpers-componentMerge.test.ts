/**
 * Block Collection Helpers - Single Library: Component Definition & Filters Merge
 *
 * Tests merging of discovered blocks into component-definition.json and
 * component-filters.json. Shared fixture builders live in
 * blockCollectionHelpers.testUtils.ts.
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
    createComponentFilters,
    createDestComponentFilters,
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
});
