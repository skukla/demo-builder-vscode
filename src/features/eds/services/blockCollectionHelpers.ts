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
 * The three authoring files are the SC's as much as ours: an entry the extension
 * added before and the SC has since deleted is left out, not put back (the
 * record and its reasoning: addedEntriesRecord.ts), and each file is written in
 * the indentation it already had.
 *
 * @module features/eds/services/blockCollectionHelpers
 */

import {
    claimMissingEntry,
    createEntryTracker,
    mergeAddedEntries,
    type EntryOrigin,
    type EntryTracker,
    type RemovedByHandEntry,
} from './addedEntriesRecord';
import type { GitHubFileOperations } from './github/githubFileOperations';
import type { GitHubTreeInput } from './types';
import { stringifyJsonLike } from '@/core/utils/jsonFormatting';
import type { AddedComponentEntries, LibraryVersionInfo } from '@/types/blockLibraries';
import type { AddonSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

export interface InstallBlockCollectionResult {
    success: boolean;
    blocksCount: number;
    blockIds: string[];
    error?: string;
    /** Per-library tracking data (source commit SHA + block IDs) for version tracking */
    libraryVersions?: LibraryVersionInfo[];
    /** Authoring entries left out because the SC had deleted them (EDS-36). */
    removedByHand?: RemovedByHandEntry[];
}

/** Entry for a block library source (used by installBlockCollections) */
export interface BlockLibraryEntry {
    source: AddonSource;
    name: string;
    /**
     * What this library added to the storefront's authoring files on earlier
     * runs (`installedBlockLibraries[].addedEntries`). An entry in here that is
     * missing from its file now was removed by hand and is not put back.
     */
    addedEntries?: AddedComponentEntries;
}

/** Per-library block discovery result used by merge helpers */
interface LibraryBlockData {
    source: AddonSource;
    blockIds: string[];
    files: Array<{ path: string; sha: string }>;
    /** The library's name and its record, for deciding missing entries */
    origin: EntryOrigin;
}

/** Where the merged authoring files go, and the run's record of what was added. */
interface MergeContext {
    githubFileOps: GitHubFileOperations;
    destOwner: string;
    destRepo: string;
    tracker: EntryTracker;
}

/** Result of discovering + cross-library-deduplicating one library's blocks */
interface LibraryDiscoveryResult {
    /** Total blocks discovered in this library's source (before dedup) */
    discoveredCount: number;
    /** Blocks unique to this library (not seen in a prior library / destination) */
    uniqueBlockIds: string[];
    /** Files belonging only to the unique blocks */
    files: Array<{ path: string; sha: string }>;
    /** Source repo commit SHA (for version tracking) */
    sourceCommitSha: string;
}

/**
 * Discover the blocks in a single library's source repo and deduplicate them
 * against blocks already seen (first-seen-wins). Mutates `seenBlocks` and
 * `allBlockIds` to record newly-claimed block IDs.
 */
async function discoverAndDeduplicateLibraryBlocks(
    githubFileOps: GitHubFileOperations,
    lib: BlockLibraryEntry,
    seenBlocks: Set<string>,
    allBlockIds: string[],
): Promise<LibraryDiscoveryResult> {
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

    return {
        discoveredCount: discoveredBlocks.size,
        uniqueBlockIds,
        files: blockFiles.map(f => ({ path: f.path, sha: f.sha })),
        sourceCommitSha,
    };
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

        // Total blocks discovered across all source libraries (before destination dedup).
        // Used to distinguish "source was empty" from "all blocks already present".
        let totalDiscovered = 0;

        // 1. Discover blocks from each library, dedup across libraries
        for (const lib of libraries) {
            const discovered = await discoverAndDeduplicateLibraryBlocks(
                githubFileOps, lib, seenBlocks, allBlockIds,
            );

            totalDiscovered += discovered.discoveredCount;

            if (discovered.uniqueBlockIds.length > 0) {
                libraryBlockFiles.push({
                    source: lib.source,
                    blockIds: discovered.uniqueBlockIds,
                    files: discovered.files,
                    origin: { name: lib.name, addedEntries: lib.addedEntries },
                });

                // Track version info for this library
                libraryVersions.push({
                    source: lib.source,
                    name: lib.name,
                    commitSha: discovered.sourceCommitSha,
                    blockIds: discovered.uniqueBlockIds,
                });
            }

            const skippedCount = discovered.discoveredCount - discovered.uniqueBlockIds.length;
            if (skippedCount > 0) {
                logger.info(`[Block Collection] ${lib.name}: skipped ${skippedCount} duplicate blocks`);
            }
        }

        const sortedBlockIds = allBlockIds.sort();

        if (sortedBlockIds.length === 0) {
            if (totalDiscovered > 0) {
                // All blocks from every source library are already in the destination repo
                // (added by the template). Nothing to copy — this is a success.
                logger.info(`[Block Collection] All ${totalDiscovered} blocks already present in destination — nothing to add`);
                return { success: true, blocksCount: 0, blockIds: [], libraryVersions: [] };
            }
            logger.warn('[Block Collection] No blocks found in source libraries');
            return { success: false, blocksCount: 0, blockIds: [], error: 'No blocks found in source libraries' };
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
        const merge: MergeContext = {
            githubFileOps, destOwner, destRepo, tracker: createEntryTracker(),
        };
        const mergedCompDef = await buildMergedComponentDefinitionMultiSource(
            merge, libraryBlockFiles,
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
            merge, libraryBlockFiles,
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
            merge, libraryBlockFiles,
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

        // 5. Create a single atomic commit.
        //
        // Through `commitTreeToBranch`, which re-bases if `main` moves while this
        // runs. This is ADDITIVE — it must never move the branch to a commit that
        // is not a descendant of what is there now. Doing that by hand here, with
        // a forced ref update, is what silently reverted a colleague's work
        // (2026-08-18); the sequence is several API round-trips and a push landing
        // inside it used to lose.
        const commitMsg = libraries.length === 1
            ? `chore: add ${libraries[0].name} (${sortedBlockIds.length} blocks)`
            : `chore: add blocks from ${libraries.length} libraries (${sortedBlockIds.length} blocks)`;
        await githubFileOps.commitTreeToBranch(destOwner, destRepo, 'main', treeEntries, commitMsg);

        logger.info(`[Block Collection] Installed ${sortedBlockIds.length} blocks from ${libraries.length} ${libraries.length === 1 ? 'library' : 'libraries'}`);

        const { removedByHand } = merge.tracker;
        if (removedByHand.length > 0) {
            logger.info(`[Block Collection] Left out ${removedByHand.length} entries removed by hand: ${removedByHand.map((e) => `${e.id} (${e.file})`).join(', ')}`);
        }

        return {
            success: true,
            blocksCount: sortedBlockIds.length,
            blockIds: sortedBlockIds,
            libraryVersions: withAddedEntries(libraryVersions, libraries, merge.tracker),
            removedByHand,
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
 * Each library's version record with its added entries: the earlier record plus
 * what this run added. A library that added nothing keeps its record unchanged.
 */
function withAddedEntries(
    versions: LibraryVersionInfo[],
    libraries: BlockLibraryEntry[],
    tracker: EntryTracker,
): LibraryVersionInfo[] {
    return versions.map((version) => {
        const previous = libraries.find((lib) => lib.name === version.name)?.addedEntries;
        const addedEntries = mergeAddedEntries(previous, tracker.added.get(version.name));
        return addedEntries ? { ...version, addedEntries } : version;
    });
}

/**
 * Build a merged component-definition.json from multiple source repositories.
 *
 * For each source, extracts entries from ALL groups matching the blocks assigned
 * to that source (after cross-library dedup). Appends to the matching destination
 * group, creating new groups as needed.
 */
async function buildMergedComponentDefinitionMultiSource(
    { githubFileOps, destOwner, destRepo, tracker }: MergeContext,
    libraryBlockFiles: LibraryBlockData[],
): Promise<string | null> {
    // Collect entries tagged by group from all source repos.
    // Cache parsed source definitions for the unsafeHTML enrichment pass below.
    const entriesByGroup: CollectedEntriesByGroup = new Map();
    const collectedIds = new Set<string>();
    const origins = new Map<string, EntryOrigin>();
    const sourceDefinitions: Array<{ groups: Array<{ components?: Array<{ id: string; plugins?: { da?: { unsafeHTML?: string } } }> }> }> = [];

    for (const libData of libraryBlockFiles) {
        const sourceFile = await githubFileOps.getFileContent(
            libData.source.owner, libData.source.repo, 'component-definition.json',
        );
        if (!sourceFile?.content) continue;

        const sourceDef = JSON.parse(sourceFile.content);
        if (!sourceDef.groups) continue;

        sourceDefinitions.push(sourceDef);

        for (const group of sourceDef.groups) {
            if (!group.components) continue;
            for (const entry of group.components) {
                if (collectedIds.has(entry.id)) continue;
                const matches = libData.blockIds.some(
                    (block: string) => entry.id === block || entry.id.startsWith(`${block}-`),
                );
                if (!matches) continue;

                collectedIds.add(entry.id);
                origins.set(entry.id, libData.origin);
                let groupData = entriesByGroup.get(group.id);
                if (!groupData) {
                    groupData = { title: group.title, entries: [] };
                    entriesByGroup.set(group.id, groupData);
                }
                groupData.entries.push(entry);
            }
        }
    }

    // Fetch destination — needed for both the new-entry merge and the enrichment pass.
    const destFile = await githubFileOps.getFileContent(
        destOwner, destRepo, 'component-definition.json',
    );
    if (!destFile?.content) return null;

    const destDef = JSON.parse(destFile.content);
    if (!destDef.groups) return null;

    // Pass 1: merge component-definition entries for newly-installed (unique) blocks,
    // leaving out any the SC deleted after an earlier run added them.
    const addedCount = mergeNewComponentDefinitionEntries(destDef, entriesByGroup, (id) => {
        const origin = origins.get(id);
        return origin ? claimMissingEntry(tracker, origin, 'definition', id) : true;
    });

    // Pass 2: enrich unsafeHTML for blocks already present in the destination but
    // without unsafeHTML. Covers deduplicated blocks whose component-definition entries
    // came from the template rather than the library — their block files were correctly
    // preserved, but their metadata may lack unsafeHTML that the library source has.
    // Additive only: never overwrites existing unsafeHTML, never touches block files.
    const enrichedCount = enrichMissingUnsafeHtml(destDef, sourceDefinitions);

    if (addedCount === 0 && enrichedCount === 0) return null;
    return stringifyJsonLike(destFile.content, destDef);
}

/** Group entries collected from source repos, keyed by group id. */
type CollectedEntriesByGroup = Map<string, {
    title: string;
    entries: Array<{ id: string; [key: string]: unknown }>;
}>;

/** Parsed source component-definition shape needed for unsafeHTML enrichment. */
type SourceDefinition = {
    groups: Array<{ components?: Array<{ id: string; plugins?: { da?: { unsafeHTML?: string } } }> }>;
};

/**
 * Pass 1: append component-definition entries for newly-installed (unique) blocks
 * into the matching destination group, creating groups as needed. An entry that
 * is anywhere in the file — in any group — is left where it is; a missing one is
 * added only if `mayAdd` agrees. Returns the number of entries added.
 */
function mergeNewComponentDefinitionEntries(
    destDef: { groups: Array<{ id: string; title?: string; components?: Array<{ id: string }> }> },
    entriesByGroup: CollectedEntriesByGroup,
    mayAdd: (id: string) => boolean,
): number {
    const existingIds = new Set(
        destDef.groups.flatMap((g) => g.components?.map((c: { id: string }) => c.id) ?? []),
    );
    let addedCount = 0;
    for (const [groupId, groupData] of entriesByGroup) {
        const newEntries = groupData.entries.filter(
            (c: { id: string }) => !existingIds.has(c.id) && mayAdd(c.id),
        );
        if (newEntries.length === 0) continue;
        let destGroup = destDef.groups.find((g: { id: string }) => g.id === groupId);
        if (!destGroup) {
            destGroup = { id: groupId, title: groupData.title, components: [] };
            destDef.groups.push(destGroup);
        }
        destGroup.components = [...(destGroup.components || []), ...newEntries];
        addedCount += newEntries.length;
    }
    return addedCount;
}

/**
 * Pass 2: enrich unsafeHTML for blocks already present in the destination but
 * missing it, using the source definitions. Additive only — never overwrites
 * existing unsafeHTML. Returns the number of entries enriched.
 */
function enrichMissingUnsafeHtml(
    destDef: { groups: Array<{ components?: Array<{ id: string; plugins?: { da?: { unsafeHTML?: string } } }> }> },
    sourceDefinitions: SourceDefinition[],
): number {
    let enrichedCount = 0;
    for (const sourceDef of sourceDefinitions) {
        for (const group of sourceDef.groups) {
            if (!group.components) continue;
            for (const entry of group.components) {
                const sourceUnsafeHTML = entry.plugins?.da?.unsafeHTML;
                if (!sourceUnsafeHTML) continue;

                for (const destGroup of destDef.groups) {
                    const destEntry = destGroup.components?.find(
                        (c: { id: string }) => c.id === entry.id,
                    );
                    if (!destEntry || destEntry.plugins?.da?.unsafeHTML) continue;
                    destEntry.plugins = destEntry.plugins ?? {};
                    destEntry.plugins.da = destEntry.plugins.da ?? {};
                    destEntry.plugins.da.unsafeHTML = sourceUnsafeHTML;
                    enrichedCount++;
                }
            }
        }
    }
    return enrichedCount;
}

/**
 * Build a merged component-filters.json from multiple source repositories.
 *
 * For each source, extracts filter entries (section allowlist + sub-component
 * filters) matching the blocks assigned to that source. Combines all entries
 * and appends to the destination's component-filters.json.
 */
async function buildMergedComponentFiltersMultiSource(
    { githubFileOps, destOwner, destRepo, tracker }: MergeContext,
    libraryBlockFiles: LibraryBlockData[],
): Promise<string | null> {
    const newSectionIds: Array<{ id: string; origin: EntryOrigin }> = [];
    const newSubFilters: Array<{ filter: { id: string; components: string[] }; origin: EntryOrigin }> = [];
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
                    newSectionIds.push({ id: componentId, origin: libData.origin });
                }
            }
        }

        // Collect sub-component filter entries whose id matches a block ID
        for (const filter of sourceFilters) {
            if (filter.id === 'main' || filter.id === 'section') continue;
            if (blockIdSet.has(filter.id) && !collectedSubFilterIds.has(filter.id)) {
                collectedSubFilterIds.add(filter.id);
                newSubFilters.push({ filter, origin: libData.origin });
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

    // Append new block IDs to destination's section filter (skip duplicates and
    // ids the SC removed after an earlier run added them)
    const destSection = destFilters.find(f => f.id === 'section');
    if (destSection) {
        const existingSectionIds = new Set(destSection.components);
        for (const { id, origin } of newSectionIds) {
            if (!existingSectionIds.has(id) && claimMissingEntry(tracker, origin, 'sectionFilter', id)) {
                destSection.components.push(id);
                changed = true;
            }
        }
    }

    // Append new sub-component filter entries (same two skips)
    const existingFilterIds = new Set(destFilters.map(f => f.id));
    for (const { filter, origin } of newSubFilters) {
        if (!existingFilterIds.has(filter.id) && claimMissingEntry(tracker, origin, 'filters', filter.id)) {
            destFilters.push(filter);
            changed = true;
        }
    }

    return changed ? stringifyJsonLike(destFile.content, destFilters) : null;
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
    { githubFileOps, destOwner, destRepo, tracker }: MergeContext,
    libraryBlockFiles: LibraryBlockData[],
): Promise<string | null> {
    const newModels: Array<{ model: { id: string; [key: string]: unknown }; origin: EntryOrigin }> = [];
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
            newModels.push({ model, origin: libData.origin });
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
    const entriesToAdd = newModels
        .filter(({ model, origin }) =>
            !existingIds.has(model.id) && claimMissingEntry(tracker, origin, 'models', model.id))
        .map(({ model }) => model);

    if (entriesToAdd.length === 0) return null;

    return stringifyJsonLike(destFile.content, [...destModels, ...entriesToAdd]);
}

