/**
 * Category reader — the Commerce categories that go in the menu (EDS-24).
 *
 * One read, shared with the storefront: {@link CATEGORIES_QUERY} is the `catalog-menu`
 * block's own constant (`skukla/demo-builder-block-library`,
 * `blocks/catalog-menu/catalog-menu-core.js`, copied 2026-10-04), so the pages Demo
 * Builder writes and the menu the block draws come from the same question.
 *
 * ## Two ways in, because one is unproven
 *
 * The Catalog Service reference documents `ids` as optional on `categories`, but every
 * example passes one (`.rptc/plans/category-pages/overview.md`, step 4 — not yet run
 * live). So: the tree read first; when it comes back empty and the store's root category
 * is known, a walk down from that root with `subtree`, keeping only the categories marked
 * "Include in Menu". The `subtree` numbers are NOT verified against a live store either —
 * the first real run (plan step 5) settles both.
 *
 * Pure: the transport is handed in. The headers and endpoint are the caller's, built from
 * what `run_commerce_query` already assembles.
 *
 * @module features/eds/services/catalogMenu/categoryReader
 */

import type { CatalogCategory } from './categoryPages';
import type { CommerceStoreStructure } from '@/types/commerceStore';

/** Runs one Catalog Service query and answers its `data`. Throws on a failed request. */
export type CatalogQuery = (query: string, variables?: Record<string, unknown>) => Promise<unknown>;

/** The block's query, word for word. */
export const CATEGORIES_QUERY = `query CatalogMenuCategories($roles: [String!]) {
  categories(roles: $roles) { id name level parentId position urlPath children }
}`;

const MENU_ROLE = 'show_in_menu';

/**
 * The walk from the root. `roles` is asked for and filtered here rather than passed as
 * an argument, so a root category without "Include in Menu" cannot hide its children.
 * The `subtree` object is written inline so the query does not depend on the name of its
 * input type. Unverified numbers: the root is level 1, so its children start at 2; three
 * levels down.
 */
const SUBTREE_QUERY = `query CatalogMenuSubtree($ids: [String!]) {
  categories(ids: $ids, subtree: { startLevel: 2, depth: 3 }) { id name level parentId urlPath roles }
}`;

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
    };
}

function mapAll(raws: RawCategory[]): CatalogCategory[] {
    return raws.map(toCategory).filter((c): c is CatalogCategory => c !== null);
}

function isInMenu(raw: RawCategory): boolean {
    return Array.isArray(raw.roles) && raw.roles.includes(MENU_ROLE);
}

/**
 * The categories marked "Include in Menu" for the store the headers select.
 *
 * @param query - the Catalog Service transport
 * @param rootCategoryId - the store group's root category, when known
 * @returns the categories, possibly empty
 */
export async function readMenuCategories(
    query: CatalogQuery,
    rootCategoryId: string | undefined,
): Promise<CatalogCategory[]> {
    const tree = mapAll(categoriesOf(await query(CATEGORIES_QUERY, { roles: [MENU_ROLE] })));
    if (tree.length > 0 || !rootCategoryId) return tree;

    const walked = categoriesOf(
        await query(SUBTREE_QUERY, { ids: [rootCategoryId] }),
    );
    return mapAll(walked.filter((raw) => isInMenu(raw) && raw.id !== rootCategoryId));
}

/**
 * The root category of the project's store group, from the discovered store structure.
 *
 * @param structure - `project.commerceStoreStructure`, absent until discovery has run
 * @param storeCode - the store group code the project's headers send
 * @returns the id as Catalog Service spells it (a string), or undefined
 */
export function rootCategoryIdFor(
    structure: CommerceStoreStructure | undefined,
    storeCode: string | undefined,
): string | undefined {
    if (!structure || !storeCode) return undefined;
    const group = structure.storeGroups.find((g) => g.code === storeCode);
    return group ? String(group.root_category_id) : undefined;
}
