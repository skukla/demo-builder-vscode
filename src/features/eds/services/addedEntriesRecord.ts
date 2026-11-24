/**
 * Which block folders a block library install left out because the SC had
 * removed them by hand.
 *
 * The record is `installedBlockLibraries[].blockIds`: the folders the library
 * copied before. Without it, "never copied" and "copied, then deleted by the
 * SC" look the same (the folder is missing either way), so the next install or
 * update would put a deliberate deletion back. A folder the library copied
 * before that is now gone was removed by hand, and stays removed: the idea
 * ADR-013 uses for files in the project folder.
 *
 * Installs used to add entries to the storefront's Universal Editor files too,
 * under the same rule. They stopped with EDS-71 (Adobe deleted those files,
 * and the DA.live block list no longer reads them); the entries an older
 * install recorded are removed by `blockLibraryRemovalEntries.ts`.
 *
 * In its own module rather than blockCollectionHelpers because many suites mock
 * that one whole, and the update and install paths call the wording below.
 *
 * @module features/eds/services/addedEntriesRecord
 */

/** Something a library has that the install left out: the SC removed it by hand. */
export interface RemovedByHandEntry {
    library: string;
    file: string;
    id: string;
}

/** The library a block came from, with the folders it copied on earlier runs. */
export interface EntryOrigin {
    name: string;
    /** Block folders it copied on earlier runs (`installedBlockLibraries[].blockIds`). */
    blockIds?: string[];
}

/** What one install run left out. */
export interface EntryTracker {
    removedByHand: RemovedByHandEntry[];
}

/** A tracker for one install run. */
export function createEntryTracker(): EntryTracker {
    return { removedByHand: [] };
}

/**
 * Decide a block whose folder the storefront does not have. True when the
 * library never copied it before (copy it); false (and noted as removed by hand)
 * when it did: the SC deleted the folder, so it does not go back.
 *
 * @param tracker - this run's tracker
 * @param origin - the library the block comes from
 * @param blockId - the block's folder name
 */
export function claimMissingBlockFolder(
    tracker: EntryTracker,
    origin: EntryOrigin,
    blockId: string,
): boolean {
    if (!origin.blockIds?.includes(blockId)) return true;
    tracker.removedByHand.push({
        library: origin.name, file: `block folder blocks/${blockId}`, id: blockId,
    });
    return false;
}

/**
 * The sentence both surfaces show when something was left out, or undefined
 * when nothing was. One mention per id, with the places it was missing from.
 *
 * @param entries - what the run left out
 */
export function describeEntriesRemovedByHand(entries: RemovedByHandEntry[]): string | undefined {
    if (entries.length === 0) return undefined;
    const filesById = new Map<string, Set<string>>();
    for (const { id, file } of entries) {
        const files = filesById.get(id) ?? new Set<string>();
        files.add(file);
        filesById.set(id, files);
    }
    const parts = [...filesById].map(([id, files]) => `${id} (${[...files].join(', ')})`);
    const noun = parts.length === 1 ? 'entry' : 'entries';
    return `Left out ${parts.length} block ${noun} removed by hand: ${parts.join('; ')}.`;
}

/**
 * The line both block-library UPDATE surfaces (the Check for Updates toast and
 * `apply_updates`) show when an update left something out because
 * the SC had removed it by hand; undefined when it left nothing out.
 */
export function describeUpdateLeftOut(
    item: { project: { name: string }; library: { name: string } },
    leftOut: RemovedByHandEntry[],
): string | undefined {
    const sentence = describeEntriesRemovedByHand(leftOut);
    return sentence && `${item.library.name} in ${item.project.name}: ${sentence}`;
}
