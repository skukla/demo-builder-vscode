/**
 * A select or multi-select value from a product export, as the option the pack defines.
 *
 * An export writes a label as the Admin stores it, HTML codes and all ("LumaTech&trade;"), while a
 * pack's attribute can define the option without the mark ("LumaTech"). The install matches labels
 * exactly, so 86 Luma products were skipped, each "has no option LumaTech&trade;" (live,
 * 2026-11-06). A value that is an option as written is kept; one that names an option once its marks
 * are dropped becomes that option's label; anything else is kept, and the install names it.
 *
 * @module features/data-installer/services/exportPack/exportOptions
 */

import type { DatapackFile } from '../datapackZip';

/** The option labels of each select and multi-select attribute a pack defines, by code. */
export type OptionLabels = ReadonlyMap<string, readonly string[]>;

type BaseOption = { label?: unknown };
type BaseAttribute = {
    attribute?: { attribute_code?: unknown; frontend_input?: unknown; options?: BaseOption[] };
};

const CHOICE_INPUTS = new Set(['select', 'multiselect']);

/** The marks an export writes and a pack's option may leave out, as codes and as characters. */
const MARKS = /&(trade|reg|copy);|[™®©]/gu;

/** A label with its marks dropped, `&amp;` read as `&`, spaces closed up, in lower case. */
function bare(label: string): string {
    return label
        .replace(MARKS, '')
        .replace(/&amp;/gu, '&')
        .replace(/\s+/gu, ' ')
        .trim()
        .toLowerCase();
}

/** The option labels of a base pack's select and multi-select attributes. */
export function optionLabels(base: DatapackFile | undefined): OptionLabels {
    const rows = base?.items.find((item) => item.dataType === 'product_attributes')?.records;
    const attributes = Array.isArray(rows) ? (rows as BaseAttribute[]) : [];
    const labels = new Map<string, string[]>();
    for (const { attribute } of attributes) {
        if (typeof attribute?.attribute_code !== 'string') continue;
        if (!CHOICE_INPUTS.has(String(attribute.frontend_input))) continue;
        const named = (attribute.options ?? [])
            .map((o) => o.label)
            .filter((l): l is string => typeof l === 'string');
        labels.set(attribute.attribute_code, named);
    }
    return labels;
}

/** The option `label` names on the attribute `code`: itself when it is one, else the one it matches bare. */
export function asOption(options: OptionLabels, code: string, label: string): string {
    const labels = options.get(code);
    if (!labels || labels.includes(label)) return label;
    return labels.find((option) => bare(option) === bare(label)) ?? label;
}
