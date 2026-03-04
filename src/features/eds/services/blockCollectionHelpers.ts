/**
 * Block Collection Helpers
 *
 * Copies custom EDS block directories from a configurable source repository
 * into the user's GitHub repository and merges their component definitions
 * (component-definition.json), authoring filters (component-filters.json),
 * and field models (component-models.json) into the destination — all in a
 * single atomic commit using the Git Tree API.
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
import type { GitHubTreeInput } from './types';
import type { LibraryVersionInfo } from '@/types/blockLibraries';
import type { AddonSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

export interface InstallBlockCollectionResult {
    success: boolean;
    blocksCount: number;
    blockIds: string[];
    error?: string;
    /** Per-library tracking data (source commit SHA + block IDs) for version tracking */
    libraryVersions?: LibraryVersionInfo[];
}

/** Entry for a block library source (used by installBlockCollections) */
export interface BlockLibraryEntry {
    source: AddonSource;
    name: string;
}

/** Per-library block discovery result used by merge helpers */
interface LibraryBlockData {
    source: AddonSource;
    blockIds: string[];
    files: Array<{ path: string; sha: string }>;
}

/**
 * Install blocks from multiple libraries into the user's repo in a single atomic commit.
 *
 * Deduplicates blocks across all libraries (first source wins for overlapping block IDs),
 * merges component-definition.json, component-filters.json, and component-models.json
 * entries from all sources, and creates one commit.
 *
 * @param libraries - Array of library entries (source + name), processed in order
 * @param additionalTreeEntries - Extra tree entries to include in the same atomic commit
 *   (e.g. inspector tagging files). Keeps the repo history clean by combining
 *   related setup files into a single commit.
 */
