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

describe('CUSTOM_BLOCK_DEFINITIONS', () => {
    const EXPECTED_BLOCK_IDS = [
        'circle-carousel',
        'hero-cta',
        'newsletter',
        'promotional-hero',
        'search-bar',
        'store-locator',
        'top-banner',
    ];

    it('should contain all 7 custom block IDs', () => {
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
            mockGithubFileOps, 'dest-owner', 'dest-repo', mockLogger,
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
            mockGithubFileOps, 'dest-owner', 'dest-repo', mockLogger,
        );

        // Then: Should succeed using fallback definitions
        expect(result.success).toBe(true);

        const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
        const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
        const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
        expect(compDefEntry).toBeDefined();

        // The merged content should contain all 7 builder-defined blocks
        const merged = JSON.parse(compDefEntry!.content!);
        const blocksGroup = merged.groups.find((g: { id: string }) => g.id === 'blocks');
        const customIds = blocksGroup.components
            .map((c: { id: string }) => c.id)
            .filter((id: string) => CUSTOM_BLOCK_DEFINITIONS.some(d => d.id === id));
        expect(customIds).toHaveLength(7);
    });

    it('should fall back to builder definitions when isle5 file is missing', async () => {
        // Given: isle5 has no component-definition.json at all
        setupSuccessfulInstall(null);

        // When: installBlockCollection is called
        const result = await installBlockCollection(
            mockGithubFileOps, 'dest-owner', 'dest-repo', mockLogger,
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
            mockGithubFileOps, 'dest-owner', 'dest-repo', mockLogger,
        );

        // Then: Should succeed using fallback definitions
        expect(result.success).toBe(true);

        const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
        const treeEntries = createTreeCall[2] as Array<{ path: string; content?: string }>;
        const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
        expect(compDefEntry).toBeDefined();
    });

    it('should not add component-definition.json when dest has no blocks group', async () => {
        // Given: isle5 missing + destination has no 'blocks' group
        const destDef = JSON.stringify({
            groups: [{ id: 'other', title: 'Other', components: [] }],
        });

        setupSuccessfulInstall(null, destDef);

        // When: installBlockCollection is called
        const result = await installBlockCollection(
            mockGithubFileOps, 'dest-owner', 'dest-repo', mockLogger,
        );

        // Then: Should succeed but without component-definition.json in tree
        expect(result.success).toBe(true);

        const createTreeCall = mockGithubFileOps.createTree.mock.calls[0];
        const treeEntries = createTreeCall[2] as Array<{ path: string }>;
        const compDefEntry = treeEntries.find(e => e.path === 'component-definition.json');
        expect(compDefEntry).toBeUndefined();
    });
});
