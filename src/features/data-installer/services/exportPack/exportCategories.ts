/**
 * A pack's categories from the paths an export's products name (`Default Category/Men/Tops/Jackets`),
 * or a base pack's own tree with the products' paths moved onto its root.
 *
 * The export's top segment is its store's root, which the pack replaces: with a base pack, the base
 * pack's root; without one, a root named after the pack. "Default Category" would name Commerce's
 * own root.
 *
 * Two categories can share a name ("Jackets" under Men and under Women), and a pack links products
 * to categories by url key alone, so each gets its own key: the name, then the name with its
 * top-level category (`jackets-men`), as the Data Installer's own Luma pack keys them. The converter
 * this was ported from gave both one key (2026-11-05).
 *
 * The row shape is the one `categoriesKind.ts` installs and every rebuilt pack holds: `path` is the
 * parent's name path from the root, `parent_id` its depth past the root.
 *
 * @module features/data-installer/services/exportPack/exportCategories
 */

import { slugOfLabel } from '../acoExport/acoRowParts';
import { urlKeyOf } from '../demoBuilderEngine/productLookups';

/** A category row as a pack holds it. */
export interface PackCategory {
    name: string;
    parent_id: number;
    path?: string;
    is_active: boolean;
    position?: number;
    include_in_menu: boolean;
    custom_attributes: Array<{ attribute_code: string; value: unknown }>;
}

/** The `categories` kind's rows: a root and the tree under it. */
export interface PackCategories {
    root_category: PackCategory;
    categories: Array<{ category: PackCategory }>;
}

/** Each category's full path (`Luma Catalog/Men/Tops/Jackets`) → its url key, the root's included. */
export function categoryUrlKeys(pack: PackCategories): Map<string, string> {
    const keys = new Map<string, string>();
    const root = urlKeyOf(pack.root_category);
    if (root) keys.set(pack.root_category.name, root);
    for (const { category } of pack.categories) {
        const key = urlKeyOf(category);
        if (key) keys.set(`${category.path}/${category.name}`, key);
    }
    return keys;
}

/** A product's paths, their top segment replaced by the pack's root. */
export function onRoot(paths: readonly string[], root: string): string[] {
    return paths.map((path) => [root, ...path.split('/').slice(1)].join('/'));
}

/** A key no other category has: the name's, then with its top-level category, then its whole path's. */
function freshKey(parts: readonly string[], taken: Set<string>): string {
    const name = parts[parts.length - 1];
    const candidates = [
        slugOfLabel(name),
        slugOfLabel(`${name} ${parts[1] ?? ''}`),
        slugOfLabel(parts.slice(1).join(' ')),
    ];
    const key =
        candidates.find((candidate) => candidate && !taken.has(candidate)) ??
        `${slugOfLabel(parts.join(' '))}-${taken.size}`;
    taken.add(key);
    return key;
}

/**
 * The tree the products' paths name, under a root of this name.
 *
 * @param paths - every product's category paths, already on the root (`onRoot`)
 */
export function categoriesFromPaths(paths: readonly string[], rootName: string): PackCategories {
    const rootKey = slugOfLabel(rootName);
    const taken = new Set([rootKey]);
    const seen = new Set<string>();
    const categories: Array<{ category: PackCategory }> = [];
    for (const path of paths) {
        const parts = path.split('/');
        for (let depth = 2; depth <= parts.length; depth += 1) {
            const full = parts.slice(0, depth).join('/');
            if (seen.has(full)) continue;
            seen.add(full);
            categories.push({
                category: {
                    name: parts[depth - 1],
                    parent_id: 3 + depth - 2,
                    path: parts.slice(0, depth - 1).join('/'),
                    is_active: true,
                    position: categories.length + 1,
                    include_in_menu: true,
                    custom_attributes: [
                        { attribute_code: 'is_anchor', value: '1' },
                        {
                            attribute_code: 'url_key',
                            value: freshKey(parts.slice(0, depth), taken),
                        },
                    ],
                },
            });
        }
    }
    categories.sort(
        (a, b) =>
            (a.category.path ?? '').split('/').length - (b.category.path ?? '').split('/').length,
    );
    return {
        root_category: {
            name: rootName,
            parent_id: 1,
            is_active: true,
            include_in_menu: false,
            custom_attributes: [
                { attribute_code: 'is_anchor', value: '1' },
                { attribute_code: 'url_key', value: rootKey },
            ],
        },
        categories,
    };
}
