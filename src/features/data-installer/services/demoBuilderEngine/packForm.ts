/**
 * Pack form: what the store holds, written back the way a pack holds it (step 05).
 *
 * Capture writes these rows into a new version of the pack, so a captured pack installs on any
 * store: every id this store gave is turned back into the name a person reads, through the same
 * two-way lookups install uses (`productLookups.ts`), and what only this store means (its ids, its
 * timestamps, its stock counters, its websites) is left out. An id that cannot be named is kept,
 * as the service's export keeps it (export spec §2). SKUs are kept exactly, where the service's
 * export lowercased them (§2, `make_sku_eds_compatible`).
 *
 * Every fingerprint is made from these rows too (`fingerprint.ts`), so "edited since" compares
 * the store with itself through one transform, never a pack row with a store answer.
 *
 * `keyOf` is what the pack calls a row: the name a repeat install finds it by.
 *
 * Not carried, on purpose (the plan's "Later"): images. `media_gallery_entries` is left out, as
 * the service's export leaves it out.
 *
 * @module features/data-installer/services/demoBuilderEngine/packForm
 */

import type { ProductLookups, StoreAttribute, StoreCategory } from './productLookups';
import type { CommerceProduct } from '@/types/commerceWire';

/** What a root category is called, whatever its name: the top of a pack's tree. */
export const ROOT_KEY = '(root)';

/** Inputs whose stored values are option ids. */
const OPTION_INPUTS = new Set(['select', 'multiselect']);

/** A category's custom attributes the store works out for itself (export spec §3). */
const DERIVED_CATEGORY_FIELDS = new Set(['path', 'children_count', 'url_path']);

type CustomAttribute = { attribute_code: string; value: unknown };
type Ext = NonNullable<CommerceProduct['extension_attributes']>;

/** The value, or the id it came from when the lookup has no name for it. */
async function nameOr<T>(id: T, lookup: () => Promise<string | undefined>): Promise<string | T> {
    try {
        return (await lookup()) ?? id;
    } catch {
        return id;
    }
}

async function customAttribute(lk: ProductLookups, attr: CustomAttribute): Promise<CustomAttribute> {
    const { attribute_code: code, value } = attr;
    if (code === 'category_ids' && Array.isArray(value)) {
        return { attribute_code: code, value: await Promise.all(value.map((id) => nameOr(id, () => lk.categoryUrlKey(String(id))))) };
    }
    if (typeof value !== 'string' || value === '') return attr;
    let described: StoreAttribute;
    try {
        described = await lk.attribute(code);
    } catch {
        return attr;
    }
    if (!described.is_user_defined || !OPTION_INPUTS.has(described.frontend_input ?? '')) return attr;
    const labels = await Promise.all(value.split(',').map((id) => nameOr(id, () => lk.optionLabel(code, id))));
    return { attribute_code: code, value: labels.join(',') };
}

type ConfigurableOptions = NonNullable<Ext['configurable_product_options']>;

async function configurableOptions(lk: ProductLookups, options: ConfigurableOptions): Promise<ConfigurableOptions> {
    return Promise.all(
        options.map(async ({ id: _id, product_id: _product, ...option }) => {
            const code = await nameOr(String(option.attribute_id), () => lk.attributeCode(String(option.attribute_id)));
            const values = await Promise.all(
                (option.values ?? []).map(async (v) => ({ value_index: await nameOr(v.value_index, () => lk.optionLabel(code, String(v.value_index))) })),
            );
            return { ...option, attribute_id: code, values };
        }),
    );
}

async function extensionAttributes(lk: ProductLookups, ext: Ext): Promise<Ext> {
    const { stock_item: _stock, website_ids: _websites, ...out }: Ext = ext;
    if (ext.category_links) {
        out.category_links = await Promise.all(
            ext.category_links.map(async (l) => ({ ...l, category_id: await nameOr(l.category_id, () => lk.categoryUrlKey(l.category_id)) })),
        );
    }
    if (ext.configurable_product_options) out.configurable_product_options = await configurableOptions(lk, ext.configurable_product_options);
    if (ext.configurable_product_links) {
        out.configurable_product_links = await Promise.all(ext.configurable_product_links.map((id) => nameOr(id, () => lk.productSku(id))));
    }
    return out;
}

