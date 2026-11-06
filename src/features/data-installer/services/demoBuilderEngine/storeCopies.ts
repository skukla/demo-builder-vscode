/**
 * The store's copy of each thing an install record lists, in pack form, and the pack's own rows
 * by the name it gives them (step 05). A repeat install compares the two through their
 * fingerprints; capture writes the copies into the new version.
 *
 * Products are read a page of SKUs at a time, through the same search the ERP work reads them
 * with, so a pack of a hundred products is a handful of calls; the copy and its later
 * comparison always come from that one route, so the two can never differ by route. The rest
 * are read by the routes install already reads: a category and an attribute by their own route,
 * a set from the set list, an attribute set's attributes, and the inventory's three lists.
 *
 * @module features/data-installer/services/demoBuilderEngine/storeCopies
 */

import { withoutCredentials } from '../packCredentials';
import { filterBy, filterIn } from './b2bReads';
import { B2B_READERS, b2bRowsOf } from './b2bStoreCopies';
import { CART_RULE_KIND, readRuleCopies } from './cartRulesKind';
import { COUPON_KIND, readCouponCopies } from './couponsKind';
import { fingerprintRow } from './fingerprint';
import type { CreatedObject } from './installRecord';
import { eachCopy, type KindContext, segment } from './kindContext';
import { attributePackForm, categoryPackForm, keyOf, productPackForm } from './packForm';
import { PRODUCT_EXPORT_KIND } from './productExportKind';
import type { ProductLookups } from './productLookups';
import { runInBatches } from '@/core/utils/promiseUtils';
import { readAllPages } from '@/features/app-builder/services/erpFillReaders';
import { type Inventory, readInventory } from '@/features/app-builder/services/storePreparation/warehouseFix';
import type { CommerceProduct, CommerceSetAttribute } from '@/types/commerceWire';

/** SKUs per search: short enough for any address, long enough to be few calls. */
const SKUS_PER_READ = 20;

/**
 * Pages of SKUs read at once. One after another, the read-back after Luma's 2,046 products took over
 * three minutes of a twelve-minute install, and as long again checking for edits before removal
 * (2026-11-06).
 */
const READS_AT_ONCE = 5;

/** The pack data kind a recorded kind's rows live under. Options live in their attributes. */
export function packKindOf(kind: string): string {
    return kind === 'attribute_options' ? 'product_attributes' : kind;
}

/**
 * The pack kind a recorded kind's rows live under in these items: a product or gift card comes from
 * `product_export` (the service's import form, `productExportKind.ts`) when the pack carries its
 * products that way.
 */
export function packKindIn(kind: string, items: Record<string, unknown>): string {
    if ((kind === 'products' || kind === 'giftcards') && !(kind in items) && PRODUCT_EXPORT_KIND in items) return PRODUCT_EXPORT_KIND;
    return packKindOf(kind);
}

/**
 * An import body's store-wide rows as product rows (`{ product: row }`, so they are keyed and hashed as
 * products are), gift cards apart from the rest; undefined for anything else.
 */
function importRowsOf(kind: string, records: unknown): unknown[] | undefined {
    if (kind !== 'products' && kind !== 'giftcards') return undefined;
    const items = (records as { source?: { items?: unknown } } | null)?.source?.items;
    if (!Array.isArray(items)) return undefined;
    return (items as Row[]).filter((r) => !r.store_view_code && (r.product_type === 'giftcard') === (kind === 'giftcards')).map((r) => ({ product: r }));
}

/**
 * Every row a search route holds for these SKUs, a page of SKUs at a time: products from
 * `products`, quantities from `inventory/source-items`.
 */
export async function readBySku<T>(ctx: KindContext, route: string, skus: readonly string[]): Promise<T[]> {
    // A comma would split one SKU into two in an "in" search; such a SKU is read on its own.
    const plain = skus.filter((sku) => !sku.includes(','));
    const groups = Array.from({ length: Math.ceil(plain.length / SKUS_PER_READ) }, (_, i) => plain.slice(i * SKUS_PER_READ, (i + 1) * SKUS_PER_READ));
    const pages = await runInBatches(groups, READS_AT_ONCE, (group) => readAllPages<T>(ctx.get, route, filterIn('sku', group)));
    const found: T[] = pages.flat();
    for (const sku of skus.filter((s) => s.includes(','))) {
        found.push(...(await readAllPages<T>(ctx.get, route, filterBy('sku', sku))));
    }
    return found;
}

