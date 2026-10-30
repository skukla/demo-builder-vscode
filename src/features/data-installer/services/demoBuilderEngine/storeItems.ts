/**
 * What a store holds that a save can pick (datapack-engine step 14, items 10 and 11): one kind's
 * items, read from Commerce with the project's own client, and the picks turned into what capture
 * starts from. The service listed each kind through its `list_endpoint` and `list_fields`
 * (`config/data_processors_export.json`); these are the same lists, read here.
 *
 * Scoped to the install target where Commerce scopes the thing: products, customers and cart
 * rules of its website, categories under its root, companies whose people are its customers. An
 * instance shared by several demos (scratch-1028) then lists this demo's, not every demo's.
 * Groups, catalogs, attributes and sets belong to the whole instance and are listed whole, but
 * Commerce's own, which no pack carries (the service's `export_exclusions.json`), counted as
 * excluded.
 *
 * | Kind | Read | Confirmed from a real answer? |
 * |---|---|---|
 * | products, giftcards | `GET products`, `website_id` eq (`readWebsiteProducts`) | yes, the filter and `website_ids` (Assign products, 2026-10-19) |
 * | categories | `GET categories/list`: `id`, `name`, `path` (`readCategoryTree`) | yes (`listCategoryLabels`) |
 * | customers | `GET customers/search`, `website_id` eq (`readWebsiteCustomers`) | the item yes; the filter **no**, so the website is checked here too |
 * | b2b_companies | `GET company`, every page; kept when a website customer's `company_attributes.company_id` names it | the company list **no**; `company_attributes` yes (2026-10-30) |
 * | cart_rules | `GET salesRules/search`, every page; kept when `website_ids` holds the website | the item yes (`commerceSalesRuleFixtures`); the unfiltered list **no** |
 * | customer_groups | `GET customerGroups/search`, every page | the item yes; the unfiltered list **no** |
 * | b2b_shared_catalogs | `GET sharedCatalog` (`readCatalogs`) | yes (step 06) |
 * | product_attributes | `GET products/attributes`, every page; `is_user_defined` | the item yes; the list **no** |
 * | attribute_sets | `GET products/attribute-sets/sets/list` | yes (`loadStoreSets`) |
 *
 * Reads only.
 *
 * @module features/data-installer/services/demoBuilderEngine/storeItems
 */

import { LEFT_OUT_KINDS, type LeftOut, type PickableKind, type StoreItem, type StorePicks, PICKABLE_KINDS } from '../../pickableKinds';
import { readCategoryTree, readWebsiteCustomers, readWebsiteProducts, type WipeCategory } from '../demoDataWipe/wipeReads';
import { CATALOG_KIND, COMPANY_KIND, CUSTOMER_GROUP_KIND, CUSTOMER_KIND, customerKey } from './b2bKeys';
import { PUBLIC_CATALOG_TYPE, readCatalogs } from './b2bReads';
import { COMMERCE_GROUPS } from './captureB2b';
import { CART_RULE_KIND } from './cartRulesKind';
import type { CreatedObject } from './installRecord';
import type { KindContext } from './kindContext';
import { keyOf } from './packForm';
import { GIFT_CARD_KIND } from './productsKind';
import { named } from './saveOutcome';
import { absentAsEmpty, readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceSalesRule } from '@/types/commerceSalesRule';
import type { CommerceCompanyRow, CommerceCustomer, CommerceCustomerGroup, CommerceProduct, CommerceProductAttribute } from '@/types/commerceWire';

/** A gift card's product type. */
const GIFT_CARD_TYPE = 'giftcard';
/** The set every store has, which a pack never carries. */
const DEFAULT_SET = 'Default';
const PRODUCT_ENTITY_TYPE = 4;

/** One kind's items, and how many Commerce's own were left off. */
export interface KindItems {
    items: StoreItem[];
    excluded: number;
}

type Lister = (ctx: KindContext) => Promise<KindItems>;

const kept = (items: StoreItem[], excluded = 0): KindItems => ({ items, excluded });

function websiteOf(ctx: KindContext): number {
    const id = ctx.session.websiteId;
    if (id === undefined) throw new Error('The install target names no website, so its items cannot be listed.');
    return id;
}

