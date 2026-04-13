/**
 * Block Collection Helpers - Multi-Library Tests: Merging & Template Preservation
 *
 * Tests for installBlockCollections (plural) covering:
 * - Multi-source component-definition.json merge
 * - Template block preservation (regression tests)
 * - Component-filters merge across multiple libraries
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

    describe('unsafeHTML enrichment for deduplicated blocks', () => {
        it('should add unsafeHTML from source to destination entries that lack it', async () => {
            // cards and hero exist in destination (deduplicated) — source has unsafeHTML for them
            mockGithubFileOps.listRepoFiles.mockImplementation(
                async (owner: string, _repo: string) => {
                    if (owner === 'dest-owner') return createBlockFileEntries(['cards', 'hero']);
                    if (owner === SOURCE_A.owner) return createBlockFileEntries(['cards', 'hero', 'newsletter']);
                    return [];
                },
            );

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');

            const sourceCompDef = createComponentDef([
                { title: 'Cards', id: 'cards', unsafeHTML: '<div class="cards"><div><div>Content</div></div></div>' },
                { title: 'Hero', id: 'hero', unsafeHTML: '<div class="hero"><div><div>Heading</div></div></div>' },
                { title: 'Newsletter', id: 'newsletter', unsafeHTML: '<div class="newsletter"><div><div>Email</div></div></div>' },
            ]);
            const destCompDef = createDestComponentDef([
                { title: 'Cards', id: 'cards' },
                { title: 'Hero', id: 'hero' },
            ]);

            mockGithubFileOps.getFileContent.mockImplementation(
                async (owner: string, repo: string, path: string) => {
                    if (path === 'component-filters.json' || path === 'component-models.json') return null;
                    if (owner === SOURCE_A.owner) return { content: sourceCompDef, sha: 'source-sha' };
                    return { content: destCompDef, sha: 'dest-sha' };
                },
            );

            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: SOURCE_A, name: 'Isle5' }],
                mockLogger,
            );

            const treeEntries = mockGithubFileOps.createTree.mock.calls[0][2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeDefined();

            const merged = JSON.parse(compDefEntry!.content!);
            const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
            const cardsEntry = blocksGroup.components.find((c: { id: string }) => c.id === 'cards');
            const heroEntry = blocksGroup.components.find((c: { id: string }) => c.id === 'hero');

            expect(cardsEntry.plugins.da.unsafeHTML).toBe('<div class="cards"><div><div>Content</div></div></div>');
            expect(heroEntry.plugins.da.unsafeHTML).toBe('<div class="hero"><div><div>Heading</div></div></div>');
        });

        it('should not overwrite unsafeHTML already present in the destination', async () => {
            mockGithubFileOps.listRepoFiles.mockImplementation(
                async (owner: string, _repo: string) => {
                    if (owner === 'dest-owner') return createBlockFileEntries(['cards', 'hero']);
                    if (owner === SOURCE_A.owner) return createBlockFileEntries(['cards', 'hero', 'newsletter']);
                    return [];
                },
            );

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');

            const sourceCompDef = createComponentDef([
                { title: 'Cards', id: 'cards', unsafeHTML: '<div class="cards">FROM SOURCE</div>' },
                { title: 'Newsletter', id: 'newsletter' },
            ]);
            // Destination already has unsafeHTML for cards
            const destCompDef = JSON.stringify({
                groups: [{
                    id: 'blocks',
                    title: 'Blocks',
                    components: [
                        { title: 'Cards', id: 'cards', plugins: { da: { unsafeHTML: '<div class="cards">ORIGINAL</div>' } } },
                        { title: 'Hero', id: 'hero' },
                    ],
                }],
            });

            mockGithubFileOps.getFileContent.mockImplementation(
                async (owner: string, repo: string, path: string) => {
                    if (path === 'component-filters.json' || path === 'component-models.json') return null;
                    if (owner === SOURCE_A.owner) return { content: sourceCompDef, sha: 'source-sha' };
                    return { content: destCompDef, sha: 'dest-sha' };
                },
            );

            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: SOURCE_A, name: 'Isle5' }],
                mockLogger,
            );

            const treeEntries = mockGithubFileOps.createTree.mock.calls[0][2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeDefined();

            const merged = JSON.parse(compDefEntry!.content!);
            const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
            const cardsEntry = blocksGroup.components.find((c: { id: string }) => c.id === 'cards');

            // Original value must be preserved
            expect(cardsEntry.plugins.da.unsafeHTML).toBe('<div class="cards">ORIGINAL</div>');
        });

        it('should enrich deduplicated blocks while still adding new block entries', async () => {
            // cards is deduplicated (in dest already), newsletter is new
            mockGithubFileOps.listRepoFiles.mockImplementation(
                async (owner: string, _repo: string) => {
                    if (owner === 'dest-owner') return createBlockFileEntries(['cards']);
                    if (owner === SOURCE_A.owner) return createBlockFileEntries(['cards', 'newsletter']);
                    return [];
                },
            );

            mockGithubFileOps.getBlobContent.mockResolvedValue('content');

            const sourceCompDef = createComponentDef([
                { title: 'Cards', id: 'cards', unsafeHTML: '<div class="cards"><div><div>Content</div></div></div>' },
                { title: 'Newsletter', id: 'newsletter', unsafeHTML: '<div class="newsletter"><div><div>Email</div></div></div>' },
            ]);
            const destCompDef = createDestComponentDef([{ title: 'Cards', id: 'cards' }]);

            mockGithubFileOps.getFileContent.mockImplementation(
                async (owner: string, repo: string, path: string) => {
                    if (path === 'component-filters.json' || path === 'component-models.json') return null;
                    if (owner === SOURCE_A.owner) return { content: sourceCompDef, sha: 'source-sha' };
                    return { content: destCompDef, sha: 'dest-sha' };
                },
            );

            mockGithubFileOps.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'commit-sha' });
            mockGithubFileOps.createTree.mockResolvedValue('new-tree-sha');
            mockGithubFileOps.createCommit.mockResolvedValue('new-commit-sha');
            mockGithubFileOps.updateBranchRef.mockResolvedValue(undefined);

            await installBlockCollections(
                mockGithubFileOps, 'dest-owner', 'dest-repo',
                [{ source: SOURCE_A, name: 'Isle5' }],
                mockLogger,
            );

            const treeEntries = mockGithubFileOps.createTree.mock.calls[0][2] as Array<{ path: string; content?: string }>;
            const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
            expect(compDefEntry).toBeDefined();

            const merged = JSON.parse(compDefEntry!.content!);
            const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
            const ids = blocksGroup.components.map((c: { id: string }) => c.id);

            // newsletter was newly added
            expect(ids).toContain('newsletter');
            // cards was enriched with unsafeHTML
            const cardsEntry = blocksGroup.components.find((c: { id: string }) => c.id === 'cards');
            expect(cardsEntry.plugins.da.unsafeHTML).toBe('<div class="cards"><div><div>Content</div></div></div>');
            // newsletter also has unsafeHTML from its new entry
            const newsletterEntry = blocksGroup.components.find((c: { id: string }) => c.id === 'newsletter');
            expect(newsletterEntry.plugins.da.unsafeHTML).toBe('<div class="newsletter"><div><div>Email</div></div></div>');
        });
    });

    describe('component-filters merge (multi-library)', () => {
        it('should merge filters from multiple libraries', async () => {
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
                        return null;
                    }
                    if (owner === SOURCE_B.owner && repo === SOURCE_B.repo) {
                        if (path === 'component-filters.json') {
                            return { content: sourceBFilters, sha: 'sha-cf-b' };
                        }
                        return null;
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

            expect(sectionFilter.components).toContain('hero-v2');
            expect(sectionFilter.components).toContain('tabs');
            expect(sectionFilter.components).toContain('blog-tiles');
            expect(sectionFilter.components).toContain('circle-carousel');

            const tabsFilter = merged.find((f: { id: string }) => f.id === 'tabs');
            expect(tabsFilter).toBeDefined();
            expect(tabsFilter.components).toContain('tabs-item');

            const carouselFilter = merged.find((f: { id: string }) => f.id === 'circle-carousel');
            expect(carouselFilter).toBeDefined();
            expect(carouselFilter.components).toContain('circle-carousel-item');
        });

        it('should not duplicate filter entries across libraries', async () => {
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

            const heroCount = sectionFilter.components.filter((c: string) => c === 'hero').length;
            expect(heroCount).toBe(1);

            expect(sectionFilter.components).toContain('newsletter');
            expect(sectionFilter.components).toContain('product-grid');
        });
    });
});
