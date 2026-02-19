/**
 * Block Collection Helpers
 *
 * Copies custom EDS block directories from a source repository (isle5)
 * into the user's GitHub repository and merges their component definitions
 * into the destination's component-definition.json — all in a single
 * atomic commit using the Git Tree API.
 *
 * @module features/eds/services/blockCollectionHelpers
 */

import type { Logger } from '@/types/logger';
import type { GitHubFileOperations } from './githubFileOperations';

const SOURCE_OWNER = 'stephen-garner-adobe';
const SOURCE_REPO = 'isle5';
const SOURCE_BRANCH = 'main';

const CUSTOM_BLOCKS = [
    'circle-carousel',
    'hero-cta',
    'newsletter',
    'promotional-hero',
    'search-bar',
    'store-locator',
    'top-banner',
];

/**
 * Builder-maintained block definitions for the Commerce Block Collection.
 *
 * These provide fallback metadata (title + authoring HTML) when isle5's
 * component-definition.json doesn't contain entries for the custom blocks.
 * The `unsafeHTML` is the authoring markup that appears in the DA.live
 * library as a block preview — matching isle5's block README conventions.
 */
export const CUSTOM_BLOCK_DEFINITIONS: Array<{
    id: string;
    title: string;
    unsafeHTML: string;
}> = [
    {
        id: 'circle-carousel',
        title: 'Circle Carousel',
        unsafeHTML: '<div class="circle-carousel"><div><div>Category 1</div><div>/category-1</div></div><div><div>Category 2</div><div>/category-2</div></div><div><div>Category 3</div><div>/category-3</div></div></div>',
    },
    {
        id: 'hero-cta',
        title: 'Hero CTA',
        unsafeHTML: '<div class="hero-cta"><div><div><h1>Shop the Latest Collection</h1><p>Discover new arrivals and trending styles.</p><p><a href="/shop">Shop Now</a></p></div></div></div>',
    },
    {
        id: 'newsletter',
        title: 'Newsletter',
        unsafeHTML: '<div class="newsletter"><div><div><h2>Stay in the Loop</h2><p>Subscribe to our newsletter for exclusive offers.</p></div></div></div>',
    },
    {
        id: 'promotional-hero',
        title: 'Promotional Hero',
        unsafeHTML: '<div class="promotional-hero"><div><div><h2>Summer Sale</h2><p>Up to 50% off select items.</p><p><a href="/sale">Shop Sale</a></p></div></div></div>',
    },
    {
        id: 'search-bar',
        title: 'Search Bar',
        unsafeHTML: '<div class="search-bar"><div><div>Search our store</div></div></div>',
    },
    {
        id: 'store-locator',
        title: 'Store Locator',
        unsafeHTML: '<div class="store-locator"><div><div><h2>Find a Store</h2><p>Locate a store near you.</p></div></div></div>',
    },
    {
        id: 'top-banner',
        title: 'Top Banner',
        unsafeHTML: '<div class="top-banner"><div><div>Free shipping on orders over $50</div></div></div>',
    },
];

interface InstallBlockCollectionResult {
    success: boolean;
    blocksCount: number;
    blockIds: string[];
    error?: string;
}

/**
 * Install the Commerce Block Collection into the user's repo.
 *
 * Performs three operations in a single atomic commit:
 * 1. Copies block directories from isle5 (blocks/{id}/*)
 * 2. Merges block entries into the destination's component-definition.json
 * 3. Commits everything at once via the Git Tree API
 */
