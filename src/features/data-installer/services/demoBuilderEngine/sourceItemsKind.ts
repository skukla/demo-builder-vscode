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
 * runs to hundreds of rows and one signed call carries them all.
 *
 * Endpoint (spec §9): `POST inventory/source-items` with `{ sourceItems }`.
 *
 * @module features/data-installer/services/demoBuilderEngine/sourceItemsKind
 */

import { z } from 'zod';
import type { KindContext } from './kindContext';
import { PRODUCT_KINDS } from './productsKind';

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
        throw new Error(`The pack's stock quantities are not in the shape Commerce takes: ${parsed.error.issues[0]?.message}`);
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
    for (let start = 0; start < ours.length; start += BATCH) {
        await ctx.send('POST', 'inventory/source-items', { sourceItems: ours.slice(start, start + BATCH) });
    }
    ctx.log(`set ${ours.length} stock quantities; left ${pack.sourceItems.length - ours.length} for products the store already had`);
}
