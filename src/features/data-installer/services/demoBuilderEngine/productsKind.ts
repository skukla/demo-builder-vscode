/**
 * The `products` kind: each product the store lacks, made with this store's ids, and removed
 * again by its SKU (DI-5; catalog spec §8).
 *
 * Products go through Commerce's bulk queue in two waves (`bulkProducts.ts`): everything that
 * links nothing, then the configurable, bundle and grouped products that link them, so a child
 * exists before its parent is made whatever order the pack holds them in.
 *
 * Where this deliberately differs from the service: a SKU the store already has is left alone
 * and never recorded, so removal cannot delete it. The service posts every row, which
 * overwrites a product the store had, and its removal deletes every SKU the pack names.
 *
 * Not handled here: images. A row names image files by path, and nothing in a pack carries
 * the files; the service sends the paths as they are, and so does this.
 *
 * Endpoints (spec §8): `GET products` filtered to the pack's SKUs, `POST V1/async/bulk/products`
 * (and `POST products` for a row the queue did not finish), `DELETE products/{sku}`.
 *
 * @module features/data-installer/services/demoBuilderEngine/productsKind
 */

import { z } from 'zod';
import { BULK_WAIT, type BulkRun, type BulkWait, createProductsInBulk, productIdsInStore, type ProductToMake } from './bulkProducts';
import { amountsForStore, withoutAmounts } from './giftCardAmounts';
import { deleteIfPresent, type KindContext, MissingNameError } from './kindContext';
import { createOne } from './pendingCreates';
import { isNumeric, type ProductLookups, productLookups } from './productLookups';
import { tryRow } from './refusedRows';
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
 * The option id for one value: by label (or the option's own id) first, and a number Commerce has no
 * option for kept as it was, an id from the store the pack came from. A number used to be taken as an
 * id outright, so Luma's size "32" set option 32 where its option was "Size 32" (2026-11-06).
 */
async function optionOf(lk: ProductLookups, code: string, label: string): Promise<string> {
    if (!isNumeric(label)) return lk.optionId(code, label);
    try {
        return await lk.optionId(code, label);
    } catch (error) {
        if (error instanceof MissingNameError) return label;
        throw error;
    }
}

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
    if (value === null || value === undefined || typeof value === 'boolean') return attr;
    let input: string;
    try {
        input = (await lk.attribute(code)).frontend_input ?? '';
    } catch (error) {
        // A number on an attribute that cannot be read goes as it is, as every number used to.
        if (isNumeric(value)) return attr;
        throw error;
    }
    if (!OPTION_INPUTS.has(input)) return attr;
    try {
        const ids = await Promise.all(labels(value).map((label) => optionOf(lk, code, label)));
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
                    value_index: Number(await optionOf(lk, code, String(v.value_index))),
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

/** Products that link others, made in a second wave once the ones they link exist. */
const LINKING_TYPES = new Set(['configurable', 'bundle', 'grouped']);

/** The rows in waves: everything that links nothing, then everything that links (`bulkProducts.ts`). */
function waves(rows: readonly ProductRow[]): ProductRow[][] {
    const leaves = rows.filter((row) => !LINKING_TYPES.has(row.type_id));
    const parents = rows.filter((row) => LINKING_TYPES.has(row.type_id));
    return [leaves, parents].filter((wave) => wave.length > 0);
}

/** One product on its own through `POST products`: a row the bulk queue did not finish, or a batch it refused. */
async function createSingle(ctx: KindContext, kind: string, product: ProductToMake): Promise<void> {
    // Step 14 item 3: a product Commerce refuses is skipped, and the install carries on.
    const made = await tryRow(ctx, { kind, key: product.sku }, () =>
        createOne(ctx, { kind, key: product.sku, id: product.sku }, async () => {
            await ctx.send('POST', 'products', product.body);
            return { kind, id: product.sku };
        }),
    );
    if (made) ctx.log(`created product ${product.sku}`);
}

/**
 * Make each product the store lacks and record it, through the bulk queue (`bulkProducts.ts`).
 *
 * @param kind - the kind it is recorded under: `products`, or `giftcards` for a pack's gift cards
 * @param wait - how a batch is waited on (injected for tests)
 */
export async function installProducts(ctx: KindContext, rows: readonly ProductRow[], kind = PRODUCT_KIND, wait: BulkWait = BULK_WAIT): Promise<void> {
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
    const todo = rows.filter((row) => !PRODUCT_KINDS.some((k) => ctx.recorder.has(k, row.sku)));
    const there = await productIdsInStore(ctx.get, todo.map((row) => row.sku));
    const known = (ctx.session.productIds ??= new Map());
    for (const [sku, id] of there) known.set(sku, id);
    const fresh = todo.filter((row) => !there.has(row.sku.toLowerCase()));
    for (const row of todo) if (there.has(row.sku.toLowerCase())) ctx.log(`left ${row.sku} alone: the store already has it`);
    const run: BulkRun = {
        kind,
        noun: kind === GIFT_CARD_KIND ? 'gift cards' : 'products',
        total: fresh.length,
        done: 0,
        single: (product) => createSingle(ctx, kind, product),
    };
    for (const wave of waves(fresh)) {
        const prepared: ProductToMake[] = [];
        for (const row of wave) {
            // A row naming something the store lacks, or a row that was skipped, is skipped too.
            const body = await tryRow(ctx, { kind, key: row.sku }, () => toCommerceProduct(lk, row, websiteId, leftAtDefault));
            if (body) prepared.push({ sku: row.sku, body });
            else run.total -= 1;
        }
        await createProductsInBulk(ctx, run, prepared, wait);
    }
}

/** Take back one product this engine made. */
export function removeProduct(send: CommerceSend, sku: string): Promise<void> {
    return deleteIfPresent(send, `products/${encodeURIComponent(sku)}`);
}