export async function installBlockCollections(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    libraries: BlockLibraryEntry[],
    logger: Logger,
    additionalTreeEntries?: GitHubTreeInput[],
): Promise<InstallBlockCollectionResult> {
    if (libraries.length === 0) {
        return { success: true, blocksCount: 0, blockIds: [], libraryVersions: [] };
    }

    try {
        const seenBlocks = new Set<string>();
        const allBlockIds: string[] = [];

        // Discover blocks already in the destination repo (from template reset)
        // so library installation only ADDS new blocks, never overwrites template blocks
        const destFiles = await githubFileOps.listRepoFiles(destOwner, destRepo, 'main');
        for (const entry of destFiles) {
            const parts = entry.path.split('/');
            if (parts.length >= 3 && parts[0] === 'blocks') {
                seenBlocks.add(parts[1]);
            }
        }
        if (seenBlocks.size > 0) {
            logger.info(`[Block Collection] Destination repo has ${seenBlocks.size} existing blocks — these will be preserved`);
        }

        // Per-library: track which blocks are unique to this library and their files
        const libraryBlockFiles: LibraryBlockData[] = [];

        // Per-library: track source commit SHA for version tracking
        const libraryVersions: LibraryVersionInfo[] = [];

        // 1. Discover blocks from each library, dedup across libraries
        for (const lib of libraries) {
            const sourceFiles = await githubFileOps.listRepoFiles(
                lib.source.owner, lib.source.repo, lib.source.branch,
            );

            // Capture source repo commit SHA for version tracking
            const { commitSha: sourceCommitSha } = await githubFileOps.getBranchInfo(
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

                // Track version info for this library
                libraryVersions.push({
                    source: lib.source,
                    name: lib.name,
                    commitSha: sourceCommitSha,
                    blockIds: uniqueBlockIds,
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
        const treeEntries: GitHubTreeInput[] = [];

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

        // 3b. Build merged component-filters.json from all sources
        const mergedFilters = await buildMergedComponentFiltersMultiSource(
            githubFileOps, destOwner, destRepo, libraryBlockFiles,
        );
        if (mergedFilters) {
            treeEntries.push({
                path: 'component-filters.json',
                mode: '100644',
                type: 'blob',
                content: mergedFilters,
            });
        }

        // 3c. Build merged component-models.json from all sources
        const mergedModels = await buildMergedComponentModelsMultiSource(
            githubFileOps, destOwner, destRepo, libraryBlockFiles,
        );
        if (mergedModels) {
            treeEntries.push({
                path: 'component-models.json',
                mode: '100644',
                type: 'blob',
                content: mergedModels,
            });
        }

        // 4. Append any additional tree entries (e.g. inspector tagging files)
        if (additionalTreeEntries && additionalTreeEntries.length > 0) {
            treeEntries.push(...additionalTreeEntries);
        }

        // 5. Create a single atomic commit
        const { treeSha, commitSha } = await githubFileOps.getBranchInfo(destOwner, destRepo, 'main');
        const newTreeSha = await githubFileOps.createTree(destOwner, destRepo, treeEntries, treeSha);

        const commitMsg = libraries.length === 1
            ? `chore: add ${libraries[0].name} (${sortedBlockIds.length} blocks)`
            : `chore: add blocks from ${libraries.length} libraries (${sortedBlockIds.length} blocks)`;
        const newCommitSha = await githubFileOps.createCommit(
            destOwner, destRepo, commitMsg, newTreeSha, commitSha,
        );
        await githubFileOps.updateBranchRef(destOwner, destRepo, 'main', newCommitSha);

        logger.info(`[Block Collection] Installed ${sortedBlockIds.length} blocks from ${libraries.length} ${libraries.length === 1 ? 'library' : 'libraries'}`);

        return {
            success: true,
            blocksCount: sortedBlockIds.length,
            blockIds: sortedBlockIds,
            libraryVersions,
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
 * For each source, extracts entries from ALL groups matching the blocks assigned
 * to that source (after cross-library dedup). Appends to the matching destination
 * group, creating new groups as needed.
 */
async function buildMergedComponentDefinitionMultiSource(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    libraryBlockFiles: LibraryBlockData[],
): Promise<string | null> {
    // Collect entries tagged by group from all source repos
    const entriesByGroup = new Map<string, {
        title: string;
        entries: Array<{ id: string; [key: string]: unknown }>;
    }>();
    const collectedIds = new Set<string>();

    for (const libData of libraryBlockFiles) {
        const sourceFile = await githubFileOps.getFileContent(
            libData.source.owner, libData.source.repo, 'component-definition.json',
        );
        if (!sourceFile?.content) continue;

        const sourceDef = JSON.parse(sourceFile.content);
        if (!sourceDef.groups) continue;

        for (const group of sourceDef.groups) {
            if (!group.components) continue;
            for (const entry of group.components) {
                if (collectedIds.has(entry.id)) continue;
                const matches = libData.blockIds.some(
                    (block: string) => entry.id === block || entry.id.startsWith(`${block}-`),
                );
                if (!matches) continue;

                collectedIds.add(entry.id);
                if (!entriesByGroup.has(group.id)) {
                    entriesByGroup.set(group.id, { title: group.title, entries: [] });
                }
                entriesByGroup.get(group.id)!.entries.push(entry);
            }
        }
    }

    if (entriesByGroup.size === 0) return null;

    // Merge into destination
    const destFile = await githubFileOps.getFileContent(
        destOwner, destRepo, 'component-definition.json',
    );
    if (!destFile?.content) return null;

    const destDef = JSON.parse(destFile.content);
    if (!destDef.groups) return null;

    let addedCount = 0;
    for (const [groupId, groupData] of entriesByGroup) {
        let destGroup = destDef.groups.find((g: { id: string }) => g.id === groupId);
        if (!destGroup) {
            destGroup = { id: groupId, title: groupData.title, components: [] };
            destDef.groups.push(destGroup);
        }
        const existingIds = new Set(
            destGroup.components?.map((c: { id: string }) => c.id) ?? [],
        );
        const newEntries = groupData.entries.filter((c: { id: string }) => !existingIds.has(c.id));
        if (newEntries.length > 0) {
            destGroup.components = [...(destGroup.components || []), ...newEntries];
            addedCount += newEntries.length;
        }
    }

    return addedCount > 0 ? JSON.stringify(destDef, null, 2) : null;
}

/**
 * Build a merged component-filters.json from multiple source repositories.
 *
 * For each source, extracts filter entries (section allowlist + sub-component
 * filters) matching the blocks assigned to that source. Combines all entries
 * and appends to the destination's component-filters.json.
 */
async function buildMergedComponentFiltersMultiSource(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    libraryBlockFiles: LibraryBlockData[],
): Promise<string | null> {
    const newSectionIds: string[] = [];
    const newSubFilters: Array<{ id: string; components: string[] }> = [];
    const collectedSectionIds = new Set<string>();
    const collectedSubFilterIds = new Set<string>();

    for (const libData of libraryBlockFiles) {
        const sourceFile = await githubFileOps.getFileContent(
            libData.source.owner, libData.source.repo, 'component-filters.json',
        );
        if (!sourceFile?.content) continue;

        const sourceFilters: Array<{ id: string; components: string[] }> =
            JSON.parse(sourceFile.content);
        const blockIdSet = new Set(libData.blockIds);

        // Extract block IDs from source's section filter that match installed blocks
        const sourceSection = sourceFilters.find(f => f.id === 'section');
        if (sourceSection) {
            for (const componentId of sourceSection.components) {
                if (blockIdSet.has(componentId) && !collectedSectionIds.has(componentId)) {
                    collectedSectionIds.add(componentId);
                    newSectionIds.push(componentId);
                }
            }
        }

        // Collect sub-component filter entries whose id matches a block ID
        for (const filter of sourceFilters) {
            if (filter.id === 'main' || filter.id === 'section') continue;
            if (blockIdSet.has(filter.id) && !collectedSubFilterIds.has(filter.id)) {
                collectedSubFilterIds.add(filter.id);
                newSubFilters.push(filter);
            }
        }
    }

    if (newSectionIds.length === 0 && newSubFilters.length === 0) return null;

    // Merge into destination
    const destFile = await githubFileOps.getFileContent(
        destOwner, destRepo, 'component-filters.json',
    );
    if (!destFile?.content) return null;

    const destFilters: Array<{ id: string; components: string[] }> =
        JSON.parse(destFile.content);

    let changed = false;

    // Append new block IDs to destination's section filter (skip duplicates)
    const destSection = destFilters.find(f => f.id === 'section');
    if (destSection) {
        const existingSectionIds = new Set(destSection.components);
        for (const id of newSectionIds) {
            if (!existingSectionIds.has(id)) {
                destSection.components.push(id);
                changed = true;
            }
        }
    }

    // Append new sub-component filter entries (skip entries already present)
    const existingFilterIds = new Set(destFilters.map(f => f.id));
    for (const subFilter of newSubFilters) {
        if (!existingFilterIds.has(subFilter.id)) {
            destFilters.push(subFilter);
            changed = true;
        }
    }

    return changed ? JSON.stringify(destFilters, null, 2) : null;
}

/**
 * Build a merged component-models.json from multiple source repositories.
 *
 * component-models.json is a flat array of model objects (each with an `id`
 * and `fields` array). Collects models matching installed block IDs
 * (including sub-component models like tabs-item for tabs), deduplicates
 * across libraries, and appends to the destination.
 */
async function buildMergedComponentModelsMultiSource(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    libraryBlockFiles: LibraryBlockData[],
): Promise<string | null> {
    const newModels: Array<{ id: string; [key: string]: unknown }> = [];
    const collectedIds = new Set<string>();

    for (const libData of libraryBlockFiles) {
        const sourceFile = await githubFileOps.getFileContent(
            libData.source.owner, libData.source.repo, 'component-models.json',
        );
        if (!sourceFile?.content) continue;

        const sourceModels: Array<{ id: string; [key: string]: unknown }> =
            JSON.parse(sourceFile.content);

        for (const model of sourceModels) {
            if (collectedIds.has(model.id)) continue;
            const matches = libData.blockIds.some(
                (block: string) => model.id === block || model.id.startsWith(`${block}-`),
            );
            if (!matches) continue;

            collectedIds.add(model.id);
            newModels.push(model);
        }
    }

    if (newModels.length === 0) return null;

    // Merge into destination
    const destFile = await githubFileOps.getFileContent(
        destOwner, destRepo, 'component-models.json',
    );
    if (!destFile?.content) return null;

    const destModels: Array<{ id: string; [key: string]: unknown }> =
        JSON.parse(destFile.content);

    const existingIds = new Set(destModels.map(m => m.id));
    const entriesToAdd = newModels.filter(m => !existingIds.has(m.id));

    if (entriesToAdd.length === 0) return null;

    return JSON.stringify([...destModels, ...entriesToAdd], null, 2);
}