const productItem = (p: CommerceProduct): StoreItem => ({ id: p.sku, displayName: p.name || p.sku, detail: p.sku, key: p.sku });

async function products(ctx: KindContext, giftCards: boolean): Promise<KindItems> {
    const all = await readWebsiteProducts(ctx.get, websiteOf(ctx));
    return kept(all.filter((p) => (p.type_id === GIFT_CARD_TYPE) === giftCards).map(productItem));
}

/** The categories under the target's root, each by its place under it, as a pack names it. */
async function categories(ctx: KindContext): Promise<KindItems> {
    const tree = await readCategoryTree(ctx.get);
    const names = new Map(tree.map((c) => [String(c.id), c.name ?? String(c.id)]));
    const root = String(ctx.session.rootCategory.id);
    const under = (c: WipeCategory) => String(c.path ?? '').split('/').slice(2);
    const items = tree
        .filter((c) => String(c.path ?? '').split('/')[1] === root && String(c.id) !== root)
        .map((c): StoreItem => {
            const place = under(c).map((id) => names.get(id) ?? id);
            return { id: String(c.id), displayName: place.join(' / '), key: place.join('/') };
        });
    return kept(items);
}

async function websiteCustomers(ctx: KindContext): Promise<CommerceCustomer[]> {
    return readWebsiteCustomers(ctx.get, websiteOf(ctx));
}

async function customers(ctx: KindContext): Promise<KindItems> {
    return kept(
        (await websiteCustomers(ctx)).map((c) => ({
            id: String(c.id),
            displayName: c.email,
            detail: [c.firstname, c.lastname].filter(Boolean).join(' '),
            key: customerKey(c.email),
        })),
    );
}

/** The companies whose people are the website's customers; none on a store without B2B. */
async function companies(ctx: KindContext): Promise<KindItems> {
    const ids = new Set((await websiteCustomers(ctx)).map((c) => c.extension_attributes?.company_attributes?.company_id).filter((id) => id !== undefined && id !== 0).map(String));
    const all = await absentAsEmpty(() => readAllPages<CommerceCompanyRow>(ctx.get, 'company'));
    return kept(all.filter((c) => ids.has(String(c.id))).map((c) => ({ id: String(c.id), displayName: c.company_name ?? String(c.id), detail: c.company_email, key: c.company_name ?? '' })));
}

async function cartRules(ctx: KindContext): Promise<KindItems> {
    const website = websiteOf(ctx);
    const all = await readAllPages<CommerceSalesRule>(ctx.get, 'salesRules/search');
    return kept(all.filter((r) => (r.website_ids ?? []).map(Number).includes(website)).map((r) => ({ id: String(r.rule_id), displayName: r.name, key: r.name })));
}

async function groups(ctx: KindContext): Promise<KindItems> {
    const all = await readAllPages<CommerceCustomerGroup>(ctx.get, 'customerGroups/search');
    const own = all.filter((g) => !COMMERCE_GROUPS.has(g.code));
    return kept(own.map((g) => ({ id: String(g.id), displayName: g.code, key: g.code })), all.length - own.length);
}

async function catalogs(ctx: KindContext): Promise<KindItems> {
    const all = await readCatalogs(ctx.get);
    const own = all.filter((c) => c.type !== PUBLIC_CATALOG_TYPE);
    return kept(own.map((c) => ({ id: String(c.id), displayName: c.name, key: c.name })), all.length - own.length);
}

async function attributes(ctx: KindContext): Promise<KindItems> {
    const all = await readAllPages<CommerceProductAttribute>(ctx.get, 'products/attributes');
    const own = all.filter((a) => a.is_user_defined === true);
    const item = (a: CommerceProductAttribute): StoreItem => ({ id: a.attribute_code, displayName: a.default_frontend_label || a.attribute_code, detail: a.attribute_code, key: a.attribute_code });
    return kept(own.map(item), all.length - own.length);
}

interface StoreSet {
    attribute_set_id: number;
    attribute_set_name: string;
    entity_type_id?: number;
}