/** A product row, as a pack holds it. */
export async function productPackForm(lk: ProductLookups, raw: CommerceProduct): Promise<{ product: CommerceProduct }> {
    const { id: _id, created_at: _created, updated_at: _updated, media_gallery_entries: _media, ...product } = raw;
    const setId = raw.attribute_set_id;
    return {
        product: {
            ...product,
            ...(setId !== undefined ? { attribute_set_id: await nameOr(setId, () => lk.setName(setId)) } : {}),
            ...(raw.custom_attributes ? { custom_attributes: await Promise.all(raw.custom_attributes.map((a) => customAttribute(lk, a))) } : {}),
            ...(raw.extension_attributes ? { extension_attributes: await extensionAttributes(lk, raw.extension_attributes) } : {}),
            ...(raw.tier_prices
                ? {
                      tier_prices: await Promise.all(
                          raw.tier_prices.map(async (t) => ({ ...t, customer_group_id: await nameOr(t.customer_group_id, () => lk.groupCode(t.customer_group_id)) })),
                      ),
                  }
                : {}),
        },
    };
}

/** The ids above a category, without the top of the tree (1) or the category itself. */
export function ancestorIds(category: StoreCategory): string[] {
    return (category.path ?? '').split('/').filter(Boolean).slice(1, -1);
}

/** A category row, as a pack holds it: its parents by name from the root, never by id. */
export async function categoryPackForm(lk: ProductLookups, raw: StoreCategory): Promise<{ category: Record<string, unknown> }> {
    const names = await Promise.all(ancestorIds(raw).map(async (id) => (await lk.category(id))?.name ?? id));
    const row: Record<string, unknown> = {
        name: raw.name,
        path: names.join('/'),
        is_active: raw.is_active,
        position: raw.position,
        include_in_menu: raw.include_in_menu,
    };
    if (raw.custom_attributes) {
        row.custom_attributes = raw.custom_attributes.filter((a) => !DERIVED_CATEGORY_FIELDS.has(a.attribute_code));
    }
    return { category: row };
}

/** An attribute row: no ids, and each option by its label, as the export writes it (§2). */
export function attributePackForm<T extends StoreAttribute>(raw: T): { attribute: Record<string, unknown> } {
    const { attribute_id: _id, options, ...attribute } = raw;
    const labelled = (options ?? []).filter((o) => o.value !== '' && (o.label ?? '').trim() !== '');
    return {
        attribute: {
            ...attribute,
            ...(options ? { options: labelled.map((o) => ({ label: o.label, value: o.label })) } : {}),
        },
    };
}

/** A category's place under its root: its parents' names after the root's, then its own. */
function categoryKey(category: { name?: unknown; path?: unknown }): string {
    const segments = [...String(category.path ?? '').split('/').filter(Boolean), String(category.name ?? '')];
    return segments.slice(1).join('/') || ROOT_KEY;
}

type Row = Record<string, unknown>;
const field = (row: unknown, outer: string, inner: string): string => String(((row as Row)[outer] as Row | undefined)?.[inner] ?? '');
const flat = (row: unknown, name: string): string => String((row as Row)[name] ?? '');

/** What a pack calls one row of a kind: the name a repeat install finds it by. */
const KEYS: Record<string, (row: unknown) => string> = {
    products: (row) => field(row, 'product', 'sku'),
    categories: (row) => categoryKey((row as { category: Row }).category),
    product_attributes: (row) => field(row, 'attribute', 'attribute_code'),
    attribute_options: (row) => `${flat(row, 'attribute_code')}/${flat(row, 'label')}`,
    attribute_sets: (row) => field(row, 'attributeSet', 'attribute_set_name'),
    attribute_assign_to_set: (row) => `${flat(row, 'attributeSetId')}/${flat(row, 'attributeCode')}`,
    sources: (row) => field(row, 'source', 'source_code'),
    stocks: (row) => field(row, 'stock', 'name'),
    stock_source_links: (row) => `${field(row, 'stockSourceLink', 'stock_id')}/${field(row, 'stockSourceLink', 'source_code')}`,
};

/** The key of one row of a kind; undefined for a kind that keeps no record. */
export function keyOf(kind: string, row: unknown): string | undefined {
    return KEYS[kind]?.(row);
}
