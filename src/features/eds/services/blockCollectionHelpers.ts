/**
 * Block Collection Helpers
 *
 * Copies custom EDS block directories from a configurable source repository
 * into the user's GitHub repository and merges their component definitions
 * into the destination's component-definition.json — all in a single
 * atomic commit using the Git Tree API.
 *
 * The source repository is configured in block-libraries.json
 * (e.g., libraries[].source with owner/repo/branch).
 *
 * Block discovery is fully dynamic: the extension scans the source repo's
 * blocks/ directory and installs whatever it finds. Authoring metadata
 * (title, preview HTML) comes from the source repo's component-definition.json.
 * Blocks without metadata entries still get their files installed — they just
 * won't appear in the DA.live authoring library until the source repo adds them.
 *
 * @module features/eds/services/blockCollectionHelpers
 */

import type { GitHubFileOperations } from './githubFileOperations';
import type { AddonSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

export interface InstallBlockCollectionResult {
    success: boolean;
    blocksCount: number;
    blockIds: string[];
    error?: string;
}

/** Entry for a block library source (used by installBlockCollections) */
export interface BlockLibraryEntry {
    source: AddonSource;
    name: string;
}

/**
 * Install a block collection into the user's repo.
 *
 * Performs three operations in a single atomic commit:
 * 1. Copies block directories from the source repo (blocks/{id}/*)
 * 2. Merges block entries into the destination's component-definition.json
 * 3. Commits everything at once via the Git Tree API
 *
 * @deprecated Use {@link installBlockCollections} (plural) for multi-library dedup.
 * Retained for single-library edge cases and test coverage of core mechanics.
 *
 * @param source - The source config (owner, repo, branch) from block-libraries.json or stacks.json
 * @param libraryName - Optional display name for the library (used in commit message)
 */
export async function installBlockCollection(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    source: AddonSource,
    logger: Logger,
    libraryName?: string,
): Promise<InstallBlockCollectionResult> {
    try {
        // 1. List all files in the source repo
        const sourceFiles = await githubFileOps.listRepoFiles(source.owner, source.repo, source.branch);

        // Discover blocks by extracting unique directory names under blocks/
        const discoveredBlocks = new Set<string>();
        for (const entry of sourceFiles) {
            const parts = entry.path.split('/');
            if (parts.length >= 3 && parts[0] === 'blocks') {
                discoveredBlocks.add(parts[1]);
            }
        }
        const blockIds = [...discoveredBlocks].sort();

        // Filter to files inside blocks/{discoveredBlock}/ directories
        const blockFiles = sourceFiles.filter(entry => {
            const parts = entry.path.split('/');
            return parts.length >= 3 && parts[0] === 'blocks' && discoveredBlocks.has(parts[1]);
        });

        if (blockFiles.length === 0) {
            logger.warn('[Block Collection] No block files found in source repo');
            return { success: false, blocksCount: 0, blockIds: [], error: 'No block files found' };
        }

        logger.info(`[Block Collection] Installing ${blockFiles.length} files for ${blockIds.length} blocks from ${source.owner}/${source.repo}`);

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
        const mergedCompDef = await buildMergedComponentDefinition(githubFileOps, destOwner, destRepo, source, blockIds);
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
        const commitLabel = libraryName || 'block collection';
        const newCommitSha = await githubFileOps.createCommit(
            destOwner, destRepo,
            `chore: add ${commitLabel} (${blockIds.length} blocks)`,
            newTreeSha,
            commitSha,
        );
        await githubFileOps.updateBranchRef(destOwner, destRepo, 'main', newCommitSha);

        logger.info(`[Block Collection] Installed ${blockIds.length} blocks in a single commit`);

        return {
            success: true,
            blocksCount: blockIds.length,
            blockIds,
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
 * Install blocks from multiple libraries into the user's repo in a single atomic commit.
 *
 * Deduplicates blocks across all libraries (first source wins for overlapping block IDs),
 * merges component-definition.json entries from all sources, and creates one commit.
 *
 * @param libraries - Array of library entries (source + name), processed in order
 */
export async function installBlockCollections(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    libraries: BlockLibraryEntry[],
    logger: Logger,
): Promise<InstallBlockCollectionResult> {
    if (libraries.length === 0) {
        return { success: true, blocksCount: 0, blockIds: [] };
    }

    try {
        const seenBlocks = new Set<string>();
        const allBlockIds: string[] = [];

        // Per-library: track which blocks are unique to this library and their files
        const libraryBlockFiles: Array<{
            source: AddonSource;
            blockIds: string[];
            files: Array<{ path: string; sha: string }>;
        }> = [];

        // 1. Discover blocks from each library, dedup across libraries
        for (const lib of libraries) {
            const sourceFiles = await githubFileOps.listRepoFiles(
                lib.source.owner, lib.source.repo, lib.source.branch,
            );

            // Discover block IDs under blocks/
            const discoveredBlocks = new Set<string>();
            for (const entry of sourceFiles) {
                const parts = entry.path.split('/');
                if (parts.length >= 3 && parts[0] === 'blocks') {
                    discoveredBlocks.add(parts[1]);
                }
            }

            // Determine which blocks are new (not seen in a prior library)
            const uniqueBlockIds: string[] = [];
            for (const blockId of [...discoveredBlocks].sort()) {
                if (!seenBlocks.has(blockId)) {
                    seenBlocks.add(blockId);
                    uniqueBlockIds.push(blockId);
                    allBlockIds.push(blockId);
                }
            }

            // Collect files only for unique blocks
            const uniqueBlockIdSet = new Set(uniqueBlockIds);
            const blockFiles = sourceFiles.filter(entry => {
                const parts = entry.path.split('/');
                return parts.length >= 3 && parts[0] === 'blocks' && uniqueBlockIdSet.has(parts[1]);
            });

            if (uniqueBlockIds.length > 0) {
                libraryBlockFiles.push({
                    source: lib.source,
                    blockIds: uniqueBlockIds,
                    files: blockFiles.map(f => ({ path: f.path, sha: f.sha })),
                });
            }

            const skippedCount = discoveredBlocks.size - uniqueBlockIds.length;
            if (skippedCount > 0) {
                logger.info(`[Block Collection] ${lib.name}: skipped ${skippedCount} duplicate blocks`);
            }
        }

        const sortedBlockIds = allBlockIds.sort();

        if (sortedBlockIds.length === 0) {
            logger.warn('[Block Collection] No block files found across any library');
            return { success: false, blocksCount: 0, blockIds: [], error: 'No block files found' };
        }

        // 2. Fetch file content for all unique block files
        const treeEntries: Array<{
            path: string;
            mode: '100644' | '100755' | '040000' | '160000' | '120000';
            type: 'blob' | 'tree' | 'commit';
            content?: string;
        }> = [];

        for (const libData of libraryBlockFiles) {
            for (const file of libData.files) {
                const content = await githubFileOps.getBlobContent(
                    libData.source.owner, libData.source.repo, file.sha,
                );
                treeEntries.push({
                    path: file.path,
                    mode: '100644',
                    type: 'blob',
                    content,
                });
            }
        }

        // 3. Build merged component-definition.json from all sources
        const mergedCompDef = await buildMergedComponentDefinitionMultiSource(
            githubFileOps, destOwner, destRepo, libraryBlockFiles,
        );
        if (mergedCompDef) {
            treeEntries.push({
                path: 'component-definition.json',
                mode: '100644',
                type: 'blob',
                content: mergedCompDef,
            });
        }

        // 4. Create a single atomic commit
        const { treeSha, commitSha } = await githubFileOps.getBranchInfo(destOwner, destRepo, 'main');
        const newTreeSha = await githubFileOps.createTree(destOwner, destRepo, treeEntries, treeSha);

        const commitMsg = `chore: add blocks from ${libraries.length} libraries (${sortedBlockIds.length} blocks)`;
        const newCommitSha = await githubFileOps.createCommit(
            destOwner, destRepo, commitMsg, newTreeSha, commitSha,
        );
        await githubFileOps.updateBranchRef(destOwner, destRepo, 'main', newCommitSha);

        logger.info(`[Block Collection] Installed ${sortedBlockIds.length} unique blocks from ${libraries.length} libraries in a single commit`);

        return {
            success: true,
            blocksCount: sortedBlockIds.length,
            blockIds: sortedBlockIds,
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
 * Build a merged component-definition.json from multiple source repositories.
 *
 * For each source, extracts entries matching the blocks assigned to that source
 * (after cross-library dedup). Combines all entries and appends to destination.
 */
async function buildMergedComponentDefinitionMultiSource(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    libraryBlockFiles: Array<{
        source: AddonSource;
        blockIds: string[];
        files: Array<{ path: string; sha: string }>;
    }>,
): Promise<string | null> {
    // Collect component entries from each source's comp-def
    const allNewEntries: Array<{ title: string; id: string; [key: string]: unknown }> = [];
    const collectedIds = new Set<string>();

    for (const libData of libraryBlockFiles) {
        const sourceFile = await githubFileOps.getFileContent(
            libData.source.owner, libData.source.repo, 'component-definition.json',
        );
        if (!sourceFile?.content) continue;

        const sourceDef = JSON.parse(sourceFile.content);
        const sourceBlocksGroup = sourceDef.groups?.find(
            (g: { id: string }) => g.id === 'blocks',
        );
        if (!sourceBlocksGroup?.components) continue;

        // Extract entries matching this library's unique blocks (including sub-components)
        const matchingEntries = sourceBlocksGroup.components.filter(
            (c: { id: string }) => libData.blockIds.some(
                block => c.id === block || c.id.startsWith(`${block}-`),
            ),
        );

        for (const entry of matchingEntries) {
            if (!collectedIds.has(entry.id)) {
                collectedIds.add(entry.id);
                allNewEntries.push(entry);
            }
        }
    }

    if (allNewEntries.length === 0) return null;

    // Fetch destination comp-def and append new entries
    const destFile = await githubFileOps.getFileContent(
        destOwner, destRepo, 'component-definition.json',
    );
    if (!destFile?.content) return null;

    const destDef = JSON.parse(destFile.content);
    const destBlocksGroup = destDef.groups?.find(
        (g: { id: string }) => g.id === 'blocks',
    );
    if (!destBlocksGroup) return null;

    // Skip entries already in destination
    const existingIds = new Set(
        destBlocksGroup.components?.map((c: { id: string }) => c.id) ?? [],
    );
    const newEntries = allNewEntries.filter(c => !existingIds.has(c.id));

    if (newEntries.length === 0) return null;

    destBlocksGroup.components = [...(destBlocksGroup.components || []), ...newEntries];
    return JSON.stringify(destDef, null, 2);
}

/**
 * Build a merged component-definition.json by extracting block entries
 * from the source repo's component-definition.json and appending them
 * to the destination repo's existing file.
 *
 * Only entries present in the source repo are included. Blocks without
 * metadata in the source get their files installed but no authoring entry.
 *
 * Returns the merged JSON string, or null if merge isn't possible.
 */
async function buildMergedComponentDefinition(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    source: AddonSource,
    blockIds: string[],
): Promise<string | null> {
    // Fetch block entries from the source repo's component-definition.json
    const sourceFile = await githubFileOps.getFileContent(
        source.owner, source.repo, 'component-definition.json',
    );

    if (!sourceFile?.content) {
        return null;
    }

    const sourceDef = JSON.parse(sourceFile.content);
    const sourceBlocksGroup = sourceDef.groups?.find(
        (g: { id: string }) => g.id === 'blocks',
    );

    if (!sourceBlocksGroup?.components) {
        return null;
    }

    // Extract entries matching discovered blocks (including sub-components like circle-carousel-item)
    const customEntries = sourceBlocksGroup.components.filter(
        (c: { id: string }) => blockIds.some(
            block => c.id === block || c.id.startsWith(`${block}-`),
        ),
    );

    if (customEntries.length === 0) {
        return null;
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
