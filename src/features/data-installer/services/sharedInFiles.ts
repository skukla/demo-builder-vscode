/**
 * Which library packs this SC has shared in a project file (datapack-engine step 07).
 *
 * A project file carries its pack by reference, not by rows, so a colleague who creates a
 * project from the file reads the pack from the library. Deleting the pack afterwards leaves
 * them with the pack it was made from instead, so the delete warns, naming the day the pack
 * was shared and that pack.
 *
 * Kept in VS Code's global state, on this machine: only a pack's owner can delete it, and the
 * owner is the one who exported it. One key, a record keyed by `name@version`.
 *
 * @module features/data-installer/services/sharedInFiles
 */

import type { PackReads } from './recordedPack';
import type { DatapackId, DatapackReference, DatapackStoreName, ProjectDatapack } from '@/types/datapack';

/** The global-state key the record lives under. */
export const SHARED_IN_FILES_KEY = 'demoBuilder.datapacksSharedInFiles';

/** The pack a colleague gets instead: its name, and its version and store when recorded. */
export type SharedInFileOrigin = Omit<DatapackReference, 'origin'>;

/** One pack shared in a file: when, and the pack a colleague gets if it goes. */
export interface SharedInFileEntry {
    /** ISO time of the last export that carried it. */
    at: string;
    /** The pack it was made from, when it records one. */
    origin?: SharedInFileOrigin;
}

/** The two calls of VS Code's `Memento` this needs. */
export interface SharedInFilesMemento {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

const keyOf = (id: DatapackId): string => `${id.name}@${id.version}`;

/** An entry as stored: entries recorded before the origin's whole reference carry its name only. */
type StoredEntry = SharedInFileEntry & { originName?: unknown };

function isEntry(value: unknown): value is StoredEntry {
    return typeof value === 'object' && value !== null && typeof (value as { at?: unknown }).at === 'string';
}

/** An entry recorded with `originName` reads as an origin of that name (rule 3, no migration). */
function normalised({ originName, ...entry }: StoredEntry): SharedInFileEntry {
    if (entry.origin || typeof originName !== 'string') return entry;
    return { ...entry, origin: { name: originName } };
}

/** What is recorded, read defensively: anything else in the key reads as nothing. */
function readAll(memento: SharedInFilesMemento): Record<string, SharedInFileEntry> {
    const stored = memento.get<unknown>(SHARED_IN_FILES_KEY);
    if (typeof stored !== 'object' || stored === null) return {};
    return Object.fromEntries(
        Object.entries(stored)
            .filter((pair): pair is [string, StoredEntry] => isEntry(pair[1]))
            .map(([key, value]) => [key, normalised(value)]),
    );
}

/**
 * Record that this project's pack went out in a file. Only a library pack: a Data Installer
 * pack is in the shared catalog, which nothing in the extension deletes from.
 *
 * @param memento - VS Code's global state
 * @param project - the project exported
 * @param now - when
 */
export async function recordSharedInFile(
    memento: SharedInFilesMemento,
    project: { datapack?: ProjectDatapack },
    now: Date = new Date(),
): Promise<void> {
    const pack = project.datapack;
    if (pack?.store !== 'library') return;
    const entry: SharedInFileEntry = { at: now.toISOString(), ...(pack.origin ? { origin: pack.origin } : {}) };
    await memento.update(SHARED_IN_FILES_KEY, { ...readAll(memento), [keyOf(pack)]: entry });
}

/** The record for one version of a pack, if it was shared in a file. */
export function sharedInFile(memento: SharedInFilesMemento, id: DatapackId): SharedInFileEntry | undefined {
    return readAll(memento)[keyOf(id)];
}

/**
 * The name the SC sees for the pack it was made from, as the store holding it lists it.
 *
 * Asks the store the origin records, else the library and then the Data Installer (entries
 * recorded before the store was). Prefers the recorded version's row; any version of the same
 * pack will do, since a pack's display name is set across its versions.
 *
 * @param entry - what was recorded
 * @param reads - the two stores' reads
 * @returns the display name, or undefined when no store could say
 */
export async function originDisplayName(entry: SharedInFileEntry, reads: PackReads): Promise<string | undefined> {
    const origin = entry.origin;
    if (!origin) return undefined;
    const stores: DatapackStoreName[] = origin.store ? [origin.store] : ['library', 'installer'];
    for (const store of stores) {
        try {
            const rows = (await reads.versions(origin.name, store)).filter((row) => row.id.name === origin.name);
            const row = rows.find((r) => r.id.version === origin.version) ?? rows[0];
            if (row?.displayName) return row.displayName;
        } catch {
            // This store could not be asked: try the next; with none, the sentence says what the pack is.
        }
    }
    return undefined;
}

/**
 * The one sentence the delete warns with. It never names a pack by its id: with no display name
 * to hand, it says what the pack is.
 *
 * @param entry - what was recorded
 * @param originName - the origin's display name ({@link originDisplayName})
 */
export function sharedInFileWarning(entry: SharedInFileEntry, originName?: string): string {
    const day = new Date(entry.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    const instead = entry.origin ? (originName ?? 'the pack it was made from') : 'no sample data';
    return `You shared this pack in a project file on ${day}. Anyone who hasn't created that project yet will get ${instead} instead.`;
}

/**
 * The warning a delete of this pack carries, when this SC shared it in a project file.
 *
 * @param memento - VS Code's global state
 * @param id - the pack being deleted
 * @param reads - the two stores' reads, to name the pack it was made from
 */
export async function sharedInFileWarningFor(
    memento: SharedInFilesMemento,
    id: DatapackId,
    reads: PackReads,
): Promise<string | undefined> {
    const entry = sharedInFile(memento, id);
    return entry ? sharedInFileWarning(entry, await originDisplayName(entry, reads)) : undefined;
}