/** Every product the store has of these SKUs, as it holds them. */
export function readProducts(ctx: KindContext, skus: readonly string[]): Promise<CommerceProduct[]> {
    return readBySku<CommerceProduct>(ctx, 'products', skus);
}

type Copies = Map<string, unknown>;
type Reader = (ctx: KindContext, lk: ProductLookups, objects: readonly CreatedObject[], inventory: () => Promise<Inventory>) => Promise<Copies>;

/** The attribute by code, or undefined when the store no longer has it. */
async function attributeOrNone(lk: ProductLookups, code: string) {
    try {
        return await lk.attribute(code);
    } catch {
        return undefined;
    }
}

/**
 * The lookups, naming a product by id from products already read. A configurable names its children by
 * id, and the pages just read hold most of them: asked for one at a time, Luma's 1,900 children took
 * two minutes of the read-back (2026-11-06). Only an id not read costs a request.
 */
export function knowingSkus(lk: ProductLookups, products: readonly CommerceProduct[]): ProductLookups {
    const skuOfId = new Map(products.map((p) => [String(p.id), p.sku]));
    return { ...lk, productSku: async (id) => skuOfId.get(String(id)) ?? lk.productSku(id) };
}

/** Products by SKU, a page of SKUs at a time; a gift card is one too (step 11). */
const productReader: Reader = async (ctx, lk, objects) => {
    const products = await readProducts(ctx, objects.map((o) => o.id));
    const bySku = new Map(products.map((p) => [p.sku, p]));
    const known = knowingSkus(lk, products);
    return eachCopy(objects, async (o) => {
        const raw = bySku.get(o.id);
        return raw ? productPackForm(known, raw) : undefined;
    });
};

const READERS: Record<string, Reader> = {
    products: productReader,
    giftcards: productReader,
    categories: (_ctx, lk, objects) =>
        eachCopy(objects, async (o) => {
            const raw = await lk.category(o.id);
            return raw ? categoryPackForm(lk, raw) : undefined;
        }),
    product_attributes: (_ctx, lk, objects) =>
        eachCopy(objects, async (o) => {
            const raw = await attributeOrNone(lk, o.id);
            return raw ? attributePackForm({ attribute_code: o.id, ...raw }) : undefined;
        }),
    attribute_options: (_ctx, lk, objects) =>
        eachCopy(objects, async (o) => {
            const [code, optionId] = o.id.split('/');
            const option = (await attributeOrNone(lk, code))?.options?.find((opt) => opt.value === optionId);
            if (!option) return undefined;
            return { attribute_code: code, label: (option.label ?? '').trim() };
        }),
    attribute_sets: (_ctx, lk, objects) =>
        eachCopy(objects, async (o) => {
            const name = await lk.setName(o.id);
            return name === undefined ? undefined : { attributeSet: { attribute_set_name: name } };
        }),
    attribute_assign_to_set: async (ctx, lk, objects) => {
        const inSet = new Map<string, Promise<CommerceSetAttribute[]>>();
        const attributesOf = (setId: string) => {
            if (!inSet.has(setId)) {
                inSet.set(setId, ctx.get(`products/attribute-sets/${segment(setId)}/attributes`).then((a) => (a ?? []) as CommerceSetAttribute[], () => []));
            }
            return inSet.get(setId) as Promise<CommerceSetAttribute[]>;
        };
        return eachCopy(objects, async (o) => {
            const [setId, code] = o.id.split('/');
            const name = await lk.setName(setId);
            const has = (await attributesOf(setId)).some((a) => a.attribute_code === code);
            return name !== undefined && has ? { attributeSetId: name, attributeCode: code } : undefined;
        });
    },
    sources: async (_ctx, _lk, objects, inventory) => {
        const { sources } = await inventory();
        return eachCopy(objects, async (o) => {
            const source = sources.find((s) => s.source_code === o.id);
            return source ? { source } : undefined;
        });
    },
    stocks: async (_ctx, _lk, objects, inventory) => {
        const { stocks } = await inventory();
        return eachCopy(objects, async (o) => {
            const stock = stocks.find((s) => String(s.stock_id) === o.id);
            return stock ? { stock: { name: stock.name } } : undefined;
        });
    },
    stock_source_links: async (_ctx, _lk, objects, inventory) => {
        const { stocks, links } = await inventory();
        return eachCopy(objects, async (o) => {
            const slash = o.id.indexOf('/');
            const [stockId, code] = [o.id.slice(0, slash), o.id.slice(slash + 1)];
            const link = links.find((l) => String(l.stock_id) === stockId && l.source_code === code);
            const stock = stocks.find((s) => String(s.stock_id) === stockId);
            return link && stock ? { stockSourceLink: { stock_id: stock.name, source_code: code, priority: link.priority } } : undefined;
        });
    },
    // Customers, groups, companies, shared catalogs and their assignments (step 08).
    ...B2B_READERS,
    // Cart rules and their coupons (step 11): `GET salesRules/{id}`, `GET coupons/{id}`.
    [CART_RULE_KIND]: (ctx, lk, objects) => readRuleCopies(ctx, lk, objects),
    [COUPON_KIND]: (ctx, _lk, objects) => readCouponCopies(ctx, objects),
};

