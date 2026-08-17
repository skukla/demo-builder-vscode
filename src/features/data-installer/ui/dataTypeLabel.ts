/**
 * Human names for the service's data-type codes.
 *
 * The service ships no display name. Both catalogue calls answer with a
 * `description` instead, and it is a sentence about the operation rather than a
 * label: `get-export-data-types` says "Export product attributes", and
 * `get-processor-order` says "Import attribute sets with loop processing and
 * group creation". One is mode-flavoured, the other leaks the processor's
 * internals, and neither belongs on a checkbox.
 *
 * So the label is DERIVED from the code. The alternative — a hand-written map
 * of the 21 current types — reads better for one or two awkward names and then
 * goes stale the moment the service adds a type, showing a raw code again in
 * the one case nobody is watching for. Derivation degrades gracefully instead.
 *
 * This is presentation only. The code stays the value sent.
 *
 * @module features/data-installer/ui/dataTypeLabel
 */

/**
 * Words mechanical casing gets wrong. `b2b` covers five of the 21 codes, so it
 * is the rule rather than the exception it looks like.
 */
const ACRONYMS: Record<string, string> = {
    b2b: 'B2B',
};

/**
 * A data type's code as a human name — `attribute_sets` → "Attribute sets".
 *
 * Sentence case, matching the labels around it ("Target website", "Data
 * types"), not title case.
 */
export function dataTypeLabel(code: string): string {
    const words = code.split('_').filter(Boolean);
    if (words.length === 0) {
        return code;
    }
    return words.map(renderWord).join(' ');
}

/** Acronyms stay upper wherever they fall; otherwise only the first word leads. */
function renderWord(word: string, index: number): string {
    const acronym = ACRONYMS[word.toLowerCase()];
    if (acronym) {
        return acronym;
    }
    return index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}
