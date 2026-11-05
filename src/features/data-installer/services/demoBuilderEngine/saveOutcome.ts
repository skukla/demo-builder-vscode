/**
 * What a save says: the line under its saving step, and the sentence it ends on (step 05,
 * step 07, step 14): where it saved, what it left out of the store because nothing picked it, and
 * which ids it kept because the store could not name them.
 *
 * Each step's line is a fact of its own, not the end of the step's sentence (owner, 2026-11-04:
 * "Reading from Commerce / The data you selected" broke one sentence across two lines).
 *
 * @module features/data-installer/services/demoBuilderEngine/saveOutcome
 */

import { KIND_NOUNS, inPickOrder, type LeftOut } from '../../pickableKinds';
import { dataTypeLabel } from '../../ui/dataTypeLabel';
import type { DatapackId } from '@/types/datapack';

/** How many, and at most a few of their names. */
export interface Named {
    count: number;
    names: string[];
}

/** The names shown per count: enough to recognise, never the rows. */
const NAMES_SHOWN = 3;

/** How many, with the first few names: every count an agent or the SC reads is this shape. */
export const named = (names: string[]): Named => ({ count: names.length, names: names.slice(0, NAMES_SHOWN) });

/** "3 products (A, B, C and 1 more)". */
function counted(each: LeftOut): string {
    const [one, many] = KIND_NOUNS[each.kind];
    const more = each.count > each.names.length ? ` and ${each.count - each.names.length} more` : '';
    return `${each.count} ${each.count === 1 ? one : many} (${each.names.join(', ')}${more})`;
}

/**
 * The saving step's line: what is going into the pack (owner, 2026-11-05: "New datapack" said nothing
 * the window's title had not). A count once the names would not read at a glance.
 */
export function savingLine(kinds: readonly string[]): string {
    return kinds.length > NAMES_SHOWN ? `${kinds.length} data types` : kinds.map(dataTypeLabel).join(', ');
}

/** "Saved to the Acme Demo pack.", and that the pack it came from is unchanged when it is another. */
export function savedSentence(saveAs: { id: DatapackId; displayName: string }, installed?: { id: DatapackId; displayName: string }): string {
    const where = `Saved to the ${saveAs.displayName} pack.`;
    return installed && saveAs.id.name !== installed.id.name ? `${where} ${installed.displayName} is unchanged.` : where;
}

/**
 * What the store has that the saved version does not (step 14, item 11); nothing when it left
 * nothing out.
 */
export function leftOutLine(leftOut: readonly LeftOut[]): string | undefined {
    const any = leftOut.filter((each) => each.count > 0);
    if (any.length === 0) return undefined;
    return `Left out, because nothing selected them: ${any.map(counted).join(', ')}.`;
}

/**
 * What a save into the demo's own pack left out, counted, for the result window: its names made a
 * wall of text there (owner, 2026-11-05). The agent's sentence keeps the names (`leftOutLine`).
 */
export function leftOutCountLine(leftOut: readonly LeftOut[]): string | undefined {
    const any = leftOut.filter((each) => each.count > 0);
    if (any.length === 0) return undefined;
    const counts = any.map((each) => `${each.count} ${KIND_NOUNS[each.kind][each.count === 1 ? 0 : 1]}`);
    return `Left out, because nothing selected them: ${counts.join(', ')}.`;
}

/** The ids kept as they are, named (step 14, item 14); nothing when every one was named. */
export function unnamedLine(unnamed: readonly string[]): string | undefined {
    if (unnamed.length === 0) return undefined;
    const { names } = named([...unnamed]);
    const more = unnamed.length > names.length ? ` and ${unnamed.length - names.length} more` : '';
    const one = unnamed.length === 1;
    return (
        `${unnamed.length} ${one ? 'id' : 'ids'} could not be turned into a name and ${one ? 'was' : 'were'} kept as ${one ? 'it is' : 'they are'} ` +
        `(${names.join(', ')}${more}); on another store ${one ? 'it' : 'they'} may point at something else.`
    );
}

/** Where the settings went, when they went beside the pack (step 09); nothing when none did. */
export function layerLine(layer: { datapackName: string; settings: number } | undefined): string | undefined {
    if (!layer) return undefined;
    const many = layer.settings !== 1;
    return `Its ${layer.settings} store setting${many ? 's are' : ' is'} saved beside it, in ${layer.datapackName}.`;
}

/** The save's whole sentence: its parts that have something to say, in order. */
export const saveSentence = (...parts: Array<string | undefined>): string => parts.filter(Boolean).join(' ');

/** "Products" → "Product", "Categories" → "Category": a data type's name for one of it. */
function oneOf(label: string): string {
    if (label.endsWith('ies')) return `${label.slice(0, -3)}y`;
    return label.endsWith('s') ? label.slice(0, -1) : label;
}

/**
 * What a saved pack holds, one line per data type with its count first, in the pick list's order
 * (owner, 2026-11-05: the counts are what an SC wants to know, and they are new to them).
 */
export function heldLines(counts: Readonly<Record<string, number>>): string[] {
    return inPickOrder(Object.keys(counts)).map((kind) => {
        const count = counts[kind] ?? 0;
        const label = dataTypeLabel(kind);
        return `${count} ${count === 1 ? oneOf(label) : label}`;
    });
}

/** The result window's lines, in the sentence's order; each only when it has something to say. */
export function resultLines(
    leftOut: readonly LeftOut[],
    layer: { datapackName: string; settings: number } | undefined,
    unnamed: readonly string[],
): string[] {
    return [leftOutCountLine(leftOut), layerLine(layer), unnamedLine(unnamed)].filter((line): line is string => Boolean(line));
}
