/**
 * The `source_items` kind: how many of each product each warehouse holds (DI-5; catalog
 * spec §9).
 *
 * Quantities are set only for products this install made. A product the store already had
 * keeps its own quantities: the products kind left it alone, and so does this. Nothing is
 * recorded, because removal has nothing to take back: deleting a product takes its quantities
 * with it.
 *
 * The service sends the whole list in one call; this sends it in batches, since a pack's list
 * runs to hundreds of rows and one signed call carries them all, five batches at once (2026-11-06:
 * Luma's 1,901 took 54 s one call after another, about 2.7 s a call). Each batch names other SKUs,
 * so the order they land in does not matter.
 *
 * Endpoint (spec §9): `POST inventory/source-items` with `{ sourceItems }`.
 *
 * @module features/data-installer/services/demoBuilderEngine/sourceItemsKind
 */

import { z } from 'zod';
import { type KindContext, eachFewAtOnce } from './kindContext';
import { PRODUCT_KINDS } from './productKinds';

/** Rows per call. */
const BATCH = 100;

const packSchema = z.object({
    sourceItems: z.array(
        z.object({ sku: z.string().min(1), source_code: z.string().min(1), quantity: z.number(), status: z.number() }).passthrough(),
    ),
});

export type SourceItemsPack = z.infer<typeof packSchema>;

/** The pack's quantities, or why they cannot be installed. */
export function parseSourceItems(records: unknown): SourceItemsPack {
    const parsed = packSchema.safeParse(records);
    if (!parsed.success) {
        throw new Error(`The datapack's stock quantities are not in the shape Commerce takes: ${parsed.error.issues[0]?.message}`);
    }
    return parsed.data;
}

/**
 * Set the quantities of the products this install made, a batch at a time. Installing again
 * sets none for a product an earlier install made (step 05): its quantities may be the SC's.
 */
export async function installSourceItems(ctx: KindContext, pack: SourceItemsPack): Promise<void> {
    const before = ctx.session.productsBefore ?? new Set<string>();
    const ours = pack.sourceItems.filter((item) => PRODUCT_KINDS.some((kind) => ctx.recorder.has(kind, item.sku)) && !before.has(item.sku));
    const batches = Array.from({ length: Math.ceil(ours.length / BATCH) }, (_, i) => ours.slice(i * BATCH, (i + 1) * BATCH));
    let done = 0;
    await eachFewAtOnce(batches, async (batch) => {
        await ctx.send('POST', 'inventory/source-items', { sourceItems: batch });
        done += batch.length;
        ctx.progress?.(`${done.toLocaleString('en-US')} of ${ours.length.toLocaleString('en-US')} stock quantities`);
    });
    ctx.log(`set ${ours.length} stock quantities; left ${pack.sourceItems.length - ours.length} for products the store already had`);
}