/** The kinds whose recorded objects can be read back. */
export const READABLE_KINDS: readonly string[] = Object.keys(READERS);

/**
 * The store's copy of each recorded object of one kind, in pack form, by recorded id. An object
 * the store no longer has is absent from the answer.
 */
export async function readCopies(
    ctx: KindContext,
    lk: ProductLookups,
    kind: string,
    objects: readonly CreatedObject[],
    inventory: () => Promise<Inventory> = onceInventory(ctx),
): Promise<Copies> {
    const reader = READERS[kind];
    if (!reader || objects.length === 0) return new Map();
    // How long each kind takes to read back, in Debug Logs: the read-back and removal's check for
    // edits each took two to three minutes for Luma, and which kind spent it was not known.
    const started = Date.now();
    const copies = await reader(ctx, lk, objects, inventory);
    ctx.log(`read back ${objects.length} ${kind} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return copies;
}

/** The inventory's three lists, read once however many kinds ask. */
export function onceInventory(ctx: KindContext): () => Promise<Inventory> {
    let read: Promise<Inventory> | undefined;
    return () => (read ??= readInventory(ctx.get));
}

type Row = Record<string, unknown>;
const list = (value: unknown, field?: string): unknown[] => {
    const holder = field ? (value as Row | null)?.[field] : value;
    return Array.isArray(holder) ? holder : [];
};

/** A pack kind's rows, as a list of single rows. */
function rowsOf(kind: string, records: unknown): unknown[] {
    const assignments = b2bRowsOf(kind, records) ?? importRowsOf(kind, records);
    if (assignments) return assignments;
    switch (kind) {
        case 'categories': {
            const root = (records as Row | null)?.root_category as Row | undefined;
            return [...(root ? [{ category: { ...root, path: '' } }] : []), ...list(records, 'categories')];
        }
        case 'attribute_options':
            return list(records).flatMap((row) => {
                const attribute = (row as { attribute?: Row }).attribute ?? {};
                return list(attribute.options).map((o) => ({ attribute_code: attribute.attribute_code, label: String((o as Row).label ?? '').trim() }));
            });
        case 'sources':
            return list(records, 'sources');
        case 'stocks':
            return list(records, 'stocks');
        case 'stock_source_links':
            return list(records, 'stockSourceLinks');
        default:
            return list(records);
    }
}

/** A pack's rows of a recorded kind, by the name the pack gives each one. */
export function rowsByKey(kind: string, records: unknown): Map<string, unknown> {
    const rows = new Map<string, unknown>();
    for (const row of rowsOf(kind, records)) {
        const key = keyOf(kind, row);
        if (key) rows.set(key, row);
    }
    return rows;
}

/** Kinds a repeat install brings changes to; every other kind is only added or taken away. */
const UPDATED_WHOLE = new Set(['products', 'giftcards', 'categories', 'sources', 'customer_groups', 'customers', 'b2b_companies', 'cart_rules', 'coupons']);

/**
 * The fingerprint of a pack row, for "has the pack changed since it was installed?": the whole
 * row for a kind a repeat install updates, the option labels for an attribute (the one change it
 * brings to one), and the name alone for a kind that has nothing to update.
 */
export function packedFingerprint(kind: string, row: unknown): string {
    // A customer's password is never hashed into the record (step 08).
    if (kind === 'customers') return fingerprintRow((withoutCredentials(kind, [row]) as unknown[])[0]);
    if (UPDATED_WHOLE.has(kind)) return fingerprintRow(row);
    if (kind === 'product_attributes') {
        const attribute = (row as { attribute?: Row }).attribute ?? {};
        return fingerprintRow({ code: attribute.attribute_code, options: list(attribute.options).map((o) => String((o as Row).label ?? '').trim()) });
    }
    return fingerprintRow(keyOf(kind, row) ?? '');
}
