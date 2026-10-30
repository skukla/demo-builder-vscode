/**
 * The `products` kind: each product the store lacks, made with this store's ids, and removed
 * again by its SKU (DI-5; catalog spec §8).
 *
 * Rows arrive in the order the export wrote them, simple and virtual before the configurable,
 * grouped and bundle products that name them, so a child exists before its parent is made.
 *
 * Where this deliberately differs from the service: a SKU the store already has is left alone
 * and never recorded, so removal cannot delete it. The service posts every row, which
 * overwrites a product the store had, and its removal deletes every SKU the pack names.
 *
 * Not handled here: images. A row names image files by path, and nothing in a pack carries
 * the files; the service sends the paths as they are, and so does this.
 *
 * Endpoints (spec §8): `GET products/{sku}`, `POST products`, `DELETE products/{sku}`.
 *
 * @module features/data-installer/services/demoBuilderEngine/productsKind
 */

import { z } from 'zod';
import { amountsForStore, withoutAmounts } from './giftCardAmounts';
import { deleteIfPresent, type KindContext, readOrNull } from './kindContext';
import { isNumeric, type ProductLookups, productLookups } from './productLookups';
import type { CommerceSend } from '@/types/commerceWire';

export const PRODUCT_KIND = 'products';

/**
 * Gift cards (step 11): products of `type_id` giftcard, made and removed as products are (the
 * service's `GiftCardImportProcessor` posts them to `products` too), recorded under their own kind
 * so a repeat install finds their rows under `giftcards`.
 */
export const GIFT_CARD_KIND = 'giftcards';

/** The kinds whose recorded objects are products, by SKU. */
export const PRODUCT_KINDS: readonly string[] = [PRODUCT_KIND, GIFT_CARD_KIND];

/** Inputs whose values a pack writes as option labels. */
const OPTION_INPUTS = new Set(['select', 'multiselect']);

/**
 * Fields only Commerce's own storefront reads, never an Edge Delivery or headless one. A value
 * the store does not offer is left out, so the product keeps the store's default, rather than
 * stopping the install: every Frescopa product names Page Builder's "product-full-width", which
 * an ACCS store has no option for (first live install, 2026-10-29).
 */
const LAYOUT_FIELDS = new Set(['page_layout', 'custom_layout', 'custom_design']);

/** Told once per layout value the store does not offer. */
type LeftAtDefault = (code: string, value: string) => void;

const productSchema = z
    .object({
        sku: z.string().min(1),
        name: z.string(),
        type_id: z.string(),
        attribute_set_id: z.union([z.string(), z.number()]),
        custom_attributes: z.array(z.object({ attribute_code: z.string(), value: z.unknown() })).optional(),
        /** Code → value, an export form the service turns into custom attributes (`additionalAsCustom`). */
        additional_attributes: z.record(z.unknown()).optional(),
        extension_attributes: z.record(z.unknown()).optional(),
        tier_prices: z
            .array(z.object({ customer_group_id: z.union([z.string(), z.number()]) }).passthrough())
            .optional(),
    })
    .passthrough();

const rowsSchema = z.array(z.object({ product: productSchema }));

export type ProductRow = z.infer<typeof productSchema>;
type CustomAttribute = NonNullable<ProductRow['custom_attributes']>[number];

/** The pack's products, or why they cannot be installed. */
export function parseProductRows(records: unknown): ProductRow[] {
    const parsed = rowsSchema.safeParse(records);
    if (!parsed.success) {
        throw new Error(`The pack's products are not in the shape Commerce takes: ${parsed.error.issues[0]?.message}`);
    }
    return parsed.data.map((row) => row.product);
}

const labels = (value: unknown): string[] =>
    (Array.isArray(value) ? value : String(value).split(',')).map((v) => String(v).trim()).filter(Boolean);

/**
 * A custom attribute's value with labels and url keys turned into this store's ids, or null
 * for a layout field whose value the store does not offer.
 */
async function customAttribute(
    lk: ProductLookups,
    attr: CustomAttribute,
    leftAtDefault: LeftAtDefault,
): Promise<CustomAttribute | null> {
    const { attribute_code: code, value } = attr;
    if (code === 'category_ids') {
        return { attribute_code: code, value: await Promise.all(labels(value).map((key) => (isNumeric(key) ? key : lk.categoryId(key)))) };
    }
    if (value === null || value === undefined || isNumeric(value) || typeof value === 'boolean') return attr;
    const input = (await lk.attribute(code)).frontend_input ?? '';
    if (!OPTION_INPUTS.has(input)) return attr;
    try {
        const ids = await Promise.all(labels(value).map((label) => (isNumeric(label) ? label : lk.optionId(code, label))));
        return { attribute_code: code, value: ids.join(',') };
    } catch (error) {
        if (!LAYOUT_FIELDS.has(code)) throw error;
        leftAtDefault(code, String(value));
        return null;
    }
}

interface ConfigurableOption {
    attribute_id: string | number;
    values?: Array<{ value_index: string | number }>;
    [key: string]: unknown;
}

