/**
 * The small pieces every ACO row is made with, each the Data Installer service's own rule
 * (`.rptc/research/datapack-engine/aco-export-spec.md` §3).
 *
 * @module features/data-installer/services/acoExport/acoRowParts
 */

import type { CommerceCustomAttribute } from '@/types/acoPack';

/**
 * A row's custom attributes by code, every value as a string (an array joins with commas, as
 * `category_ids` does). An attribute with no value is left out
 * (`acoProductsExportTransform.js` L64-87).
 */
export function customAttributeMap(row: {
    custom_attributes?: CommerceCustomAttribute[];
}): Record<string, string> {
    const map: Record<string, string> = {};
    for (const attribute of row.custom_attributes ?? []) {
        if (attribute.value !== null && attribute.value !== undefined)
            map[attribute.attribute_code] = String(attribute.value);
    }
    return map;
}

/**
 * A url path as ACO spells a slug: `men/tops-tees`. Lowercased, `_` to `-`, everything outside
 * `[a-z0-9-/]` dropped, slashes collapsed and trimmed; undefined when nothing usable is left
 * (`acoCategoriesExportTransform.js` L11-26).
 */
export function slugOfPath(raw: string | undefined): string | undefined {
    const slug = (raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/_/gu, '-')
        .replace(/[^a-z0-9\-/]/gu, '')
        .replace(/\/+/gu, '/')
        .replace(/^\/+|\/+$/gu, '');
    return /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u.test(slug) ? slug : undefined;
}

/**
 * A label as one slug segment: lowercased, `_` and every other run of characters to one `-`,
 * hyphens trimmed. A variant's reference id and a bundle group's name are made this way
 * (`acoConfigurableProductsExport.js` L20-28, `acoBundleProductsExport.js` L16-24: the same rule).
 */
export function slugOfLabel(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/_/gu, '-')
        .replace(/[^a-z0-9-]+/gu, '-')
        .replace(/-+/gu, '-')
        .replace(/^-|-$/gu, '');
}

/** Commerce's on: `true`, `1` or `"1"` (`acoBundleProductsExport.js` L39-41). */
export function isOn(value: unknown): boolean {
    return value === true || value === 1 || value === '1';
}
