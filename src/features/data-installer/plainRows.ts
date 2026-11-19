/**
 * The rows an install did not add, or an uninstall could not delete, in plain words, one line per
 * reason (release walk F221, owner 2026-11-17): "3 products weren't added: Commerce didn't accept
 * their SKUs." Rows are named as the Commerce Admin names them ("Product p2", "Wall (under Racks)"),
 * never by the engine's kind key and path.
 *
 * Every line goes through `plainFailure`, the one door to a datapack screen. The rows' raw reasons
 * stay on the job record (`skipped`) and in the note, for Debug Logs and the agent tools.
 *
 * Pure: the webview bundles draw from it too.
 *
 * @module features/data-installer/plainRows
 */

import { knownMessage, nounOf, plainFailure, sentence, statusMeaning } from './plainFailure';
import { type PlainText } from '@/core/utils/plainText';
import type { SkipCause, SkippedRowRecord } from './types';

/** What happened to the rows: not added by an install, or not deleted by an uninstall. */
type RowVerb = 'added' | 'removed';

/** A category's key is its path: "Default Category/Racks/Wall". Its name, and its parent's. */
function categoryParts(key: string): { name: string; parent?: string } {
    const parts = key.split('/').filter(Boolean);
    const name = parts[parts.length - 1] ?? key;
    return parts.length > 1 ? { name, parent: parts[parts.length - 2] } : { name };
}

/** The parent of a category is named in its reason, so the row's name leaves it out. */
const namesParent = (row: SkippedRowRecord): boolean =>
    row.kind === 'categories' && row.cause?.by === 'needs' && row.cause.kind === 'categories';

/** One row as the Admin names it: "Product p2", "Wall (under Racks)". */
function rowName(row: SkippedRowRecord): string {
    if (row.kind !== 'categories')
        return sentence(`${nounOf(row.kind, 1)} ${row.key}`).slice(0, -1);
    const { name, parent } = categoryParts(row.key);
    return parent && !namesParent(row) ? `${name} (under ${parent})` : name;
}

/** Why it needed a row that is not there: one this install skipped, or one Commerce lacks. */
function neededWhy(
    cause: Extract<SkipCause, { kind: string }>,
    kind: string,
    one: boolean,
): string {
    if (cause.by === 'needs' && kind === 'categories' && cause.kind === 'categories') {
        return `${one ? 'its' : 'their'} parent category, ${cause.name}, wasn't added`;
    }
    const has = cause.by === 'needs' ? "which wasn't added" : "which Commerce doesn't have";
    return `${one ? 'it needs' : 'they need'} the ${nounOf(cause.kind, 1)} ${cause.name}, ${has}`;
}

/** Why `count` rows of `kind` were not added or deleted, lower case, from what the engine recorded. */
function whyOf(row: SkippedRowRecord, count: number, verb: RowVerb): string {
    const { cause } = row;
    if (cause && cause.by !== 'commerce') return neededWhy(cause, row.kind, count === 1);
    const message = cause?.message ?? row.reason;
    return (
        knownMessage(message, row.kind, count) ??
        statusMeaning(cause?.status, count, verb === 'removed')
    );
}

/** How many lines the rows take at most: the window stays short (dialog design rules). */
const MOST_LINES = 6;

function groupLine(group: readonly SkippedRowRecord[], verb: RowVerb): string {
    const [first] = group;
    const why = whyOf(first, group.length, verb);
    if (group.length === 1) return `${rowName(first)} wasn't ${verb}: ${why}.`;
    return `${group.length.toLocaleString('en-US')} ${nounOf(first.kind, group.length)} weren't ${verb}: ${why}.`;
}

/**
 * What an install did not add (or an uninstall could not delete), one line per reason: "3 products
 * weren't added: Commerce didn't accept their SKUs."; one row is named, "Wall wasn't added: its parent
 * category, Racks, wasn't added." The largest groups come first; past {@link MOST_LINES}, the rest are
 * counted.
 *
 * @param rows - the rows, from the job's record
 * @param verb - added for an install's skipped rows, removed for an uninstall's refused ones
 */
export function plainSkipped(
    rows: readonly SkippedRowRecord[] | undefined,
    verb: RowVerb = 'added',
): PlainText[] {
    const groups = new Map<string, SkippedRowRecord[]>();
    for (const row of rows ?? []) {
        const id = `${row.kind}\n${whyOf(row, 2, verb)}`;
        groups.set(id, [...(groups.get(id) ?? []), row]);
    }
    const sorted = [...groups.values()].sort((a, b) => b.length - a.length);
    const shown = sorted.length > MOST_LINES ? sorted.slice(0, MOST_LINES - 1) : sorted;
    const lines = shown.map((group) => plainFailure(groupLine(group, verb)));
    const rest = sorted.slice(shown.length).reduce((sum, group) => sum + group.length, 0);
    if (rest === 0) return lines;
    return [...lines, plainFailure(`${rest.toLocaleString('en-US')} more weren't ${verb}.`)];
}

/** The line on a data type's row when some of its rows were not added: "3 products weren't added." */
export function plainRowNote(kind: string, count: number): PlainText {
    const verb = count === 1 ? "wasn't" : "weren't";
    return plainFailure(`${count.toLocaleString('en-US')} ${nounOf(kind, count)} ${verb} added.`);
}

/**
 * What Commerce would not delete, one line per reason, then what tries again: "2 categories weren't
 * removed: Commerce wouldn't delete them." and "Uninstalling the datapack again tries again."
 *
 * @param again - what tries it again: installing the datapack again, or uninstalling it again
 */
export function plainRefusedRemovals(
    refused: readonly SkippedRowRecord[],
    again: 'Installing' | 'Uninstalling',
): PlainText[] {
    if (refused.length === 0) return [];
    return [
        ...plainSkipped(refused, 'removed'),
        plainFailure(`${again} the datapack again tries again.`),
    ];
}
