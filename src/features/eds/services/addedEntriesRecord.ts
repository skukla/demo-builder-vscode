/**
 * Which authoring entries a block library install added, and which it left out
 * because the SC had removed them by hand. The same rule covers the block
 * folders it copied (`installedBlockLibraries[].blockIds`) and the HTML examples
 * (`plugins.da.unsafeHTML`) it filled into existing entries.
 *
 * Installing or updating a library merges its entries into the storefront's
 * `component-definition.json`, `component-filters.json` and
 * `component-models.json`. Without a record, "never added" and "added, then
 * deleted by the SC" look the same — the entry is missing either way — so the
 * next install put a deliberate deletion back. The record is the proof of
 * authorship (the idea ADR-013 uses for files in the project folder): an entry
 * the extension added before that is now gone was removed by hand, and stays
 * removed.
 *
 * A library with no record (every project installed before 2026-10-09) is
 * treated as having added nothing, so its first run behaves as before and
 * starts the record. Guessing authorship from what is in the file today could
 * claim template entries as ours.
 *
 * In its own module rather than blockCollectionHelpers because many suites mock
 * that one whole, and the update and install paths call the wording below.
 *
 * @module features/eds/services/addedEntriesRecord
 */

import type { AddedComponentEntries } from '@/types/blockLibraries';

/** One kind of authoring entry, named as the record names it. */
type EntryKind = keyof AddedComponentEntries;

/** Every kind, in the order a record lists them. */
const ENTRY_KINDS: EntryKind[] = ['definition', 'sectionFilter', 'filters', 'models', 'htmlExamples'];

/** Where each kind of entry lives, as the "Left out" line names it. */
const ENTRY_KIND_FILE: Record<EntryKind, string> = {
    definition: 'component-definition.json',
    sectionFilter: 'component-filters.json',
    filters: 'component-filters.json',
    models: 'component-models.json',
    htmlExamples: 'HTML example in component-definition.json',
};

/** An entry a library has that the install left out: the SC removed it by hand. */
export interface RemovedByHandEntry {
    library: string;
    file: string;
    id: string;
}

/** The library an entry came from, with what it added on earlier runs. */
export interface EntryOrigin {
    name: string;
    addedEntries?: AddedComponentEntries;
    /** Block folders it copied on earlier runs (`installedBlockLibraries[].blockIds`). */
    blockIds?: string[];
}

/** What one install run added per library, and what it left out. */
export interface EntryTracker {
    added: Map<string, AddedComponentEntries>;
    removedByHand: RemovedByHandEntry[];
}

/** An empty record. */
function emptyAddedEntries(): AddedComponentEntries {
    return { definition: [], sectionFilter: [], filters: [], models: [] };
}

/** A tracker for one install run. */
export function createEntryTracker(): EntryTracker {
    return { added: new Map(), removedByHand: [] };
}

/**
 * Decide an entry the storefront's file does not have. Returns true (and notes
 * it as added) when the library never added it before; false (and notes it as
 * removed by hand) when it did.
 *
 * @param tracker - this run's tracker
 * @param origin - the library the entry comes from
 * @param kind - which kind of entry
 * @param id - the entry's id
 */
export function claimMissingEntry(
    tracker: EntryTracker,
    origin: EntryOrigin,
    kind: EntryKind,
    id: string,
): boolean {
    if (origin.addedEntries?.[kind]?.includes(id)) {
        tracker.removedByHand.push({ library: origin.name, file: ENTRY_KIND_FILE[kind], id });
        return false;
    }
    noteAddedEntry(tracker, origin, kind, id);
    return true;
}

/**
 * Note an entry this run put in without a decision to make — the HTML example an
 * entry brought with it when the run added the whole entry.
 *
 * @param tracker - this run's tracker
 * @param origin - the library the entry comes from
 * @param kind - which kind of entry
 * @param id - the entry's id
 */
export function noteAddedEntry(
    tracker: EntryTracker,
    origin: EntryOrigin,
    kind: EntryKind,
    id: string,
): void {
    let added = tracker.added.get(origin.name);
    if (!added) {
        added = emptyAddedEntries();
        tracker.added.set(origin.name, added);
    }
    (added[kind] ??= []).push(id);
}

/**
 * Decide a block whose folder the storefront does not have. True when the
 * library never copied it before (copy it); false (and noted as removed by hand)
 * when it did: the SC deleted the folder, so neither its files nor its entries
 * go back.
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
 * The record after a run: what was there before plus what this run added.
 * Undefined when both are empty, so a record never carries four empty lists;
 * `htmlExamples` only when it has ids, so a record without examples keeps the
 * shape it had before that field existed.
 *
 * @param previous - the library's record before the run
 * @param added - what this run added for the library
 */
export function mergeAddedEntries(
    previous: AddedComponentEntries | undefined,
    added: AddedComponentEntries | undefined,
): AddedComponentEntries | undefined {
    const merged = emptyAddedEntries();
    for (const kind of ENTRY_KINDS) {
        merged[kind] = [...new Set([...(previous?.[kind] ?? []), ...(added?.[kind] ?? [])])];
    }
    if (merged.htmlExamples?.length === 0) delete merged.htmlExamples;
    const total = ENTRY_KINDS.reduce((sum, kind) => sum + (merged[kind]?.length ?? 0), 0);
    return total > 0 ? merged : undefined;
}

/**
 * The sentence both surfaces show when entries were left out, or undefined
 * when none were. One mention per entry id, with the files it was missing from.
 *
 * @param entries - the entries the run left out
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
 * `apply_updates`) show when an update left entries out because
 * the SC had removed them by hand; undefined when it left nothing out.
 */
export function describeUpdateLeftOut(
    item: { project: { name: string }; library: { name: string } },
    leftOut: RemovedByHandEntry[],
): string | undefined {
    const sentence = describeEntriesRemovedByHand(leftOut);
    return sentence && `${item.library.name} in ${item.project.name}: ${sentence}`;
}
