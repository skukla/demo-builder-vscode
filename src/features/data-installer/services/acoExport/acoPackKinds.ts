/**
 * Each ACO kind, from the export's shared reads (`acoStoreReads.ts`), the way the Data Installer
 * service makes it (`AcoCatalogExportProcessor.js`; `.rptc/research/datapack-engine/aco-export-spec.md`
 * §3 and §5):
 *
 * - metadata and categories: once per chosen store view;
 * - products: per chosen store view, downloadable and grouped ones left out, configurables'
 *   choices labelled from their options (read once per attribute);
 * - price books and prices: per website (every website when no store view was picked, else the
 *   websites of the picked ones), each read through one of its store views.
 *
 * @module features/data-installer/services/acoExport/acoPackKinds
 */

import { attributeCatalog, withOptions } from './acoAttributeCatalog';
import { categoryRows, categorySlugs, metadataRows } from './acoCatalogRows';
import { priceBookRows, dedupePrices, priceRows, storeViewFor } from './acoPriceRows';
import { productGraph, superAttributeCodes } from './acoProductGraph';
import type { AcoStoreReads } from './acoStoreReads';
import type {
    AcoExportKind,
    AcoPriceRow,
    AcoProductRow,
    CommerceCatalogProduct,
} from '@/types/acoPack';
import type { CommerceWebsite } from '@/types/commerceStore';

/** The store views the rows are made for, and whether the SC picked them. */
export interface ChosenViews {
    codes: string[];
    chosen: boolean;
}

/** A kind's rows, and how many products were left out on the way. */
export interface BuiltKind {
    rows: unknown[];
    excluded: number;
}

/** Product types an ACO pack never carries (`export_exclusions_aco.json` L19-34, L54-72). */
const LEFT_OUT: Partial<Record<AcoExportKind, readonly string[]>> = {
    aco_products: ['downloadable', 'grouped'],
    aco_prices: ['downloadable'],
};

function keptFor(
    kind: AcoExportKind,
    products: readonly CommerceCatalogProduct[],
): CommerceCatalogProduct[] {
    const out = LEFT_OUT[kind] ?? [];
    return products.filter((p) => !out.includes(p.type_id ?? ''));
}

async function metadataKind(reads: AcoStoreReads, views: ChosenViews): Promise<BuiltKind> {
    return { rows: metadataRows(await reads.userAttributes(), views.codes), excluded: 0 };
}

async function categoriesKind(reads: AcoStoreReads, views: ChosenViews): Promise<BuiltKind> {
    const rows = [];
    for (const view of views.codes) rows.push(...categoryRows(await reads.categories(view), view));
    return { rows, excluded: 0 };
}

async function productsKind(reads: AcoStoreReads, views: ChosenViews): Promise<BuiltKind> {
    const catalog = attributeCatalog(await reads.allAttributes());
    const rows: AcoProductRow[] = [];
    let excluded = 0;
    for (const view of views.codes) {
        const all = await reads.products(view);
        const kept = keptFor('aco_products', all);
        excluded += all.length - kept.length;
        for (const code of superAttributeCodes(kept, catalog)) {
            if (!catalog.optionsRead.has(code))
                withOptions(catalog, code, await reads.options(code));
        }
        rows.push(
            ...productGraph(kept, view, categorySlugs(await reads.categories(view)), catalog),
        );
    }
    return { rows, excluded };
}

/** The websites priced, each with the store view it is read through; one with none is left out. */
async function pricedWebsites(
    reads: AcoStoreReads,
    views: ChosenViews,
): Promise<Array<{ website: CommerceWebsite; view: string }>> {
    const storeViews = await reads.storeViews();
    const owners = new Set(
        storeViews.filter((v) => views.codes.includes(v.code)).map((v) => Number(v.website_id)),
    );
    const websites = (await reads.websites()).filter((w) => !views.chosen || owners.has(w.id));
    const priced = [];
    for (const website of websites) {
        const view = storeViewFor(website, storeViews, views.chosen ? views.codes : []);
        if (view) priced.push({ website, view });
    }
    return priced;
}

/** A website's display currency, through its store view, as three capital letters. */
function currencyOf(
    configs: ReadonlyMap<string, string | undefined>,
    website: CommerceWebsite,
    view: string,
): string {
    const code = (configs.get(view) ?? '').trim().toUpperCase();
    if (/^[A-Z]{3}$/u.test(code)) return code;
    throw new Error(
        `Could not tell the currency of website ${website.id} (${website.code}): its store view ${view} names none.`,
    );
}

async function priceBooksKind(reads: AcoStoreReads, views: ChosenViews): Promise<BuiltKind> {
    const priced = await pricedWebsites(reads, views);
    const configs = new Map(
        (await reads.storeConfigs()).map((c) => [c.code, c.default_display_currency_code]),
    );
    const currencies = new Map(
        priced.map(({ website, view }) => [website.id, currencyOf(configs, website, view)]),
    );
    const rows = priceBookRows(
        priced.map((p) => p.website),
        await reads.customerGroups(),
        (w) => currencies.get(w.id) ?? '',
    );
    return { rows, excluded: 0 };
}

async function pricesKind(reads: AcoStoreReads, views: ChosenViews): Promise<BuiltKind> {
    const groups = new Map((await reads.customerGroups()).map((g) => [String(g.id), g]));
    const rows: AcoPriceRow[] = [];
    let excluded = 0;
    for (const { website, view } of await pricedWebsites(reads, views)) {
        const all = await reads.products(view);
        const kept = keptFor('aco_prices', all);
        excluded += all.length - kept.length;
        for (const product of kept) rows.push(...priceRows(product, website, groups));
    }
    return { rows: dedupePrices(rows), excluded };
}

const BUILDERS: Record<
    AcoExportKind,
    (reads: AcoStoreReads, views: ChosenViews) => Promise<BuiltKind>
> = {
    aco_metadata: metadataKind,
    aco_categories: categoriesKind,
    aco_products: productsKind,
    aco_price_books: priceBooksKind,
    aco_prices: pricesKind,
};

/** One kind's rows, made from the shared reads. */
export function buildAcoKind(
    kind: AcoExportKind,
    reads: AcoStoreReads,
    views: ChosenViews,
): Promise<BuiltKind> {
    return BUILDERS[kind](reads, views);
}
