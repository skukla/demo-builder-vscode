/**
 * The store's product attributes, for naming a configurable's choices: id to code, the admin
 * label, and each super attribute's options by value. The service's `AcoProductAttributesCatalog`
 * (`acoProductAttributesCatalog.js`), as plain data and functions over it.
 *
 * @module features/data-installer/services/acoExport/acoAttributeCatalog
 */

import type { CommerceAttributeOption, CommerceAttributeRow } from '@/types/acoPack';

/** The attributes by code and id, and which codes have their options from the options read. */
export interface AttributeCatalog {
    byCode: Map<string, CommerceAttributeRow>;
    idToCode: Map<string, string>;
    /** Codes whose options came from `GET products/attributes/{code}/options`. */
    optionsRead: Set<string>;
}

/** The catalog of every attribute the store listed (L46-55). */
export function attributeCatalog(rows: readonly CommerceAttributeRow[]): AttributeCatalog {
    const catalog: AttributeCatalog = {
        byCode: new Map(),
        idToCode: new Map(),
        optionsRead: new Set(),
    };
    for (const row of rows) {
        catalog.byCode.set(row.attribute_code, row);
        if (row.attribute_id !== undefined)
            catalog.idToCode.set(String(row.attribute_id), row.attribute_code);
    }
    return catalog;
}

/** An option a shopper can pick: Commerce lists an empty admin one first (`acoProductAttributeOptionsEnrich.js` L21-30). */
const selectable = (o: CommerceAttributeOption) =>
    (o.value ?? '').trim() !== '' && (o.label ?? '').trim() !== '';

/**
 * Put the options read for this code on the catalog, in place of any it had. A code the store's
 * list did not carry is added with no id, as the service registers a stub (L198-247).
 */
export function withOptions(
    catalog: AttributeCatalog,
    code: string,
    options: readonly CommerceAttributeOption[],
): void {
    const known = catalog.byCode.get(code) ?? { attribute_code: code };
    catalog.byCode.set(code, { ...known, options: options.filter(selectable) });
    catalog.optionsRead.add(code);
}

/**
 * An option value's label: by value, else a label equal to it, else the value itself
 * (`resolveOptionLabel`, L278-296). Empty for no value.
 */
export function optionLabel(catalog: AttributeCatalog, code: string, raw: unknown): string {
    if (raw === undefined || raw === null || raw === '') return '';
    const value = String(raw).trim();
    const options = catalog.byCode.get(code)?.options;
    if (!options) return value;
    const byValue = options.find((o) => String(o.value) === value);
    if (byValue?.label !== undefined) return byValue.label.trim();
    const byLabel = options.find((o) => String(o.label).trim() === value);
    return byLabel?.label !== undefined ? byLabel.label.trim() : value;
}

/** The option row for a configurable value: by value, else by label, case-blind (L303-319). */
export function optionFor(
    catalog: AttributeCatalog,
    code: string,
    valueIndex: unknown,
    label: string,
): CommerceAttributeOption | undefined {
    const options = catalog.byCode.get(code)?.options;
    if (!options) return undefined;
    const wanted = String(valueIndex);
    const hint = label.trim().toLowerCase();
    return (
        options.find((o) => String(o.value) === wanted) ??
        (hint ? options.find((o) => String(o.label).trim().toLowerCase() === hint) : undefined)
    );
}
