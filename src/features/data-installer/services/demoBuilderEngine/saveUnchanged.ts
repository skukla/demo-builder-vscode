/**
 * A save that would change nothing writes nothing (owner, 2026-11-09, walk F89 and F124). Save Changes
 * cannot know whether anything changed until it has read the store, so a press right after a clean
 * install used to write a new version identical to the one installed: a useless save, which would
 * now also push the save worth undoing out of the two a pack keeps. Now, once the save has read the store, it compares what it read with the version
 * the demo uses, row by row in the same pack form and the same hash every comparison uses
 * (`packedFingerprint`), and when every data type holds the same rows it stops there.
 *
 * Only a save into the demo's own pack is compared: a Save As makes a new pack, which is the SC's
 * ask whatever it holds. Store configuration the version holds itself is compared with the rest; a save
 * that would write them into a layer beside the version counts as a change, since the layer already
 * written is not read here.
 *
 * @module features/data-installer/services/demoBuilderEngine/saveUnchanged
 */

import { packedFingerprint, rowsByKey } from './storeCopies';
import type { DatapackId } from '@/types/datapack';

/** The window's sentence, and the agent's, for a save that found nothing to save. */
export const NOTHING_TO_SAVE = "Nothing changed since this demo's last save, so nothing was saved.";

/**
 * The demo's pack, when a save would write nothing: into that pack (saved under its own name), with
 * the rows it read the version the demo uses, unchanged. Undefined when the save has work to do.
 *
 * @param pack - the pack the demo uses, when the save is of it
 * @param intoName - the name of the pack the save would write
 */
export function unchangedPack(
    pack: DatapackId | undefined,
    intoName: string,
    installed: Record<string, unknown>,
    read: Record<string, unknown>,
    writesLayer: boolean,
): DatapackId | undefined {
    if (!pack || intoName !== pack.name) return undefined;
    return unchangedSince(installed, read, writesLayer) ? pack : undefined;
}

/** One data type's rows as their hashes by key. */
function hashed(kind: string, records: unknown): Map<string, string> {
    return new Map(
        [...rowsByKey(kind, records)].map(([key, row]) => [key, packedFingerprint(kind, row)]),
    );
}

/** Whether two data types' rows are the same rows, key for key and hash for hash. */
function sameKind(kind: string, a: unknown, b: unknown): boolean {
    const left = hashed(kind, a);
    const right = hashed(kind, b);
    return left.size === right.size && [...left].every(([key, hash]) => right.get(key) === hash);
}

/**
 * Whether the rows a save read are the version the demo uses, unchanged.
 *
 * @param installed - the installed version's rows, by data type
 * @param read - the rows the save read from the store, by data type
 * @param writesLayer - the save would also write a settings layer beside the version
 */
export function unchangedSince(
    installed: Record<string, unknown>,
    read: Record<string, unknown>,
    writesLayer: boolean,
): boolean {
    if (writesLayer) return false;
    const kinds = new Set([...Object.keys(installed), ...Object.keys(read)]);
    if (kinds.size === 0) return false;
    return [...kinds].every(
        (kind) => kind in installed && kind in read && sameKind(kind, installed[kind], read[kind]),
    );
}
