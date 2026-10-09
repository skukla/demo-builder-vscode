/**
 * Write JSON back in the layout the file already had.
 *
 * Files the extension edits in a storefront (`component-definition.json` and
 * its two siblings) are also edited by people. Re-serialising them with a fixed
 * two-space indent turns a one-entry change into a whole-file diff for anyone
 * who uses four spaces or tabs.
 *
 * @module core/utils/jsonFormatting
 */

const DEFAULT_INDENT = '  ';

/** The first indented line of a JSON document is always one level deep. */
const FIRST_INDENT = /\n([ \t]+)\S/;

/**
 * The indentation `text` uses: the whitespace in front of its first indented
 * line. Two spaces when it has none (a one-line or empty document).
 *
 * @param text - the file's current content
 * @returns the indent string, e.g. `'    '` or `'\t'`
 */
export function detectJsonIndent(text: string): string {
    const match = FIRST_INDENT.exec(text);
    return match ? match[1] : DEFAULT_INDENT;
}

/**
 * Serialise `value` with the indentation `original` used, and end with a
 * newline only when `original` did.
 *
 * @param original - the file's content before the edit
 * @param value - the edited document
 * @returns the text to write back
 */
export function stringifyJsonLike(original: string, value: unknown): string {
    const text = JSON.stringify(value, null, detectJsonIndent(original));
    return original.endsWith('\n') ? `${text}\n` : text;
}
