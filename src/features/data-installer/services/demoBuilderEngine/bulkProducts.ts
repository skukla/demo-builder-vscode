/**
 * Products made through Commerce's bulk queue (owner, 2026-11-05): one call carries a batch, where
 * the single route took 13–25 s per product on ACCS (live, 2026-09-30) and Luma has 2,046.
 *
 * What a batch reports is what a single create reports. Each request's end is read back by its
 * index (`readBulkRows`): one Commerce made is recorded and logged; one it refused is skipped with
 * Commerce's words, as `tryRow` skips a refused single create; one it says can be retried, or that
 * is still queued when the follow gives up, is sent again on its own. A store whose queue does not
 * run therefore still gets every product, one call at a time, and Debug Logs says so. Sending a
 * queued row again is safe: a create by SKU that runs twice saves the same product twice.
 *
 * Every row is a pending entry before its batch is sent (`pendingCreates.ts`), so a batch that gets
 * no answer is settled by the next install or removal, as a single create is.
 *
 * Endpoints: `POST V1/async/bulk/products`, `GET bulk/{uuid}/status`, and `GET products` filtered
 * to a list of SKUs for which ones the store has (`id` and `sku` only).
 *
 * @module features/data-installer/services/demoBuilderEngine/bulkProducts
 */

import type { CreatedObject } from './installRecord';
import { type KindContext, newCatalogSession, readOrNull } from './kindContext';
import { certainlyNotMade } from './pendingCreates';
import type { PendingObject } from './pendingRecord';
import { reasonOf, skipRow } from './refusedRows';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    type BulkFollowDeps,
    type BulkRow,
    followBulk,
    readBulkRows,
    startBulk,
} from '@/features/app-builder/services/commerceBulk';
import { CommerceReadError, readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceGet } from '@/types/commerceWire';

/**
 * Products per bulk call. 43 went in one call on ACCS (2026-09-30); the store's own ceiling is its
 * "Maximum Entities per Bulk Request" setting, and a call over it is refused whole, which sends
 * that batch one at a time rather than stopping.
 */
export const PRODUCTS_PER_BULK = 50;

/** SKUs per read of which ones the store has: short enough for any address. */
const SKUS_PER_READ = 100;

/** One product to make: its SKU and the body `POST products` takes. */
export interface ProductToMake {
    sku: string;
    body: unknown;
}

/** How a batch is waited on: the shared bulk follow's clock, injected so a test does not wait. */
export type BulkWait = Pick<BulkFollowDeps, 'sleep' | 'now' | 'intervalMs' | 'deadlineMs'>;

export const BULK_WAIT: BulkWait = {
    sleep,
    now: () => Date.now(),
    intervalMs: TIMEOUTS.COMMERCE_BULK_POLL_INTERVAL,
    deadlineMs: TIMEOUTS.COMMERCE_BULK_MAX,
};

/** What the batches are for, and how far they have got, for the progress line. */
export interface BulkRun {
    kind: string;
    /** "products" or "gift cards", as the progress line says them. */
    noun: string;
    total: number;
    done: number;
    /** Make one product on its own, as the single route does (a row to send again, or a refused batch). */
    single: (product: ProductToMake) => Promise<void>;
}

/** A filter on `sku` naming these SKUs, each escaped; a SKU holding a comma cannot be named in one. */
function skuFilter(skus: readonly string[]): string {
    return (
        '&searchCriteria[filterGroups][0][filters][0][field]=sku' +
        '&searchCriteria[filterGroups][0][filters][0][conditionType]=in' +
        `&searchCriteria[filterGroups][0][filters][0][value]=${skus.map(encodeURIComponent).join(',')}` +
        '&fields=items[id,sku],total_count'
    );
}

/**
 * Which of these SKUs the store has, with their ids, by lowercased SKU (Commerce matches a SKU
 * whatever its case). A hundred at a time; a SKU with a comma in it is read on its own.
 */
export async function productIdsInStore(
    get: CommerceGet,
    skus: readonly string[],
): Promise<Map<string, number>> {
    const found = new Map<string, number>();
    const listable = skus.filter((sku) => !sku.includes(','));
    for (let start = 0; start < listable.length; start += SKUS_PER_READ) {
        const page = await readAllPages<{ id?: number; sku?: string }>(
            get,
            'products',
            skuFilter(listable.slice(start, start + SKUS_PER_READ)),
        );
        for (const item of page)
            if (item.sku && item.id !== undefined) found.set(item.sku.toLowerCase(), item.id);
    }
    for (const sku of skus.filter((s) => s.includes(','))) {
        const item = await readOrNull<{ id?: number }>(get, `products/${encodeURIComponent(sku)}`);
        if (item?.id !== undefined) found.set(sku.toLowerCase(), item.id);
    }
    return found;
}

