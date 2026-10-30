/**
 * The sentence a save ends on (step 05, step 07, step 14): where it saved, what it left out of the
 * store because nothing picked it, and which ids it kept because the store could not name them.
 *
 * @module features/data-installer/services/demoBuilderEngine/saveOutcome
 */

import { KIND_NOUNS, type LeftOut } from '../../pickableKinds';
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
    return `Left out, because nothing picked them: ${any.map(counted).join(', ')}.`;
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

/** The save's whole sentence: its parts that have something to say, in order. */
export const saveSentence = (...parts: Array<string | undefined>): string => parts.filter(Boolean).join(' ');
