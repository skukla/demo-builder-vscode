/**
 * A swatch attribute's type and colours, carried from the installed version into a save (F140).
 *
 * Commerce's REST API never answers them: a visual swatch reads back as a `select`, and each
 * option as its label and id, with no colour (measured on the test store 2026-11-16: an attribute
 * made with `frontend_input: swatch_visual` read back as `select`, while GraphQL's
 * `customAttributeMetadataV2` said `swatch_input_type: VISUAL`). So a save made from the store
 * alone turned a pack's swatch into a plain dropdown and lost every colour. The pack the SC
 * installed is the only place they exist, so a save keeps them from there: the type, and each
 * option's colour by its label. An option the SC added in the Admin has no colour to keep.
 *
 * Fingerprints compare the store with itself (`packForm.ts`), so `storeFormOfAttribute` takes a
 * carried row back to what the store answers before it is hashed as a copy.
 *
 * @module features/data-installer/services/demoBuilderEngine/swatchCarry
 */

type Row = Record<string, unknown>;

/** Inputs whose options carry a swatch in their `value`. */
export const SWATCH_INPUTS: ReadonlySet<string> = new Set(['swatch_visual', 'swatch_text']);

const attributeOf = (row: unknown): Row =>
    ((row as { attribute?: Row } | null)?.attribute ?? {}) as Row;
const optionsOf = (attribute: Row): Row[] =>
    Array.isArray(attribute.options) ? (attribute.options as Row[]) : [];
const labelOf = (option: Row): string =>
    String(option.label ?? '')
        .trim()
        .toLowerCase();

/**
 * The captured row, with the installed version's swatch type and colours when that version made
 * the attribute a swatch; else the captured row as it is.
 *
 * @param captured - the attribute as the store answers, in pack form
 * @param installed - the installed version's row for the same attribute code, if it has one
 */
export function withPackSwatch(
    captured: { attribute: Row },
    installed: unknown,
): { attribute: Row } {
    const pack = attributeOf(installed);
    const input = String(pack.frontend_input ?? '');
    if (!SWATCH_INPUTS.has(input)) return captured;
    const colours = new Map(optionsOf(pack).map((o) => [labelOf(o), o.value]));
    const options = optionsOf(captured.attribute).map((o) => {
        const colour = colours.get(labelOf(o));
        return colour === undefined ? o : { ...o, value: colour };
    });
    return {
        attribute: {
            ...captured.attribute,
            frontend_input: input,
            ...(captured.attribute.options ? { options } : {}),
        },
    };
}

/**
 * A row as the store answers it: a swatch as a `select`, each option's value its label
 * (`attributePackForm`). The inverse of `withPackSwatch` for a row it carried.
 */
export function storeFormOfAttribute(row: unknown): unknown {
    const attribute = attributeOf(row);
    if (!SWATCH_INPUTS.has(String(attribute.frontend_input ?? ''))) return row;
    return {
        attribute: {
            ...attribute,
            frontend_input: 'select',
            ...(attribute.options
                ? { options: optionsOf(attribute).map((o) => ({ label: o.label, value: o.label })) }
                : {}),
        },
    };
}