/** The rows of one batch, sorted by how each ended. */
function sortRows(batch: readonly ProductToMake[], rows: readonly BulkRow[]) {
    const pick = (...states: BulkRow['state'][]) =>
        rows
            .filter((r) => states.includes(r.state))
            .map((r) => ({ product: batch[r.index], message: r.message }));
    return { made: pick('done'), refused: pick('refused'), again: pick('retry', 'open') };
}

/**
 * A whole bulk call refused for its shape rather than the store's state: more in one call than the
 * store's setting allows, or a body too large (400, 413), or a store with no bulk route (404).
 * That batch is sent one at a time. Anything else (not signed in, too many calls, Commerce failing,
 * no answer) stops the install, as it stops a single create.
 */
const SHAPE_REFUSALS = new Set([400, 404, 413]);

/** Whether a bulk call was refused for its shape, so its batch goes one at a time (`SHAPE_REFUSALS`). */
export function refusedForShape(error: unknown): boolean {
    return error instanceof CommerceReadError && SHAPE_REFUSALS.has(error.status ?? 0);
}

/** Why a bulk call was refused, in Commerce's words, or its status when it said nothing. */
export function bulkRefusalWords(error: unknown): string {
    const said = reasonOf(newCatalogSession(), error).trim();
    return said || `HTTP ${error instanceof CommerceReadError ? error.status : '?'}`;
}

/** Send one batch and follow it; undefined when Commerce refused the whole call, so nothing was made. */
async function sendBatch(
    ctx: KindContext,
    run: BulkRun,
    batch: readonly ProductToMake[],
    wait: BulkWait,
): Promise<BulkRow[] | undefined> {
    let uuid: string;
    try {
        uuid = await startBulk(
            ctx.send,
            'POST',
            'products',
            batch.map((p) => p.body),
        );
    } catch (error) {
        if (!refusedForShape(error)) throw error;
        ctx.log(
            `Commerce refused ${batch.length} ${run.noun} sent together (${bulkRefusalWords(error)}); sending them one at a time`,
        );
        return undefined;
    }
    const before = run.done;
    await followBulk(ctx.get, uuid, batch.length, {
        ...wait,
        onProgress: (done) =>
            ctx.progress?.(
                `${(before + done).toLocaleString('en-US')} of ${run.total.toLocaleString('en-US')} ${run.noun}`,
            ),
    });
    return readBulkRows(ctx.get, uuid, batch.length);
}

/** One batch: pending first, then each row recorded, skipped, or sent again on its own. */
async function makeBatch(
    ctx: KindContext,
    run: BulkRun,
    batch: readonly ProductToMake[],
    wait: BulkWait,
): Promise<void> {
    const pendingOf = (products: readonly ProductToMake[]): PendingObject[] =>
        products.map((p) => ({ kind: run.kind, key: p.sku, id: p.sku }));
    await ctx.recorder.markPending(pendingOf(batch));
    let rows: BulkRow[] | undefined;
    try {
        rows = await sendBatch(ctx, run, batch, wait);
    } catch (error) {
        if (certainlyNotMade(error)) await ctx.recorder.forgetPending(pendingOf(batch));
        throw error;
    }
    if (!rows) {
        await ctx.recorder.forgetPending(pendingOf(batch));
        for (const product of batch) await run.single(product);
        run.done += batch.length;
        return;
    }
    const { made, refused, again } = sortRows(batch, rows);
    const objects: CreatedObject[] = made.map(({ product }) => ({
        kind: run.kind,
        id: product.sku,
    }));
    await ctx.recorder.confirm(pendingOf(made.map((m) => m.product)), objects);
    for (const { product } of made) ctx.log(`created product ${product.sku}`);
    await ctx.recorder.forgetPending(pendingOf(refused.map((r) => r.product)));
    for (const { product, message } of refused)
        skipRow(ctx, { kind: run.kind, key: product.sku, reason: message });
    for (const { product, message } of again) {
        ctx.log(
            `product ${product.sku} did not finish in the bulk queue (${message}); sending it on its own`,
        );
        await run.single(product);
    }
    run.done += batch.length;
}

/**
 * Make these products through the bulk queue, a batch at a time, then learn their ids for the
 * parents that link them (`CatalogSession.productIds`).
 *
 * @param products - one wave: none of them links another in the same call
 * @throws whatever a single create throws that is not the row's fault, and a bulk call with no answer
 */
export async function createProductsInBulk(
    ctx: KindContext,
    run: BulkRun,
    products: readonly ProductToMake[],
    wait: BulkWait = BULK_WAIT,
): Promise<void> {
    for (let start = 0; start < products.length; start += PRODUCTS_PER_BULK) {
        await makeBatch(ctx, run, products.slice(start, start + PRODUCTS_PER_BULK), wait);
    }
    const ids = await productIdsInStore(
        ctx.get,
        products.map((p) => p.sku),
    );
    const known = (ctx.session.productIds ??= new Map());
    for (const [sku, id] of ids) known.set(sku, id);
}
