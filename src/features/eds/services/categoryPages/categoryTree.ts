/**
 * The store view's category tree, read from Commerce.
 *
 * Two reads, each from the service that answers it (EDS-24):
 *
 * - **The root** is a Commerce Core answer: `storeConfig.root_category_uid` for
 *   the store view the request's `Store` header names. Catalog Service has no
 *   "which root is mine" question. A caller that already knows the root (a
 *   project with no Core endpoint) names it and this read is skipped.
 * - **The tree** is Catalog Service `categories(ids:)`, walked one LEVEL per
 *   request: each answer's `children` (id strings) become the next request's ids.
 *   Every category comes back with its `roles` — `show_in_menu` is Commerce's
 *   "Include in Menu" switch, `active` its "Enable Category" — and its `urlPath`,
 *   which is exactly what the storefront's product-list-page block filters on.
 *
 * Shapes: Adobe's documented example response for `categories`
 * (developer.adobe.com/commerce/services/graphql/catalog-service/categories/,
 * read 2026-10-01). Not yet checked against a live store — see the test file.
 *
 * `vscode`-free; the query runner arrives as a parameter (ADR-015).
 *
 * @module features/eds/services/categoryPages/categoryTree
 */

/** One category as Catalog Service answers it, the fields a page needs. */
export interface CommerceCategory {
    id: string;
    name: string;
    /** No leading or trailing slash: `men/tops-men`. Empty on a root. */
    urlPath: string;
    level: number;
    parentId: string;
    /** `active`, `show_in_menu`, … */
    roles: string[];
    /** Child ids, as strings. */
    children: string[];
}

/**
 * Run one read-only GraphQL query and answer its `data`, or throw with the
 * reason. Which headers, which URL: the caller's business (the handler binds it
 * to `postCommerceGraphQl`, so the store scope is the storefront's own).
 */
export type CategoryQueryRunner = (
    query: string,
    variables: Record<string, unknown>,
    endpoint: 'commerceGraphQl' | 'catalogService',
) => Promise<unknown>;

export interface CategoryTree {
    rootId: string;
    /** The root and every category under it, each once, in walk order. */
    categories: CommerceCategory[];
    /** True when the walk stopped at the ceiling with categories left unread. */
    truncated: boolean;
}

/**
 * The most categories one run reads. A demo catalog has tens; a real one can
 * have thousands, and one page per category at that size is a migration, not a
 * demo step. Stopping is declared (`truncated`), never silent.
 */
const MAX_CATEGORIES = 500;

/** Deepest level walked below the root. Commerce menus rarely go past four. */
const MAX_DEPTH = 10;

/** Ids per Catalog Service request. */
const IDS_PER_REQUEST = 50;

const ROOT_QUERY = '{ storeConfig { root_category_uid } }';

const CATEGORIES_QUERY =
    'query CategoryLevel($ids: [String!]) { categories(ids: $ids) { id name urlPath level parentId roles children } }';

const NUMERIC_ID = /^\d+$/;

/** `root_category_uid` is the base64 of the numeric id ("Mg==" is 2). */
async function storeRootId(run: CategoryQueryRunner): Promise<string> {
    const data = (await run(ROOT_QUERY, {}, 'commerceGraphQl')) as
        | { storeConfig?: { root_category_uid?: string | null } }
        | undefined;
    const uid = data?.storeConfig?.root_category_uid ?? '';
    const id = uid ? Buffer.from(uid, 'base64').toString('utf8') : '';
    if (!NUMERIC_ID.test(id)) {
        throw new Error(
            `Commerce did not say which root category this store view uses (storeConfig answered "${uid}"). ` +
                'Name the root category id instead.',
        );
    }
    return id;
}

/** Read one row as a {@link CommerceCategory}, tolerating absent optional fields. */
function toCategory(row: Record<string, unknown>): CommerceCategory {
    const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
    return {
        id: String(row.id),
        name: String(row.name ?? ''),
        // The SaaS schema reference spells it "/electronics/laptops"; the Catalog
        // Service example answers "men/tops-men". The block filters on the bare form.
        urlPath: String(row.urlPath ?? '').replace(/^\/+|\/+$/g, ''),
        level: Number(row.level ?? 0),
        parentId: String(row.parentId ?? ''),
        roles: strings(row.roles),
        children: strings(row.children),
    };
}

async function readLevel(run: CategoryQueryRunner, ids: string[]): Promise<CommerceCategory[]> {
    const rows: CommerceCategory[] = [];
    for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
        const data = (await run(CATEGORIES_QUERY, { ids: ids.slice(i, i + IDS_PER_REQUEST) }, 'catalogService')) as
            | { categories?: Array<Record<string, unknown>> | null }
            | undefined;
        rows.push(...(data?.categories ?? []).map(toCategory));
    }
    return rows;
}

/**
 * Read the category tree under the store view's root.
 *
 * @param run - answers one query's `data` (throws on a transport or GraphQL error)
 * @param options.rootCategoryId - start here instead of asking storeConfig
 * @param options.maxCategories - ceiling (default {@link MAX_CATEGORIES}); a test seam
 * @throws when the root cannot be found or is not in Catalog Service
 */
export async function readCategoryTree(
    run: CategoryQueryRunner,
    options: { rootCategoryId?: string; maxCategories?: number } = {},
): Promise<CategoryTree> {
    const limit = options.maxCategories ?? MAX_CATEGORIES;
    if (options.rootCategoryId !== undefined && !NUMERIC_ID.test(options.rootCategoryId)) {
        throw new Error(`The root category id must be numeric, e.g. "2" (got "${options.rootCategoryId}").`);
    }
    const rootId = options.rootCategoryId ?? (await storeRootId(run));

    const seen = new Set<string>();
    const categories: CommerceCategory[] = [];
    let level = [rootId];
    let truncated = false;
    for (let depth = 0; level.length > 0 && depth <= MAX_DEPTH; depth++) {
        const next: string[] = [];
        for (const category of await readLevel(run, level)) {
            if (seen.has(category.id)) continue;
            if (categories.length >= limit) {
                truncated = true;
                break;
            }
            seen.add(category.id);
            categories.push(category);
            next.push(...category.children.filter((id) => !seen.has(id)));
        }
        if (truncated) break;
        level = [...new Set(next)];
    }
    // Ran out of depth with children still unread: as declared as running out of room.
    if (level.length > 0) truncated = true;
    if (!seen.has(rootId)) {
        throw new Error(`Catalog Service has no category ${rootId} for this store view, so there is no tree to read.`);
    }
    return { rootId, categories, truncated };
}
