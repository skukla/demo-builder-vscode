/**
 * Clear an ACO instance's demo data (PL-60, owner 2026-10-31: "clear demo data is needed"): remove
 * what the project's catalog view shows that no installed pack holds, the ACO half of Clear demo
 * data. Research and the reasons: `.rptc/research/aco-support/clear-demo-data.md`.
 *
 * ACO's ingestion API deletes by key but cannot list, so the keys come from the STOREFRONT search
 * the project's storefront itself uses: `productSearch` page by page for SKUs, `categorySearch` for
 * category slugs. That is also the limit, said to the SC every time: a product the view does not
 * show (another view, no price in its price book) is invisible here and stays.
 *
 * The query shapes are the ones `skukla/commerce-demo-ingestion` `aco/delete-everything.js` sends
 * to ACO (read 2026-10-31); the headers are the storefront's own (`acoHeaders`), plus the
 * `AC-Environment-Id` that script sends. **No live call has checked either** (the live check,
 * `.rptc/plans/aco-support/live-check.md`). Unlike that script, a search that fails or answers with
 * errors refuses the clear: "could not list" must never read as "nothing to clear".
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
// "Hidden from search" is the ingestion tool's finding (delete-everything.js: productSearch returns
// only visible products, so hidden variants are never found), not checked live here.
export const ACO_WIPE_LIMIT =
    'Only what this catalog view shows can be found: a product in another view, with no price in its price book, or hidden from search (a variant, usually) stays.';

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
    /** Every SKU the view shows, every page. */
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
        headers: { 'Content-Type': 'application/json', ...acoHeaders(settings).cs, 'AC-Environment-Id': settings.tenantId },
        body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
    });
    if (!response.ok) throw new AcoSearchError(`ACO's catalog search answered ${response.status}.`);
    return (await response.json()) as GraphqlAnswer<T>;
}

// A single space lists every product; "*" answers "No index found" (BuildRight's tested finding,
// `buildright-aco/docs/archive/ACO-CLEANUP-LESSONS-LEARNED.md` §3). The ingestion script's empty
// phrase was never tested there.
const PRODUCTS_QUERY = `query ProductSearch($page: Int!, $pageSize: Int!) {
  productSearch(phrase: " ", current_page: $page, page_size: $pageSize) {
    page_info { current_page total_pages }
    items { productView { sku } }
  }
}`;

const CATEGORIES_QUERY = 'query { categorySearch { slug } }';

interface ProductPage {
    productSearch?: { page_info?: { total_pages?: number }; items?: Array<{ productView?: { sku?: string } }> };
}

/** The search over the project's view. */
export function createAcoSearch(settings: AcoStorefrontSettings, doFetch: typeof fetch = fetch): AcoSearch {
    return {
        async productSkus() {
            const skus: string[] = [];
            for (let page = 1, pages = 1; page <= pages; page += 1) {
                const answer = await ask<ProductPage>(doFetch, settings, PRODUCTS_QUERY, { page, pageSize: PAGE_SIZE });
                if (answer.errors?.length) throw new AcoSearchError(`ACO's catalog search refused: ${answer.errors[0]?.message ?? 'no reason given'}`);
                const found = answer.data?.productSearch;
                if (!found) throw new AcoSearchError('ACO\'s catalog search answered without a product list.');
                for (const item of found.items ?? []) if (item.productView?.sku) skus.push(item.productView.sku);
                pages = found.page_info?.total_pages ?? page;
            }
            return skus;
        },
        async categorySlugs() {
            try {
                const answer = await ask<{ categorySearch?: Array<{ slug?: string }> }>(doFetch, settings, CATEGORIES_QUERY);
                if (answer.errors?.length || !answer.data?.categorySearch) return undefined;
                return answer.data.categorySearch.map((c) => c.slug).filter((s): s is string => Boolean(s));
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
