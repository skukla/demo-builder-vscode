/**
 * Block Collection Helpers Tests
 *
 * Tests for CUSTOM_BLOCK_DEFINITIONS completeness and the fallback logic
 * in buildMergedComponentDefinition (exercised via installBlockCollection).
 */

import {
    installBlockCollection,
    CUSTOM_BLOCK_DEFINITIONS,
} from '@/features/eds/services/blockCollectionHelpers';
import type { Logger } from '@/types/logger';
import type { GitHubFileOperations } from '@/features/eds/services/githubFileOperations';
import type { AddonSource } from '@/types/demoPackages';

describe('CUSTOM_BLOCK_DEFINITIONS', () => {
    const EXPECTED_BLOCK_IDS = [
        'blog-list',
        'blog-post',
        'blog-tiles',
        'circle-carousel',
        'hero-cta',
        'newsletter',
        'promotional-hero',
        'search-bar',
        'store-locator',
        'top-banner',
    ];

    it('should contain all 10 custom block IDs', () => {
        const ids = CUSTOM_BLOCK_DEFINITIONS.map(d => d.id);
        expect(ids).toEqual(expect.arrayContaining(EXPECTED_BLOCK_IDS));
        expect(ids).toHaveLength(EXPECTED_BLOCK_IDS.length);
    });

    it('should have non-empty title for each block', () => {
        for (const def of CUSTOM_BLOCK_DEFINITIONS) {
            expect(def.title).toBeTruthy();
            expect(def.title.length).toBeGreaterThan(0);
        }
    });

    it('should have non-empty unsafeHTML for each block', () => {
        for (const def of CUSTOM_BLOCK_DEFINITIONS) {
            expect(def.unsafeHTML).toBeTruthy();
            expect(def.unsafeHTML.length).toBeGreaterThan(0);
        }
    });

    it('should have unsafeHTML containing the block class name', () => {
        for (const def of CUSTOM_BLOCK_DEFINITIONS) {
            expect(def.unsafeHTML).toContain(`class="${def.id}"`);
        }
    });
});

