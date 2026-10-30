/**
 * Capture: what "Save store changes to this pack" reads (step 05, owner 2026-10-27).
 *
 * It reads back everything the install record lists, and the store's copy of the installed
 * version's own products, attributes and sets (a pack installed onto a store that already held
 * some of its SKUs left those off the record, and a save must not lose them; owner, 2026-10-29),
 * plus what all of those need to install on
 * an empty store: the categories a captured product sits in and their parents, the attribute set
 * it uses, its user-defined attributes with their options and their place in the set, and its
 * quantities with the sources they are held in. The service's export pulls in nothing a selection
 * depends on (export spec §4); this does. Everything is written in pack form (`packForm.ts`),
 * so SKUs are kept exactly and every id is a name again.
 *
 * The root category is named, never guessed: a category's root is read from its own path in the
 * store. When that is the root of the store the pack was installed into, the pack names no root
 * of its own and its paths start with that root's name, which install maps onto whatever root
 * the next store has. When it is a root the pack made, it is written as the pack's
 * `root_category`. (The service matches a root by name, and without one exports the store's root
 * as an ordinary category, §2.)
 *
 * Customers, groups, companies, shared catalogs and their assignments are captured beside these
 * (`captureB2b.ts`, step 08).
 *
 * What the store already had and nothing captured names is left out: the store's Default set and
 * default source, Commerce's own attributes, products the pack did not make. Reads only.
 *
 * @module features/data-installer/services/demoBuilderEngine/capture
 */

import { captureB2b } from './captureB2b';
import type { CreatedObject } from './installRecord';
import { type KindContext, segment } from './kindContext';
import { ancestorIds, attributePackForm, categoryPackForm, productPackForm } from './packForm';
import { type ProductLookups, type StoreCategory, productLookups } from './productLookups';
import { onceInventory, readBySku, readCopies, readProducts } from './storeCopies';
import type { CommerceProduct, CommerceSetAttribute } from '@/types/commerceWire';

/** The set and the source every store has, which a pack never carries (export spec §1). */
const DEFAULT_SET = 'Default';
const DEFAULT_SOURCE = 'default';
const PRODUCT_ENTITY_TYPE = 4;

/** Children before the products that name them, as the export sorts them (§3). */
const TYPE_ORDER = ['simple', 'virtual', 'downloadable', 'configurable', 'bundle', 'grouped'];

/** What a capture read: the new version's rows by kind, and how many of each. */
export interface CaptureResult {
    items: Record<string, unknown>;
    counts: Record<string, number>;
}

const idsOf = (created: readonly CreatedObject[], kind: string): string[] => created.filter((o) => o.kind === kind).map((o) => o.id);

function typeRank(product: CommerceProduct): number {
    const rank = TYPE_ORDER.indexOf(product.type_id ?? '');
    return rank < 0 ? TYPE_ORDER.length : rank;
}

/** The categories a product sits in, by id, from its links and its `category_ids`. */
function linkedCategories(product: CommerceProduct): string[] {
    const links = (product.extension_attributes?.category_links ?? []).map((l) => String(l.category_id));
    const listed = product.custom_attributes?.find((a) => a.attribute_code === 'category_ids')?.value;
    return [...links, ...(Array.isArray(listed) ? listed.map(String) : [])];
}

/** The root a category hangs from: the second id in its path. */
const rootOf = (category: StoreCategory): string | undefined => (category.path ?? '').split('/').filter(Boolean)[1];

async function captureCategories(lk: ProductLookups, recorded: string[], linked: string[], storeRoot: number): Promise<{ records?: unknown; count: number }> {
    const wanted = new Set<string>();
    let root: string | undefined;
    for (const id of [...recorded, ...linked]) {
        const category = await lk.category(id);
        if (!category) continue;
        // The pack's root is the root of what this engine made; else the store's own.
        root ??= recorded.includes(id) ? rootOf(category) : undefined;
        for (const each of [...ancestorIds(category), String(category.id)]) wanted.add(each);
    }
    root ??= String(storeRoot);
    const rows: Array<{ depth: number; row: unknown }> = [];
    for (const id of wanted) {
        const category = await lk.category(id);
        if (!category || String(category.id) === root || rootOf(category) !== root) continue;
        rows.push({ depth: (category.path ?? '').split('/').length, row: await categoryPackForm(lk, category) });
    }
    if (rows.length === 0) return { count: 0 };
    const categories = rows.sort((a, b) => a.depth - b.depth).map((r) => r.row);
    const own = root === String(storeRoot) ? undefined : await lk.category(root);
    const rootRow = own ? (({ path: _path, ...fields }) => fields)((await categoryPackForm(lk, own)).category) : undefined;
    return { records: { ...(rootRow ? { root_category: rootRow } : {}), categories }, count: categories.length };
}

