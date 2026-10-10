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
 * The merge of those three JSON files is in blockLibraryComponentMerge.ts;
 * this file owns discovery, the cross-library dedup and the commit.
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
 * the indentation it already had. The same goes for a block folder it copied
 * before and an HTML example it filled before.
 *
 * @module features/eds/services/blockCollectionHelpers
 */

import {
    claimMissingBlockFolder,
    createEntryTracker,
    mergeAddedEntries,
    type EntryOrigin,
    type EntryTracker,
    type RemovedByHandEntry,
} from './addedEntriesRecord';
import {
    buildMergedComponentDefinitionMultiSource,
    buildMergedComponentFiltersMultiSource,
    buildMergedComponentModelsMultiSource,
    type LibraryBlockData,
    type MergeContext,
} from './blockLibraryComponentMerge';
import type { GitHubFileOperations } from './github/githubFileOperations';
import type { GitHubTreeInput } from './types';
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
    /**
     * The block folders this library copied on earlier runs
     * (`installedBlockLibraries[].blockIds`). One in here whose folder is gone
     * now was removed by hand: its files and entries are not put back.
     */
    blockIds?: string[];
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

/** What discovery carries from one library to the next within a run. */
interface DiscoveryState {
    /** Block folders already claimed: in the storefront, or by an earlier library */
    seenBlocks: Set<string>;
    /** Every block this run copies, across libraries */
    allBlockIds: string[];
    tracker: EntryTracker;
}

/**
 * Discover the blocks in a single library's source repo and deduplicate them
 * against blocks already seen (first-seen-wins). Mutates `seenBlocks` and
 * `allBlockIds` to record newly-claimed block IDs. A block the library copied
 * before whose folder is gone is claimed but not copied (removed by hand).
 */
async function discoverAndDeduplicateLibraryBlocks(
    githubFileOps: GitHubFileOperations,
    lib: BlockLibraryEntry,
    { seenBlocks, allBlockIds, tracker }: DiscoveryState,
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

    // Determine which blocks are new (not seen in a prior library). Claim a
    // removed-by-hand block too, so a later library does not copy it back either.
    const uniqueBlockIds: string[] = [];
    for (const blockId of [...discoveredBlocks].sort()) {
        if (seenBlocks.has(blockId)) continue;
        seenBlocks.add(blockId);
        if (!claimMissingBlockFolder(tracker, toOrigin(lib), blockId)) continue;
        uniqueBlockIds.push(blockId);
        allBlockIds.push(blockId);
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
        const tracker = createEntryTracker();

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
                githubFileOps, lib, { seenBlocks, allBlockIds, tracker },
            );

            totalDiscovered += discovered.discoveredCount;

            if (discovered.uniqueBlockIds.length > 0) {
                libraryBlockFiles.push({
                    source: lib.source,
                    blockIds: discovered.uniqueBlockIds,
                    files: discovered.files,
                    origin: toOrigin(lib),
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
                // Every block from every source library is already in the destination
                // repo (added by the template), or was removed by hand there. Nothing
                // to copy — this is a success.
                logger.info(`[Block Collection] All ${totalDiscovered} blocks already present in destination or removed by hand — nothing to add`);
                logRemovedByHand(logger, tracker.removedByHand);
                return {
                    success: true, blocksCount: 0, blockIds: [], libraryVersions: [],
                    removedByHand: tracker.removedByHand,
                };
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
        const merge: MergeContext = { githubFileOps, destOwner, destRepo, tracker };
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

        const { removedByHand } = tracker;
        logRemovedByHand(logger, removedByHand);

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

/** The library as the merge sees it: its name and what it added on earlier runs. */
function toOrigin(lib: BlockLibraryEntry): EntryOrigin {
    return { name: lib.name, addedEntries: lib.addedEntries, blockIds: lib.blockIds };
}

/** One log line naming what the run left out, when it left anything out. */
function logRemovedByHand(logger: Logger, removedByHand: RemovedByHandEntry[]): void {
    if (removedByHand.length === 0) return;
    logger.info(`[Block Collection] Left out ${removedByHand.length} removed by hand: ${removedByHand.map((e) => `${e.id} (${e.file})`).join(', ')}`);
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