describe('installBlockCollection fallback logic', () => {
    const TEST_SOURCE: AddonSource = { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' };
    let mockGithubFileOps: jest.Mocked<GitHubFileOperations>;
    let mockLogger: Logger;

    /**
     * Helper to create a component-definition.json with specified blocks
     */
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

    /**
     * Helper to create a destination component-definition.json with existing blocks
     */
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

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

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
     * Set up mocks for a successful installBlockCollection call.
     * The key mock is getFileContent which controls whether isle5 or fallback
     * definitions are used for component-definition.json merge.
     */
    function setupSuccessfulInstall(
        sourceComponentDef: string | null,
        destComponentDef: string = createDestComponentDef(),
    ): void {
        // listRepoFiles: return at least one file per block
        mockGithubFileOps.listRepoFiles.mockResolvedValue(
            CUSTOM_BLOCK_DEFINITIONS.map(def => ({
                path: `blocks/${def.id}/${def.id}.js`,
                mode: '100644',
                type: 'blob' as const,
                sha: `sha-${def.id}`,
            })),
        );

        // getBlobContent: return dummy JS content
        mockGithubFileOps.getBlobContent.mockResolvedValue('export default function() {}');

        // getFileContent: isle5 source and dest repo
        mockGithubFileOps.getFileContent.mockImplementation(
            async (owner: string, repo: string, _path: string) => {
                if (owner === 'stephen-garner-adobe' && repo === 'isle5') {
                    if (sourceComponentDef === null) return null;
                    return { content: sourceComponentDef, sha: 'source-sha' };
                }
                // Destination repo
                return { content: destComponentDef, sha: 'dest-sha' };
            },
        );

        // Git operations for atomic commit
        mockGithubFileOps.getBranchInfo.mockResolvedValue({
            treeSha: 'tree-sha',
            commitSha: 'commit-sha',
        });
        mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
        mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
        mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);
    }

    it('should use isle5 entries when they exist', async () => {
        // Given: isle5 has custom block entries with its own HTML
        const isle5Html = '<div class="circle-carousel">isle5 version</div>';
        const sourceComponentDef = createComponentDef([
            { title: 'Circle Carousel', id: 'circle-carousel', unsafeHTML: isle5Html },
        ]);

        setupSuccessfulInstall(sourceComponentDef);

        // When: installBlockCollection is called
        const result = await installBlockCollection(
            mockGithubFileOps, 'dest-owner', 'dest-repo', TEST_SOURCE, mockLogger,
        );

        // Then: Should succeed
        expect(result.success).toBe(true);

        // Verify createTree was called with component-definition.json
        const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
        const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
        const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
        expect(compDefEntry).toBeDefined();

        // The merged content should contain isle5's HTML, not the fallback
        const merged = JSON.parse(compDefEntry!.content!);
        const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
        const circleEntry = blocksGroup.components.find(
            (c: { id: string }) => c.id === 'circle-carousel',
        );
        expect(circleEntry.plugins.da.unsafeHTML).toBe(isle5Html);
    });

    it('should fall back to builder definitions when isle5 has no custom entries', async () => {
        // Given: isle5's component-definition.json has blocks but none matching CUSTOM_BLOCKS
        const sourceComponentDef = createComponentDef([
            { title: 'Columns', id: 'columns' },
        ]);

        setupSuccessfulInstall(sourceComponentDef);

        // When: installBlockCollection is called
        const result = await installBlockCollection(
            mockGithubFileOps, 'dest-owner', 'dest-repo', TEST_SOURCE, mockLogger,
        );

        // Then: Should succeed using fallback definitions
        expect(result.success).toBe(true);

        const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
        const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
        const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
        expect(compDefEntry).toBeDefined();

        // The merged content should contain all 10 builder-defined blocks
        const merged = JSON.parse(compDefEntry!.content!);
        const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
        const customIds = blocksGroup.components
            .map((c: { id: string }) => c.id)
            .filter((id: string) => CUSTOM_BLOCK_DEFINITIONS.some(d => d.id === id));
        expect(customIds).toHaveLength(10);
    });

    it('should use per-block fallback when isle5 has only some custom entries', async () => {
        // Given: isle5 has entries for blog-list and blog-tiles but NOT the other 8
        const sourceComponentDef = createComponentDef([
            { title: 'Blog List', id: 'blog-list', unsafeHTML: '<div class="blog-list">isle5</div>' },
            { title: 'Blog Tiles', id: 'blog-tiles', unsafeHTML: '<div class="blog-tiles">isle5</div>' },
            { title: 'Columns', id: 'columns' }, // non-custom, should be ignored
        ]);

        setupSuccessfulInstall(sourceComponentDef);

        const result = await installBlockCollection(
            mockGithubFileOps, 'dest-owner', 'dest-repo', TEST_SOURCE, mockLogger,
        );

        expect(result.success).toBe(true);

        const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
        const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
        const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
        expect(compDefEntry).toBeDefined();

        const merged = JSON.parse(compDefEntry!.content!);
        const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
        const mergedIds = blocksGroup.components.map((c: { id: string }) => c.id);

        // All 10 custom blocks should be present (2 from isle5 + 8 from fallback)
        for (const def of CUSTOM_BLOCK_DEFINITIONS) {
            expect(mergedIds).toContain(def.id);
        }

        // Isle5 entries should use isle5's HTML
        const blogList = blocksGroup.components.find((c: { id: string }) => c.id === 'blog-list');
        expect(blogList.plugins.da.unsafeHTML).toBe('<div class="blog-list">isle5</div>');

        // Fallback entries should use builder HTML
        const heroCta = blocksGroup.components.find((c: { id: string }) => c.id === 'hero-cta');
        expect(heroCta.plugins.da.unsafeHTML).toContain('class="hero-cta"');
    });

    it('should fall back to builder definitions when isle5 file is missing', async () => {
        // Given: isle5 has no component-definition.json at all
        setupSuccessfulInstall(null);

        // When: installBlockCollection is called
        const result = await installBlockCollection(
            mockGithubFileOps, 'dest-owner', 'dest-repo', TEST_SOURCE, mockLogger,
        );

        // Then: Should succeed using fallback definitions
        expect(result.success).toBe(true);

        const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
        const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
        const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
        expect(compDefEntry).toBeDefined();

        // Verify fallback definitions include unsafeHTML
        const merged = JSON.parse(compDefEntry!.content!);
        const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
        const heroCta = blocksGroup.components.find(
            (c: { id: string }) => c.id === 'hero-cta',
        );
        expect(heroCta).toBeDefined();
        expect(heroCta.plugins.da.unsafeHTML).toContain('class="hero-cta"');
    });

    it('should fall back when isle5 has no blocks group', async () => {
        // Given: isle5 has component-definition.json but no 'blocks' group
        const sourceComponentDef = JSON.stringify({
            groups: [{ id: 'other', title: 'Other', components: [] }],
        });

        setupSuccessfulInstall(sourceComponentDef);

        // When: installBlockCollection is called
        const result = await installBlockCollection(
            mockGithubFileOps, 'dest-owner', 'dest-repo', TEST_SOURCE, mockLogger,
        );

        // Then: Should succeed using fallback definitions
        expect(result.success).toBe(true);

        const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
        const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
        const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
        expect(compDefEntry).toBeDefined();
    });

    it('should extract sub-component entries alongside parent blocks from isle5', async () => {
        // Given: isle5 has parent blocks AND sub-components (e.g., circle-carousel-item)
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

        setupSuccessfulInstall(sourceComponentDef);

        // When: installBlockCollection is called
        const result = await installBlockCollection(
            mockGithubFileOps, 'dest-owner', 'dest-repo', TEST_SOURCE, mockLogger,
        );

        // Then: Should succeed
        expect(result.success).toBe(true);

        const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
        const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
        const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
        expect(compDefEntry).toBeDefined();

        const merged = JSON.parse(compDefEntry!.content!);
        const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
        const mergedIds = blocksGroup.components.map((c: { id: string }) => c.id);

        // Should include parent blocks
        expect(mergedIds).toContain('circle-carousel');
        expect(mergedIds).toContain('store-locator');
        expect(mergedIds).toContain('hero-cta');

        // Should include sub-components
        expect(mergedIds).toContain('circle-carousel-item');
        expect(mergedIds).toContain('circle-carousel-cell');
        expect(mergedIds).toContain('store-locator-item');
        expect(mergedIds).toContain('store-locator-cell');

        // Should NOT include non-custom blocks
        expect(mergedIds).not.toContain('columns');
    });

    it('should use provided source config for GitHub API calls', async () => {
        // Given: A custom source config (not the default isle5)
        const customSource: AddonSource = { owner: 'my-org', repo: 'my-blocks', branch: 'develop' };

        // Set up mocks with the custom source expectations
        mockGithubFileOps.listRepoFiles.mockResolvedValue(
            CUSTOM_BLOCK_DEFINITIONS.map(def => ({
                path: `blocks/${def.id}/${def.id}.js`,
                mode: '100644',
                type: 'blob' as const,
                sha: `sha-${def.id}`,
            })),
        );
        mockGithubFileOps.getBlobContent.mockResolvedValue('export default function() {}');
        mockGithubFileOps.getFileContent.mockResolvedValue(null);
        mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
        mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
        mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
        mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

        // When: installBlockCollection is called with the custom source
        await installBlockCollection(
            mockGithubFileOps, 'dest-owner', 'dest-repo', customSource, mockLogger,
        );

        // Then: listRepoFiles should be called with the custom source (not hardcoded values)
        expect(mockGithubFileOps.listRepoFiles).toHaveBeenCalledWith('my-org', 'my-blocks', 'develop');

        // getFileContent should be called with the custom source for component-definition.json
        expect(mockGithubFileOps.getFileContent).toHaveBeenCalledWith(
            'my-org', 'my-blocks', 'component-definition.json',
        );
    });

    it('should not add component-definition.json when dest has no blocks group', async () => {
        // Given: isle5 missing + destination has no 'blocks' group
        const destDef = JSON.stringify({
            groups: [{ id: 'other', title: 'Other', components: [] }],
        });

        setupSuccessfulInstall(null, destDef);

        // When: installBlockCollection is called
        const result = await installBlockCollection(
            mockGithubFileOps, 'dest-owner', 'dest-repo', TEST_SOURCE, mockLogger,
        );

        // Then: Should succeed but without component-definition.json in tree
        expect(result.success).toBe(true);

        const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
        const treeEntries = createTreeCall[2] as Array<{ path: string }>;
        const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
        expect(compDefEntry).toBeUndefined();
    });
});