async function configurableOptions(lk: ProductLookups, options: ConfigurableOption[]): Promise<unknown[]> {
    return Promise.all(
        options.map(async (option) => {
            const code = String(option.attribute_id);
            const attributeId = isNumeric(code) ? code : String((await lk.attribute(code)).attribute_id);
            const values = await Promise.all(
                (option.values ?? []).map(async (v) => ({
                    value_index: Number(isNumeric(v.value_index) ? v.value_index : await lk.optionId(code, String(v.value_index))),
                })),
            );
            return { ...option, attribute_id: attributeId, values };
        }),
    );
}

/** The extension attributes, on this store's website and with this store's ids. */
async function extensionAttributes(lk: ProductLookups, row: ProductRow, websiteId: number): Promise<Record<string, unknown>> {
    const ext = row.extension_attributes ?? {};
    const out: Record<string, unknown> = { ...ext, website_ids: [websiteId] };
    const links = ext.category_links as Array<{ category_id: string | number; position?: number }> | undefined;
    if (links) {
        out.category_links = await Promise.all(
            links.map(async (l) => ({ ...l, category_id: isNumeric(l.category_id) ? String(l.category_id) : await lk.categoryId(String(l.category_id)) })),
        );
    }
    const options = ext.configurable_product_options as ConfigurableOption[] | undefined;
    if (options) out.configurable_product_options = await configurableOptions(lk, options);
    const children = ext.configurable_product_links as Array<string | number> | undefined;
    if (children) out.configurable_product_links = await Promise.all(children.map((c) => (isNumeric(c) ? Number(c) : lk.productId(String(c)))));
    const amounts = await amountsForStore(lk, ext, row.custom_attributes ?? []);
    if (amounts) out.giftcard_amounts = amounts;
    return out;
}

/**
 * The row's custom attributes, with its `additional_attributes` object turned into more of them,
 * each value as text and a missing one as empty, as the service does (`ProductImportProcessor.js`
 * L97-114). The service then drops the row's own custom attributes; here the row's own win, code
 * for code, and the rest are kept.
 */
function additionalAsCustom(row: ProductRow): CustomAttribute[] {
    const own = row.custom_attributes ?? [];
    const added = Object.entries(row.additional_attributes ?? {})
        .filter(([code]) => !own.some((a) => a.attribute_code === code))
        .map(([code, value]) => ({ attribute_code: code, value: value === null || value === undefined ? '' : String(value) }));
    return [...own, ...added];
}

/** The body Commerce is sent for one row. */
export async function toCommerceProduct(
    lk: ProductLookups,
    whole: ProductRow,
    websiteId: number,
    leftAtDefault: LeftAtDefault = () => undefined,
): Promise<{ product: unknown }> {
    const { additional_attributes: _asCustom, ...rest } = whole;
    const row: ProductRow = { ...rest, custom_attributes: additionalAsCustom(whole) };
    const setName = String(row.attribute_set_id);
    const tiers = await Promise.all(
        (row.tier_prices ?? []).map(async (tier) => ({
            ...tier,
            customer_group_id: await lk.groupId(String(tier.customer_group_id)),
            extension_attributes: { ...((tier.extension_attributes as object | undefined) ?? {}), website_id: 0 },
        })),
    );
    return {
        product: {
            ...row,
            attribute_set_id: isNumeric(setName) ? Number(setName) : await lk.setId(setName),
            custom_attributes: (
                await Promise.all(withoutAmounts(row.custom_attributes ?? []).map((a) => customAttribute(lk, a, leftAtDefault)))
            ).filter((a): a is CustomAttribute => a !== null),
            extension_attributes: await extensionAttributes(lk, row, websiteId),
            tier_prices: tiers,
        },
    };
}

/**
 * Make each product the store lacks, in the pack's order, and record it.
 *
 * @param kind - the kind it is recorded under: `products`, or `giftcards` for a pack's gift cards
 */
export async function installProducts(ctx: KindContext, rows: readonly ProductRow[], kind = PRODUCT_KIND): Promise<void> {
    const websiteId = ctx.session.websiteId;
    if (websiteId === undefined) throw new Error('The install target names no website, so the pack\'s products have nowhere to be sold.');
    const lk = productLookups(ctx);
    const told = new Set<string>();
    const leftAtDefault: LeftAtDefault = (code, value) => {
        const key = `${code}=${value}`;
        if (told.has(key)) return;
        told.add(key);
        ctx.log(`left ${code} "${value}" at the store's default: the store does not offer it`);
    };
    for (const row of rows) {
        if (PRODUCT_KINDS.some((k) => ctx.recorder.has(k, row.sku))) continue;
        if (await readOrNull(ctx.get, `products/${encodeURIComponent(row.sku)}`)) {
            ctx.log(`left ${row.sku} alone: the store already has it`);
            continue;
        }
        await ctx.send('POST', 'products', await toCommerceProduct(lk, row, websiteId, leftAtDefault));
        await ctx.recorder.record({ kind, id: row.sku });
        ctx.log(`created product ${row.sku}`);
    }
}

/** Take back one product this engine made. */
export function removeProduct(send: CommerceSend, sku: string): Promise<void> {
    return deleteIfPresent(send, `products/${encodeURIComponent(sku)}`);
}
