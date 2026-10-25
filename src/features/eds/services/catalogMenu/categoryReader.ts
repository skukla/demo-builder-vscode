/**
 * Category reader — every Commerce category of the project's store view (EDS-24, EDS-61).
 *
 * Every category with a url path gets a page, not only the ones shown in the menu (owner
 * decision D6, 2026-10-22), so this asks for all of them with the query the overlay's own
 * lookup sends (`accs-discovery-service/actions/lib/category-page.js`), plus `roles` so the
 * step can tell whether any category is in the menu at all. Measured 2026-10-22 against
 * the Justrite store view with guest headers: 15 categories, two roots with an empty
 * `urlPath`, every one with `roles` (`active`, `show_in_menu`).
 *
 * Pure: the transport is handed in. The headers and endpoint are the caller's, built from
 * what `run_commerce_query` already assembles.
 *
 * @module features/eds/services/catalogMenu/categoryReader
 */

import type { CatalogCategory } from './categoryPagePlan';

/** Runs one Catalog Service query and answers its `data`. Throws on a failed request. */
export type CatalogQuery = (query: string, variables?: Record<string, unknown>) => Promise<unknown>;

/** Every category of the store view. `ids: []` lists them all; nothing from a request reaches it. */
export const CATEGORIES_QUERY = 'query CatalogCategories { categories(ids: []) { id name level parentId urlPath roles } }';

const MENU_ROLE = 'show_in_menu';

interface RawCategory {
    id?: unknown;
    name?: unknown;
    urlPath?: unknown;
    level?: unknown;
    parentId?: unknown;
    roles?: unknown;
}

function categoriesOf(data: unknown): RawCategory[] {
    const list = (data as { categories?: unknown } | null | undefined)?.categories;
    if (!Array.isArray(list)) {
        throw new Error('Catalog Service answered without a category list');
    }
    return list as RawCategory[];
}

function toCategory(raw: RawCategory): CatalogCategory | null {
    const id = typeof raw.id === 'number' ? String(raw.id) : raw.id;
    if (typeof id !== 'string' || !id || typeof raw.name !== 'string' || !raw.name) return null;
    return {
        id,
        name: raw.name,
        urlPath: typeof raw.urlPath === 'string' ? raw.urlPath : '',
        ...(typeof raw.level === 'number' ? { level: raw.level } : {}),
        ...(typeof raw.parentId === 'string' ? { parentId: raw.parentId } : {}),
        // Roles that did not come back say nothing: the category stays in the menu.
        inMenu: !Array.isArray(raw.roles) || raw.roles.includes(MENU_ROLE),
    };
}

/**
 * Every category of the store the headers select.
 *
 * @param query - the Catalog Service transport
 * @returns the categories, possibly empty
 */
export async function readStoreCategories(query: CatalogQuery): Promise<CatalogCategory[]> {
    return categoriesOf(await query(CATEGORIES_QUERY))
        .map(toCategory)
        .filter((c): c is CatalogCategory => c !== null);
}