async function sets(ctx: KindContext): Promise<KindItems> {
    const all = (await readAllPages<StoreSet>(ctx.get, 'products/attribute-sets/sets/list')).filter((s) => (s.entity_type_id ?? PRODUCT_ENTITY_TYPE) === PRODUCT_ENTITY_TYPE);
    const own = all.filter((s) => s.attribute_set_name !== DEFAULT_SET);
    return kept(own.map((s) => ({ id: String(s.attribute_set_id), displayName: s.attribute_set_name, key: s.attribute_set_name })), all.length - own.length);
}

const LISTERS: Record<PickableKind, Lister> = {
    products: (ctx) => products(ctx, false),
    [GIFT_CARD_KIND]: (ctx) => products(ctx, true),
    categories,
    [CART_RULE_KIND]: cartRules,
    [CUSTOMER_KIND]: customers,
    [COMPANY_KIND]: companies,
    [CUSTOMER_GROUP_KIND]: groups,
    [CATALOG_KIND]: catalogs,
    product_attributes: attributes,
    attribute_sets: sets,
};

/**
 * One kind's items in the store, but Commerce's own.
 *
 * @param ctx - read access; `session` is the install target's
 */
export function listStoreItems(ctx: KindContext, kind: PickableKind): Promise<KindItems> {
    return LISTERS[kind](ctx);
}

/**
 * The picks as what capture starts from: each a thing of its kind by the id capture reads it by
 * (a SKU, a category's id, a rule's id, an attribute's code). Never written to an install record:
 * the engine did not make them, so removing the pack leaves them (rule 1).
 */
export function seedsOf(picks: StorePicks): CreatedObject[] {
    return PICKABLE_KINDS.flatMap((kind) => (picks[kind] ?? []).map((id): CreatedObject => ({ kind, id })));
}

type Row = Record<string, unknown>;

/** The rows of a kind, as a version holds them: a list, or the categories' tree. */
function rowsOf(kind: string, records: unknown): unknown[] {
    if (kind === 'categories') return ((records as { categories?: unknown[] } | undefined)?.categories ?? []);
    return Array.isArray(records) ? records : [];
}

/** A key as the store compares it: Commerce matches a SKU whatever its case. */
const comparable = (kind: PickableKind, key: string): string => (kind === 'products' || kind === GIFT_CARD_KIND ? key.toLowerCase() : key);

/** One kind's items, or none, logged, when the store cannot list them: the save is not undone for it. */
async function listedOrNone(ctx: KindContext, kind: PickableKind): Promise<StoreItem[]> {
    try {
        return (await listStoreItems(ctx, kind)).items;
    } catch (error) {
        ctx.log(`could not list the store's ${kind} to say what the save left out: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}

/**
 * What the store has, of the kinds an SC adds by hand, that the saved version does not hold
 * (step 14, item 11), by what a pack calls each (`keyOf`). A kind the store cannot list is left
 * out of the answer, and logged.
 *
 * @param items - the saved version's rows, by kind
 */
export async function leftOutOf(ctx: KindContext, items: Record<string, unknown>): Promise<LeftOut[]> {
    const out: LeftOut[] = [];
    for (const kind of LEFT_OUT_KINDS) {
        const held = new Set(rowsOf(kind, items[kind]).map((row) => comparable(kind, keyOf(kind, row as Row) ?? '')));
        const missing = (await listedOrNone(ctx, kind)).filter((item) => !held.has(comparable(kind, item.key)));
        if (missing.length > 0) out.push({ kind, ...named(missing.map((item) => item.displayName)) });
    }
    return out;
}

/**
 * Whether the pack being saved holds an item already: the install record lists it (by id or by
 * key), or the installed version names it.
 *
 * @param rows - the installed version's rows, by kind
 */
export function holdsOf(kind: PickableKind, created: readonly CreatedObject[], rows: Record<string, unknown>): (item: StoreItem) => boolean {
    const own = created.filter((o) => o.kind === kind);
    const ids = new Set(own.map((o) => comparable(kind, o.id)));
    const keys = new Set([...own.map((o) => o.key), ...rowsOf(kind, rows[kind]).map((row) => keyOf(kind, row as Row))].filter((k): k is string => k !== undefined).map((k) => comparable(kind, k)));
    return (item) => ids.has(comparable(kind, item.id)) || keys.has(comparable(kind, item.key));
}
