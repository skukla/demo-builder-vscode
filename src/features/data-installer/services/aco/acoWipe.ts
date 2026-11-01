/**
 * Clear an ACO instance's demo data (PL-60, owner 2026-10-31: "clear demo data is needed"): remove
 * what the project's catalog view shows that no installed pack holds, the ACO half of Clear demo
 * data. Research and the reasons: `.rptc/research/aco-support/clear-demo-data.md`.
 *
 * ACO's ingestion API deletes by key but cannot list, so the keys come from the STOREFRONT GraphQL
 * the project's storefront itself uses, with the storefront's own headers (`acoHeaders`) and no
 * token: `productSearch` page by page for SKUs, each configurable's `variants` (search lists the
 * parent, never its variants), and `categoryTree` for category slugs. The limit, said to the SC
 * every time: only what the project's catalog view shows can be found.
 *
 * Measured against a real ACO sandbox, read-only, 2026-10-31 (`.rptc/research/aco-support/audit-2026-10-31.md`,
 * "What a live read settled"): this exact search answers without a token or `AC-Environment-Id`;
 * `categorySearch` does not exist (it is `categoryTree`); variants are reached only through their
 * parent's `variants`; `"*"` answers an empty list with no error, so it must never be the phrase;
 * a price book the view does not allow is an error. A search that fails or answers with errors
 * refuses the clear: "could not list" must never read as "nothing to clear".
 *
 * Two steps, as Commerce's clear: `planAcoWipe` reads and names what would go, under a token; the
 * clearing (`runAcoWipe`) deletes only that plan's keys, through the ingestion client.
 *
 * @module features/data-installer/services/aco/acoWipe
 */

import * as crypto from 'crypto';
import type { InstallRecord } from '../demoBuilderEngine/installRecord';
import type { AcoClient } from './acoClient';
import { sameInstance } from './acoJobs';
import { acoKind } from './acoKinds';
import { chunks, deleteBatch } from './acoPackInstall';
import { acoGraphqlUrl } from '@/features/components/services/acoSettings';
import { acoHeaders } from '@/features/eds/services/acoStorefrontConfig';
import type { AcoStorefrontSettings } from '@/types/aco';
import type { AcoNamed, AcoWipePreview } from '@/types/demoDataWipe';

/** The page size `productSearch` takes at most (the ingestion script's). */
const PAGE_SIZE = 200;

/** How many names a preview shows of each kind; the count says the rest. */
const NAMES_SHOWN = 5;

/** Said on every preview: the one limit a clear through the storefront search has. */
// Measured 2026-10-31: the price book filters nothing (an unknown one lists everything), and
// variants are reached through their parents, so the one limit left is the view itself.
export const ACO_WIPE_LIMIT = 'Only what this catalog view shows can be found: a product in another view stays.';

/** Why a search could not be used. */
export class AcoSearchError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AcoSearchError';
    }
}

/** A plan: the preview and the keys it names. */
export interface AcoWipePlan {
    preview: AcoWipePreview;
    skus: string[];
    slugs: string[];
    settings: AcoStorefrontSettings;
}

/** The storefront search, handed in so a test answers it. */
export interface AcoSearch {
    /** Every SKU the view shows, every page, with each configurable's variants. */
    productSkus(): Promise<string[]>;
    /** Every category slug, or undefined when the search does not answer categories. */
    categorySlugs(): Promise<string[] | undefined>;
}

interface GraphqlAnswer<T> {
    data?: T;
    errors?: Array<{ message?: string }>;
}

async function ask<T>(doFetch: typeof fetch, settings: AcoStorefrontSettings, query: string, variables?: Record<string, unknown>): Promise<GraphqlAnswer<T>> {
    const response = await doFetch(acoGraphqlUrl(settings), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...acoHeaders(settings).cs },
        body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
    });
    if (!response.ok) throw new AcoSearchError(`ACO's catalog search answered ${response.status}.`);
    return (await response.json()) as GraphqlAnswer<T>;
}

