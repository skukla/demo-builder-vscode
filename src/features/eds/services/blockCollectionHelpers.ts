/**
 * Block Collection Helpers
 *
 * Copies custom EDS block directories from a configurable source repository
 * into the user's GitHub repository and merges their component definitions
 * into the destination's component-definition.json — all in a single
 * atomic commit using the Git Tree API.
 *
 * The source repository is configured per-package in demo-packages.json
 * via the addon source field (e.g., commerce-block-collection.source).
 *
 * @module features/eds/services/blockCollectionHelpers
 */

import type { GitHubFileOperations } from './githubFileOperations';
import type { AddonSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

const CUSTOM_BLOCKS = [
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

/**
 * Builder-maintained block definitions for the Commerce Block Collection.
 *
 * These provide fallback metadata (title + authoring HTML) when the source
 * repo's component-definition.json doesn't contain entries for the custom blocks.
 * The `unsafeHTML` is the authoring markup that appears in the DA.live
 * library as a block preview — matching the source repo's block README conventions.
 */
export const CUSTOM_BLOCK_DEFINITIONS: Array<{
    id: string;
    title: string;
    unsafeHTML: string;
}> = [
    {
        id: 'blog-list',
        title: 'Blog List',
        unsafeHTML: '<div class="blog-list"><div><div>Blog posts loaded from /blog directory</div></div></div>',
    },
    {
        id: 'blog-post',
        title: 'Blog Post',
        unsafeHTML: '<div class="blog-post"><div><div>Article content rendered from page metadata</div></div></div>',
    },
    {
        id: 'blog-tiles',
        title: 'Blog Tiles',
        unsafeHTML: '<div class="blog-tiles"><div><div>Blog tile grid loaded from /blog directory</div></div></div>',
    },
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
 * 1. Copies block directories from the source repo (blocks/{id}/*)
 * 2. Merges block entries into the destination's component-definition.json
 * 3. Commits everything at once via the Git Tree API
 *
 * @param source - The addon source config (owner, repo, branch) from demo-packages.json
 */
export async function installBlockCollection(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    source: AddonSource,
    logger: Logger,
): Promise<InstallBlockCollectionResult> {
    try {
        // 1. List all files in the source repo
        const sourceFiles = await githubFileOps.listRepoFiles(source.owner, source.repo, source.branch);

        // Filter to files inside blocks/{customBlock}/ directories
        const blockFiles = sourceFiles.filter(entry => {
            const parts = entry.path.split('/');
            return parts.length >= 2 && parts[0] === 'blocks' && CUSTOM_BLOCKS.includes(parts[1]);
        });

        if (blockFiles.length === 0) {
            logger.warn('[Block Collection] No block files found in source repo');
            return { success: false, blocksCount: 0, blockIds: [], error: 'No block files found' };
        }

        logger.info(`[Block Collection] Installing ${blockFiles.length} files for ${CUSTOM_BLOCKS.length} blocks from ${source.owner}/${source.repo}`);

        // 2. Fetch content for each block file from source
        const treeEntries: Array<{
            path: string;
            mode: '100644' | '100755' | '040000' | '160000' | '120000';
            type: 'blob' | 'tree' | 'commit';
            content?: string;
        }> = [];

        for (const file of blockFiles) {
            const content = await githubFileOps.getBlobContent(source.owner, source.repo, file.sha);
            treeEntries.push({
                path: file.path,
                mode: '100644',
                type: 'blob',
                content,
            });
        }

        // 3. Build merged component-definition.json
        const mergedCompDef = await buildMergedComponentDefinition(githubFileOps, destOwner, destRepo, source);
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
 * from the source repo and appending them to the destination repo's existing file.
 *
 * Returns the merged JSON string, or null if merge isn't possible.
 */
async function buildMergedComponentDefinition(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    source: AddonSource,
): Promise<string | null> {
    // Try to fetch custom block entries from the source's component-definition.json.
    // If the source doesn't have them (or the file/group is missing), fall back to
    // builder-maintained definitions so the library always has block metadata.
    let customEntries: Array<{
        title: string;
        id: string;
        plugins?: { da?: { unsafeHTML?: string } };
    }> = [];

    const sourceFile = await githubFileOps.getFileContent(
        source.owner, source.repo, 'component-definition.json',
    );

    if (sourceFile?.content) {
        const sourceDef = JSON.parse(sourceFile.content);
        const sourceBlocksGroup = sourceDef.groups?.find(
            (g: { id: string }) => g.id === 'blocks',
        );

        if (sourceBlocksGroup?.components) {
            customEntries = sourceBlocksGroup.components.filter(
                (c: { id: string }) => CUSTOM_BLOCKS.some(
                    block => c.id === block || c.id.startsWith(`${block}-`),
                ),
            );
        }
    }

    // Per-block fallback: for each custom block, use the source entry if it
    // exists, otherwise use the builder-maintained definition. This ensures
    // all custom blocks get metadata even when the source has only partial entries.
    const sourceEntryMap = new Map(customEntries.map(e => [e.id, e]));
    customEntries = [];
    for (const def of CUSTOM_BLOCK_DEFINITIONS) {
        customEntries.push(sourceEntryMap.get(def.id) ?? {
            title: def.title,
            id: def.id,
            plugins: { da: { unsafeHTML: def.unsafeHTML } },
        });
        // Include sub-component entries from source (e.g., circle-carousel-item)
        for (const [id, entry] of sourceEntryMap) {
            if (id.startsWith(`${def.id}-`) && !customEntries.some(e => e.id === id)) {
                customEntries.push(entry);
            }
        }
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
