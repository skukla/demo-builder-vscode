/**
 * What an install says when it ends, in two forms (owner, 2026-11-07): the whole note, every line in
 * order, for the record and agents; and the few lines the import window shows the SC, with a line
 * for each data type with a problem that did not stop the install, for that type's row. Split out
 * of `engine.ts`, which runs the install.
 *
 * @module features/data-installer/services/demoBuilderEngine/installNote
 */

import { plainFailure } from '../../plainFailure';
import { type PlainText } from '@/core/utils/plainText';
import { plainRowNote } from '../../plainRows';
import type { SkippedRow } from './kindContext';

/**
 * What an SC will wonder next, measured on a live install: search took about 17 minutes (2026-11-03).
 * The first is also the import window's ending, word for word (`JobStanding.searchDelay`; owner,
 * 2026-11-10, walk F134: plain and short).
 */
export const AFTER_PRODUCTS_LINES = [
    'New products can take 20 minutes to show in search.',
    "This datapack doesn't include product images. Products show the images that are in AEM Assets.",
];

/**
 * A line for each data type with a problem that did not stop the install, for its row: how many of
 * its rows were not added, "3 products weren't added." (walk F221). What the check found is Verify's
 * line alone, so it shows once (review, 2026-11-10: it was on the products' row as well).
 */
export function rowNotesOf(skipped: readonly SkippedRow[] | undefined): Record<string, PlainText> {
    const refused = new Map<string, number>();
    for (const row of skipped ?? []) refused.set(row.kind, (refused.get(row.kind) ?? 0) + 1);
    const notes: Record<string, PlainText> = {};
    for (const [kind, n] of refused) notes[kind] = plainRowNote(kind, n);
    return notes;
}

/** One line of an install's note, and whether the SC needs to read it in the window. */
export type NoteLine = [line: string | undefined, forSc: boolean];

/**
 * The note, every line in order for the record and agents, and the few the window shows the SC:
 * what was not added, grouped by reason in plain words (walk F221), then what changed in their store
 * and what is left for them to do (owner, 2026-11-07: the whole note as one paragraph was "far too
 * noisy"). The SC's lines go through the plain-words door (`plainFailure`), which keeps the engine's
 * own sentences and stops anything still raw. The note keeps Commerce's words for agents.
 *
 * @param plainLines - the SC's lines already in plain words: what was not added or not deleted
 */
export function noteOf(lines: NoteLine[], plainLines: readonly PlainText[] = []): { note?: string; scLines?: PlainText[] } {
    const said = lines.filter((line): line is [string, boolean] => Boolean(line[0]));
    const forSc = [...plainLines, ...said.filter(([, sc]) => sc).map(([line]) => plainFailure(line))];
    return { note: said.map(([line]) => line).join(' ') || undefined, ...(forSc.length > 0 ? { scLines: forSc } : {}) };
}