/** The user-defined attributes named, with their options; Commerce's own are every store's. */
async function captureAttributes(lk: ProductLookups, codes: Set<string>): Promise<{ rows: unknown[]; codes: Set<string> }> {
    const rows: unknown[] = [];
    const kept = new Set<string>();
    for (const code of codes) {
        const attribute = await lk.attribute(code).catch(() => undefined);
        if (!attribute?.is_user_defined) continue;
        rows.push(attributePackForm({ attribute_code: code, ...attribute }));
        kept.add(code);
    }
    return { rows, codes: kept };
}

/** Every attribute code a captured product carries, its configurable options' included. */
async function attributeCodes(lk: ProductLookups, products: readonly CommerceProduct[], created: readonly CreatedObject[]): Promise<Set<string>> {
    const codes = new Set<string>([...idsOf(created, 'product_attributes'), ...idsOf(created, 'attribute_options').map((id) => id.split('/')[0])]);
    for (const product of products) {
        for (const attr of product.custom_attributes ?? []) codes.add(attr.attribute_code);
        for (const option of product.extension_attributes?.configurable_product_options ?? []) {
            const code = await lk.attributeCode(option.attribute_id).catch(() => undefined);
            if (code) codes.add(code);
        }
    }
    return codes;
}

/** The sets named, but Default, and each captured attribute's place in every set named. */
async function captureSets(ctx: KindContext, lk: ProductLookups, setIds: Set<string>, codes: Set<string>): Promise<{ sets: unknown[]; assignments: unknown[] }> {
    const sets: unknown[] = [];
    const assignments: unknown[] = [];
    for (const setId of setIds) {
        const name = await lk.setName(setId);
        if (name === undefined) continue;
        if (name !== DEFAULT_SET) {
            sets.push({ attributeSet: { attribute_set_name: name, entity_type_id: PRODUCT_ENTITY_TYPE, sort_order: 0 }, skeletonId: PRODUCT_ENTITY_TYPE });
        }
        const inSet = ((await ctx.get(`products/attribute-sets/${segment(setId)}/attributes`)) ?? []) as CommerceSetAttribute[];
        for (const attr of inSet) {
            if (attr.attribute_code && codes.has(attr.attribute_code)) assignments.push({ attributeSetId: name, attributeCode: attr.attribute_code });
        }
    }
    return { sets, assignments };
}

interface SourceItem {
    sku: string;
    source_code: string;
    quantity?: number;
    status?: number;
}

/** Quantities of the captured products, and the warehouses that hold them, the pack's own. */
async function captureInventory(ctx: KindContext, lk: ProductLookups, skus: string[], created: readonly CreatedObject[]): Promise<Record<string, unknown>> {
    const inventory = onceInventory(ctx);
    const items = (await readBySku<SourceItem>(ctx, 'inventory/source-items', skus)).map(({ sku, source_code, quantity, status }) => ({ sku, source_code, quantity: quantity ?? 0, status: status ?? 0 }));
    const sourceCodes = new Set([...idsOf(created, 'sources'), ...items.map((i) => i.source_code)].filter((code) => code !== DEFAULT_SOURCE));
    const as = (kind: string, ids: Iterable<string>) => [...ids].map((id): CreatedObject => ({ kind, id }));
    const sources = [...(await readCopies(ctx, lk, 'sources', as('sources', sourceCodes), inventory)).values()];
    const stocks = [...(await readCopies(ctx, lk, 'stocks', as('stocks', idsOf(created, 'stocks')), inventory)).values()];
    const links = [...(await readCopies(ctx, lk, 'stock_source_links', as('stock_source_links', idsOf(created, 'stock_source_links')), inventory)).values()];
    return {
        ...(stocks.length > 0 ? { stocks: { stocks } } : {}),
        ...(sources.length > 0 ? { sources: { sources } } : {}),
        ...(links.length > 0 ? { stock_source_links: { stockSourceLinks: links } } : {}),
        ...(items.length > 0 ? { source_items: { sourceItems: items } } : {}),
    };
}

const countOf = (records: unknown): number => {
    if (Array.isArray(records)) return records.length;
    const inner = Object.values((records ?? {}) as Record<string, unknown>).find(Array.isArray);
    return Array.isArray(inner) ? inner.length : 0;
};