export async function installBlockCollection(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    logger: Logger,
): Promise<InstallBlockCollectionResult> {
    try {
        // 1. List all files in the source repo (isle5)
        const sourceFiles = await githubFileOps.listRepoFiles(SOURCE_OWNER, SOURCE_REPO, SOURCE_BRANCH);

        // Filter to files inside blocks/{customBlock}/ directories
        const blockFiles = sourceFiles.filter(entry => {
            const parts = entry.path.split('/');
            return parts.length >= 2 && parts[0] === 'blocks' && CUSTOM_BLOCKS.includes(parts[1]);
        });

        if (blockFiles.length === 0) {
            logger.warn('[Block Collection] No block files found in source repo');
            return { success: false, blocksCount: 0, blockIds: [], error: 'No block files found' };
        }

        logger.info(`[Block Collection] Installing ${blockFiles.length} files for ${CUSTOM_BLOCKS.length} blocks`);

        // 2. Fetch content for each block file from isle5
        const treeEntries: Array<{
            path: string;
            mode: '100644' | '100755' | '040000' | '160000' | '120000';
            type: 'blob' | 'tree' | 'commit';
            content?: string;
        }> = [];

        for (const file of blockFiles) {
            const content = await githubFileOps.getBlobContent(SOURCE_OWNER, SOURCE_REPO, file.sha);
            treeEntries.push({
                path: file.path,
                mode: '100644',
                type: 'blob',
                content,
            });
        }

        // 3. Build merged component-definition.json
        const mergedCompDef = await buildMergedComponentDefinition(githubFileOps, destOwner, destRepo);
        if (mergedCompDef) {
            treeEntries.push({
                path: 'component-definition.json',
                mode: '100644',
                type: 'blob',
                content: mergedCompDef,
            });
        }

        // 4. Create a single atomic commit with all changes
        const { treeSha, commitSha } = await githubFileOps.getBranchInfo(destOwner, destRepo, 'main');

        const newTreeSha = await githubFileOps.createTree(destOwner, destRepo, treeEntries, treeSha);
        const newCommitSha = await githubFileOps.createCommit(
            destOwner, destRepo,
            `chore: add Commerce Block Collection (${CUSTOM_BLOCKS.length} blocks)`,
            newTreeSha,
            commitSha,
        );
        await githubFileOps.updateBranchRef(destOwner, destRepo, 'main', newCommitSha);

        logger.info(`[Block Collection] Installed ${CUSTOM_BLOCKS.length} blocks in a single commit`);

        return {
            success: true,
            blocksCount: CUSTOM_BLOCKS.length,
            blockIds: CUSTOM_BLOCKS,
        };
    } catch (error) {
        return {
            success: false,
            blocksCount: 0,
            blockIds: [],
            error: (error as Error).message,
        };
    }
}

/**
 * Build a merged component-definition.json by extracting custom block entries
 * from isle5 and appending them to the destination repo's existing file.
 *
 * Returns the merged JSON string, or null if merge isn't possible.
 */
async function buildMergedComponentDefinition(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
): Promise<string | null> {
    // Try to fetch custom block entries from isle5's component-definition.json.
    // If isle5 doesn't have them (or the file/group is missing), fall back to
    // builder-maintained definitions so the library always has block metadata.
    let customEntries: Array<{
        title: string;
        id: string;
        plugins?: { da?: { unsafeHTML?: string } };
    }> = [];

    const sourceFile = await githubFileOps.getFileContent(
        SOURCE_OWNER, SOURCE_REPO, 'component-definition.json',
    );

    if (sourceFile?.content) {
        const sourceDef = JSON.parse(sourceFile.content);
        const sourceBlocksGroup = sourceDef.groups?.find(
            (g: { id: string }) => g.id === 'blocks',
        );

        if (sourceBlocksGroup?.components) {
            customEntries = sourceBlocksGroup.components.filter(
                (c: { id: string }) => CUSTOM_BLOCKS.includes(c.id),
            );
        }
    }

    // Fallback: use builder-maintained definitions when isle5 has no entries
    if (customEntries.length === 0) {
        customEntries = CUSTOM_BLOCK_DEFINITIONS.map(def => ({
            title: def.title,
            id: def.id,
            plugins: { da: { unsafeHTML: def.unsafeHTML } },
        }));
    }

    // Fetch destination component-definition.json
    const destFile = await githubFileOps.getFileContent(
        destOwner, destRepo, 'component-definition.json',
    );
    if (!destFile?.content) {
        return null;
    }

    const destDef = JSON.parse(destFile.content);
    const destBlocksGroup = destDef.groups?.find(
        (g: { id: string }) => g.id === 'blocks',
    );
    if (!destBlocksGroup) {
        return null;
    }

    // Deduplicate: skip entries already in destination
    const existingIds = new Set(
        destBlocksGroup.components?.map((c: { id: string }) => c.id) ?? [],
    );
    const newEntries = customEntries.filter(
        (c: { id: string }) => !existingIds.has(c.id),
    );

    if (newEntries.length === 0) {
        return null;
    }

    destBlocksGroup.components = [...(destBlocksGroup.components || []), ...newEntries];
    return JSON.stringify(destDef, null, 2);
}
