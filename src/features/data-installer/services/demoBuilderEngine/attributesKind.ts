/**
 * The `product_attributes` kind: install creates each attribute the store lacks and, for one it
 * already has, only the options it lacks; removal takes back exactly those (DI-5).
 *
 * Where this deliberately differs from the service (catalog spec §1, "Where Demo Builder's
 * engine deliberately differs"): the service deletes and re-creates an attribute that already
 * exists, which drops it from every attribute set and wipes its values from every product.
 * This never deletes anything it did not create.
 *
 * Endpoints, from the spec and Magento's ProductAttributeRepository and
 * ProductAttributeOptionManagement routes: `GET|DELETE products/attributes/{code}`,
 * `POST products/attributes`, `GET|POST products/attributes/{code}/options`,
 * `DELETE products/attributes/{code}/options/{optionId}`.
 *
 * @module features/data-installer/services/demoBuilderEngine/attributesKind
 */

import { z } from 'zod';
import { sameText } from './b2bReads';
import { ATTRIBUTE_CODE, deleteIfPresent, type KindContext, ownedId, readOrNull, segment } from './kindContext';
import type { CommerceSend } from '@/types/commerceWire';

export const ATTRIBUTE_KIND = 'product_attributes';
/** An option added to an attribute the store already had; id is `<code>/<option id>`. */
export const ATTRIBUTE_OPTION_KIND = 'attribute_options';

/**
 * Swatch attributes are made in the service's two steps (spec §1 step 6;
 * `ProductAttributeImportProcessor.js` L338-352, L475-525): the attribute without its options or
 * default, then each option through the options route, its `value` the swatch (a colour or a
 * text). The service says Commerce does not store the swatch when options come with the create.
 * Not yet run against a live store from here.
 */
const SWATCH_INPUTS = new Set(['swatch_visual', 'swatch_text']);

const optionSchema = z
    .object({ label: z.string(), value: z.unknown().optional(), sort_order: z.unknown().optional(), is_default: z.unknown().optional() })
    .passthrough();

const rowSchema = z.object({
    attribute: z
        .object({
            attribute_code: z.string().regex(ATTRIBUTE_CODE, 'is not a Commerce attribute code'),
            frontend_input: z.string(),
            options: z.array(optionSchema).optional(),
            frontend_labels: z.array(z.object({ store_id: z.number(), label: z.string() })).optional(),
        })
        .passthrough(),
});

export type AttributeRow = z.infer<typeof rowSchema>;
type PackOption = z.infer<typeof optionSchema>;

interface StoreOption {
    label?: string;
    value?: string;
}

/** The pack's rows, or why they cannot be installed. */
export function parseAttributeRows(records: unknown): AttributeRow[] {
    const parsed = z.array(rowSchema).safeParse(records);
    if (!parsed.success) {
        throw new Error(`The pack's product attributes are not in the shape Commerce takes: ${parsed.error.issues[0]?.message}`);
    }
    return parsed.data;
}

/** Create what the store lacks, record it, and leave what it has alone. */
export async function installAttributes(ctx: KindContext, rows: readonly AttributeRow[]): Promise<void> {
    for (const row of rows) {
        const code = row.attribute.attribute_code;
        // One this engine made and the SC deleted since stays deleted (step 05).
        if (ownedId(ctx.session, ATTRIBUTE_KIND, code) === null) continue;
        const existing = await readOrNull<object>(ctx.get, `products/attributes/${segment(code)}`);
        if (existing && !ctx.recorder.has(ATTRIBUTE_KIND, code)) {
            await addMissingOptions(ctx, code, row.attribute.options ?? [], row.attribute.frontend_input);
            continue;
        }
        if (!existing) await createAttribute(ctx, row);
    }
}

/** Whether a row is a swatch, made in two steps. */
const isSwatch = (input: string | undefined): boolean => SWATCH_INPUTS.has(input ?? '');

async function createAttribute(ctx: KindContext, row: AttributeRow): Promise<void> {
    // An id from the store the pack was exported from means nothing here (the service strips it too).
    const { attribute_id: _sourceId, ...whole } = row.attribute;
    const swatch = isSwatch(whole.frontend_input);
    // A swatch's default names an option not made yet (the service drops it too).
    const { options: _later, default_value: _default, ...withoutOptions } = whole;
    const attribute = swatch ? withoutOptions : whole;
    const labels = attribute.frontend_labels?.map((l) => ({ ...l, store_id: ctx.session.storeId }));
    await ctx.send('POST', 'products/attributes', {
        attribute: { ...attribute, ...(labels ? { frontend_labels: labels } : {}) },
    });
    await ctx.recorder.record({ kind: ATTRIBUTE_KIND, id: attribute.attribute_code });
    ctx.log(`created attribute ${attribute.attribute_code}`);
    if (!swatch) return;
    // Its options go with it on removal, so they are not recorded one by one.
    for (const option of whole.options ?? []) await sendOption(ctx, whole.attribute_code, swatchOption(option));
}

/** The service's body for one swatch option (`_addSwatchOptions`, L475-525). */
function swatchOption(option: PackOption): Record<string, unknown> {
    return {
        label: option.label,
        value: option.value === undefined ? '' : String(option.value),
        sort_order: option.sort_order ?? 0,
        is_default: option.is_default === true || option.is_default === 'true',
        ...(Array.isArray(option.store_labels) ? { store_labels: option.store_labels } : {}),
    };
}

function sendOption(ctx: KindContext, code: string, option: Record<string, unknown>): Promise<unknown> {
    return ctx.send('POST', `products/attributes/${segment(code)}/options`, { option });
}

async function readOptions(ctx: KindContext, code: string): Promise<StoreOption[]> {
    return (await ctx.get(`products/attributes/${segment(code)}/options`)) as StoreOption[] | null ?? [];
}

/**
 * Add the pack's options an existing attribute lacks, matched by label. The new option's id is
 * read back by label rather than taken from the POST's answer, whose shape no live answer in
 * this repo records.
 *
 * @param input - the row's `frontend_input`: a swatch option keeps its `value`, which is the
 *   swatch; any other option's `value` is the source store's option id and is dropped
 */
export async function addMissingOptions(ctx: KindContext, code: string, options: readonly PackOption[], input?: string): Promise<void> {
    const have = await readOptions(ctx, code);
    const missing = options.filter((o) => !have.some((h) => sameText(h.label, o.label)));
    for (const option of missing) {
        const { value: _sourceValue, ...body } = option;
        await sendOption(ctx, code, isSwatch(input) ? swatchOption(option) : body);
        const added = (await readOptions(ctx, code)).find((h) => sameText(h.label, option.label));
        if (!added?.value) throw new Error(`Commerce did not keep the option "${option.label}" on ${code}.`);
        await ctx.recorder.record({ kind: ATTRIBUTE_OPTION_KIND, id: `${code}/${added.value}` });
        ctx.log(`added option "${option.label}" to ${code}`);
    }
}

/** Take back one attribute this engine created. */
export function removeAttribute(send: CommerceSend, code: string): Promise<void> {
    return deleteIfPresent(send, `products/attributes/${segment(code)}`);
}

/** Take back one option this engine added; `id` is `<code>/<option id>`. */
export function removeAttributeOption(send: CommerceSend, id: string): Promise<void> {
    const [code, optionId] = id.split('/');
    return deleteIfPresent(send, `products/attributes/${segment(code)}/options/${segment(optionId)}`);
}