type Row = Record<string, unknown>;
const rowsOf = (records: unknown): Row[] => (Array.isArray(records) ? (records as Row[]) : []);
const fieldOf = (row: Row, outer: string, inner: string): string | undefined => {
    const value = (row[outer] as Row | undefined)?.[inner];
    return typeof value === 'string' && value !== '' ? value : undefined;
};

/** The url keys of the categories a capture took. */
function categoryUrlKeys(records: unknown): Set<string> {
    const rows = ((records as { categories?: Array<{ category: { custom_attributes?: Array<{ attribute_code: string; value: unknown }> } }> } | undefined)?.categories ?? []);
    return new Set(rows.map((r) => r.category.custom_attributes?.find((a) => a.attribute_code === 'url_key')?.value).filter((v): v is string => typeof v === 'string'));
}

/** What the installed version itself names, beside what the record lists. */
export interface InstalledNames {
    skus: string[];
    attributeCodes: string[];
    setNames: string[];
}

/** The SKUs, attribute codes and set names the installed version's own rows hold. */
export function installedNames(installed: Record<string, unknown>): InstalledNames {
    const pick = (kind: string, outer: string, inner: string) => rowsOf(installed[kind]).map((r) => fieldOf(r, outer, inner)).filter((v): v is string => v !== undefined);
    return {
        skus: pick('products', 'product', 'sku'),
        attributeCodes: pick('product_attributes', 'attribute', 'attribute_code'),
        setNames: pick('attribute_sets', 'attributeSet', 'attribute_set_name'),
    };
}

/** One product per SKU as the store spells it, whichever list asked for it first. */
function uniqueBySku(products: CommerceProduct[]): CommerceProduct[] {
    const seen = new Map<string, CommerceProduct>();
    for (const product of products) if (!seen.has(product.sku)) seen.set(product.sku, product);
    return [...seen.values()];
}

/** The ids of the sets the installed version names, those the store has. */
async function namedSetIds(lk: ProductLookups, names: string[]): Promise<string[]> {
    const ids = await Promise.all(names.map((name) => lk.setId(name).then(String, () => undefined)));
    return ids.filter((id): id is string => id !== undefined);
}

/**
 * Read back what the install record lists and what the installed version names, with what they
 * need, as a new version's rows.
 *
 * @param ctx - read access to the store; `session.rootCategory` is the install target's root
 * @param created - what the install record lists
 * @param installed - the installed version's own rows, by kind
 */
export async function capturePack(ctx: KindContext, created: readonly CreatedObject[], installed: Record<string, unknown> = {}): Promise<CaptureResult> {
    const lk = productLookups(ctx);
    const names = installedNames(installed);
    const products = uniqueBySku(await readProducts(ctx, [...new Set([...idsOf(created, 'products'), ...names.skus])])).sort((a, b) => typeRank(a) - typeRank(b));
    const productRows = await Promise.all(products.map((p) => productPackForm(lk, p)));
    const categories = await captureCategories(lk, idsOf(created, 'categories'), products.flatMap(linkedCategories), ctx.session.rootCategory.id);
    const codes = await attributeCodes(lk, products, created);
    for (const code of names.attributeCodes) codes.add(code);
    const attributes = await captureAttributes(lk, codes);
    const setIds = new Set(
        [
            ...idsOf(created, 'attribute_sets'),
            ...idsOf(created, 'attribute_assign_to_set').map((id) => id.split('/')[0]),
            ...products.map((p) => String(p.attribute_set_id ?? '')),
            ...(await namedSetIds(lk, names.setNames)),
        ].filter(Boolean),
    );
    const { sets, assignments } = await captureSets(ctx, lk, setIds, attributes.codes);
    const items: Record<string, unknown> = {
        ...(sets.length > 0 ? { attribute_sets: sets } : {}),
        ...(attributes.rows.length > 0 ? { product_attributes: attributes.rows } : {}),
        ...(assignments.length > 0 ? { attribute_assign_to_set: assignments } : {}),
        ...(categories.records ? { categories: categories.records } : {}),
        ...(productRows.length > 0 ? { products: productRows } : {}),
        ...(await captureInventory(ctx, lk, products.map((p) => p.sku), created)),
        // Customers, groups, companies, catalogs and what is assigned to them (step 08).
        ...(await captureB2b(ctx, lk, created, installed, {
            skus: products.map((p) => p.sku),
            categoryKeys: categoryUrlKeys(categories.records),
            tierGroups: products.flatMap((p) => (p.tier_prices ?? []).map((t) => t.customer_group_id)),
        })),
    };
    const counts = Object.fromEntries(Object.entries(items).map(([kind, records]) => [kind, kind === 'categories' ? categories.count : countOf(records)]));
    return { items, counts };
}

