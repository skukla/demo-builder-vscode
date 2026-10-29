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

import type { DatapackId, ProjectDatapack } from '@/types/datapack';

/** The global-state key the record lives under. */
export const SHARED_IN_FILES_KEY = 'demoBuilder.datapacksSharedInFiles';

/** One pack shared in a file: when, and the pack a colleague gets if it goes. */
export interface SharedInFileEntry {
    /** ISO time of the last export that carried it. */
    at: string;
    /** The name of the pack it was made from, when it records one. */
    originName?: string;
}

/** The two calls of VS Code's `Memento` this needs. */
export interface SharedInFilesMemento {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

const keyOf = (id: DatapackId): string => `${id.name}@${id.version}`;

function isEntry(value: unknown): value is SharedInFileEntry {
    return typeof value === 'object' && value !== null && typeof (value as { at?: unknown }).at === 'string';
}

/** What is recorded, read defensively: anything else in the key reads as nothing. */
function readAll(memento: SharedInFilesMemento): Record<string, SharedInFileEntry> {
    const stored = memento.get<unknown>(SHARED_IN_FILES_KEY);
    if (typeof stored !== 'object' || stored === null) return {};
    return Object.fromEntries(Object.entries(stored).filter(([, value]) => isEntry(value)));
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
    const entry: SharedInFileEntry = { at: now.toISOString(), ...(pack.origin ? { originName: pack.origin.name } : {}) };
    await memento.update(SHARED_IN_FILES_KEY, { ...readAll(memento), [keyOf(pack)]: entry });
}

/** The record for one version of a pack, if it was shared in a file. */
export function sharedInFile(memento: SharedInFilesMemento, id: DatapackId): SharedInFileEntry | undefined {
    return readAll(memento)[keyOf(id)];
}

/** The one sentence the delete warns with. */
export function sharedInFileWarning(entry: SharedInFileEntry): string {
    const day = new Date(entry.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    const instead = entry.originName ?? 'no sample data';
    return `You shared this pack in a project file on ${day}. Anyone who hasn't created that project yet will get ${instead} instead.`;
}