// A single space lists every product. "*" answers an EMPTY list with no error (measured), so a
// clear using it would read a full catalog as empty.
const PRODUCTS_QUERY = `query ProductSearch($page: Int!, $pageSize: Int!) {
  productSearch(phrase: " ", current_page: $page, page_size: $pageSize) {
    page_info { current_page total_pages }
    items { productView { sku __typename } }
  }
}`;

/** `variants` takes 100 a page and refuses 200 ("Page size exceeds the maximum allowed"), measured. */
const VARIANT_PAGE_SIZE = 100;

const VARIANTS_QUERY = `query Variants($sku: String!, $cursor: String) {
  variants(sku: $sku, pageSize: ${VARIANT_PAGE_SIZE}, cursor: $cursor) { cursor variants { product { sku } } }
}`;

const CATEGORIES_QUERY = 'query { categoryTree { slug } }';

/** A configurable (or bundle) product: search lists it, and its variants only through it. */
const PARENT_TYPE = 'ComplexProductView';

/** How many pages of one parent's variants are read at most; a cursor that never ends stops here. */
const VARIANT_PAGES_MAX = 50;

interface ProductPage {
    productSearch?: { page_info?: { total_pages?: number }; items?: Array<{ productView?: { sku?: string; __typename?: string } }> };
}

interface VariantPage {
    variants?: { cursor?: string | null; variants?: Array<{ product?: { sku?: string } }> };
}

/** The answer's data, or the refusal that stops a clear. */
function dataOf<T>(answer: GraphqlAnswer<T>, what: string): T {
    if (answer.errors?.length) throw new AcoSearchError(`ACO's catalog search refused: ${answer.errors[0]?.message ?? 'no reason given'}`);
    if (!answer.data) throw new AcoSearchError(`ACO's catalog search answered without ${what}.`);
    return answer.data;
}

/** Every product the view lists, and which of them are parents with variants. */
async function listedProducts(doFetch: typeof fetch, settings: AcoStorefrontSettings): Promise<{ skus: string[]; parents: string[] }> {
    const skus: string[] = [];
    const parents: string[] = [];
    for (let page = 1, pages = 1; page <= pages; page += 1) {
        const found = dataOf(await ask<ProductPage>(doFetch, settings, PRODUCTS_QUERY, { page, pageSize: PAGE_SIZE }), 'a product list').productSearch;
        if (!found) throw new AcoSearchError('ACO\'s catalog search answered without a product list.');
        for (const { productView: view } of found.items ?? []) {
            if (!view?.sku) continue;
            skus.push(view.sku);
            if (view.__typename === PARENT_TYPE) parents.push(view.sku);
        }
        pages = found.page_info?.total_pages ?? page;
    }
    return { skus, parents };
}

/** One parent's variants, every page. */
async function variantsOf(doFetch: typeof fetch, settings: AcoStorefrontSettings, parent: string): Promise<string[]> {
    const skus: string[] = [];
    let cursor: string | null | undefined = null;
    for (let page = 0; page < VARIANT_PAGES_MAX; page += 1) {
        const found: VariantPage['variants'] = dataOf(await ask<VariantPage>(doFetch, settings, VARIANTS_QUERY, { sku: parent, cursor }), 'variants').variants;
        for (const variant of found?.variants ?? []) if (variant.product?.sku) skus.push(variant.product.sku);
        cursor = found?.cursor;
        if (!cursor) break;
    }
    return skus;
}

/** The search over the project's view. */
export function createAcoSearch(settings: AcoStorefrontSettings, doFetch: typeof fetch = fetch): AcoSearch {
    return {
        async productSkus() {
            const { skus, parents } = await listedProducts(doFetch, settings);
            for (const parent of parents) skus.push(...(await variantsOf(doFetch, settings, parent)));
            return skus;
        },
        async categorySlugs() {
            try {
                const answer = await ask<{ categoryTree?: Array<{ slug?: string }> }>(doFetch, settings, CATEGORIES_QUERY);
                if (answer.errors?.length || !answer.data?.categoryTree) return undefined;
                return answer.data.categoryTree.map((c) => c.slug).filter((slug): slug is string => Boolean(slug));
            } catch {
                return undefined;
            }
        },
    };
}

/** The keys installed packs on this instance hold, by kind: their removal is theirs to do. */
function installedKeys(records: readonly InstallRecord[], settings: AcoStorefrontSettings, field: 'sku' | 'slug', kinds: readonly string[]): Set<string> {
    const held = new Set<string>();
    for (const record of records) {
        if (!record.aco || !sameInstance(record.aco, settings)) continue;
        for (const row of record.created) {
            if (!kinds.includes(row.kind)) continue;
            const key = (JSON.parse(row.id) as Record<string, unknown>)[field];
            if (typeof key === 'string') held.add(key);
        }
    }
    return held;
}

const named = (keys: readonly string[]): AcoNamed => ({ count: keys.length, names: keys.slice(0, NAMES_SHOWN) });

/**
 * Read what the view shows and name what a clear would delete.
 *
 * @throws AcoSearchError when the products cannot be listed: nothing is planned on a partial list
 */
export async function planAcoWipe(search: AcoSearch, settings: AcoStorefrontSettings, records: readonly InstallRecord[]): Promise<AcoWipePlan> {
    const shownSkus = [...new Set(await search.productSkus())];
    const shownSlugs = await search.categorySlugs();
    const heldSkus = installedKeys(records, settings, 'sku', ['aco_products', 'aco_product']);
    const heldSlugs = installedKeys(records, settings, 'slug', ['aco_categories']);
    const skus = shownSkus.filter((sku) => !heldSkus.has(sku));
    const slugs = [...new Set(shownSlugs ?? [])].filter((slug) => !heldSlugs.has(slug));
    const preview: AcoWipePreview = {
        products: named(skus),
        categories: named(slugs),
        categoriesUnlisted: shownSlugs === undefined,
        installed: shownSkus.length - skus.length,
        total: skus.length + slugs.length,
        token: crypto.randomUUID(),
        limit: ACO_WIPE_LIMIT,
    };
    return { preview, skus, slugs, settings };
}

/** What a clearing deleted. */
export interface AcoWipeDone {
    products: number;
    prices: number;
    categories: number;
}

async function deleteRows(client: AcoClient, kindName: string, rows: Record<string, unknown>[]): Promise<number> {
    const kind = acoKind(kindName);
    if (!kind || rows.length === 0) return 0;
    let deleted = 0;
    for (const batch of chunks(rows, kind.batch)) {
        await deleteBatch(client, kind, batch);
        deleted += batch.length;
    }
    return deleted;
}

/**
 * Delete exactly the plan's keys: each product's price in the view's price book first (when it has
 * one), then the products, then the categories. Attribute definitions are left: other data may
 * share them.
 *
 * @throws AcoApiError when ACO refuses a delete; what was deleted before it stays deleted
 */
export async function runAcoWipe(plan: AcoWipePlan, client: AcoClient, report: (stage: string) => void = () => undefined): Promise<AcoWipeDone> {
    const { skus, slugs, settings } = plan;
    const locale = { locale: settings.locale };
    report('prices');
    const prices = settings.priceBookId
        ? await deleteRows(client, 'aco_prices', skus.map((sku) => ({ sku, priceBookId: settings.priceBookId })))
        : 0;
    report('products');
    const products = await deleteRows(client, 'aco_products', skus.map((sku) => ({ sku, source: locale })));
    report('categories');
    const categories = await deleteRows(client, 'aco_categories', slugs.map((slug) => ({ slug, source: locale })));
    return { products, prices, categories };
}
