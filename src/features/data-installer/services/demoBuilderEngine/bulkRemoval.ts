/**
 * A pack's products taken back through Commerce's bulk queue (owner, 2026-11-05), so removing
 * Luma's 2,046 is a few dozen calls rather than one per product.
 *
 * `DELETE V1/async/bulk/products/bySku`, one `{ sku }` per product. Adobe's bulk page shows DELETE
 * on the bulk route (developer.adobe.com/commerce/webapi/rest/use-rest/bulk-endpoints/); it has not
 * been run against an ACCS store from here. So nothing depends on it: a call Commerce refuses for
 * its shape (`refusedForShape`), or a product its queue did not finish, is taken back on its own
 * as before, and a product already gone counts as taken back there (`deleteIfPresent`).
 *
 * The record loses a batch's products in one write, once Commerce says each is gone.
 *
 * @module features/data-installer/services/demoBuilderEngine/bulkRemoval
 */

import { BULK_WAIT, type BulkWait, bulkRefusalWords, PRODUCTS_PER_BULK, refusedForShape } from './bulkProducts';
import type { CreatedObject, InstallRecorder } from './installRecord';
import type { RemovalAccess } from './removers';
import { followBulk, readBulkRows, startBulk } from '@/features/app-builder/services/commerceBulk';

/** Commerce, and where a removal says which way each batch went (Debug Logs). */
export type BulkRemovalAccess = RemovalAccess & { log?: (line: string) => void };

/** How one product is taken back on its own: the removal's own take-back and record drop. */
export type TakeBackOne = (object: CreatedObject) => Promise<void>;

async function removeBatch(
    commerce: BulkRemovalAccess,
    recorder: Pick<InstallRecorder, 'drop'>,
    batch: readonly CreatedObject[],
    one: TakeBackOne,
    wait: BulkWait,
): Promise<void> {
    let uuid: string;
    try {
        uuid = await startBulk(commerce.send, 'DELETE', 'products/bySku', batch.map((o) => ({ sku: o.id })));
    } catch (error) {
        if (!refusedForShape(error)) throw error;
        commerce.log?.(`Commerce refused taking ${batch.length} products back together (${bulkRefusalWords(error)}); taking them back one at a time`);
        for (const object of batch) await one(object);
        return;
    }
    await followBulk(commerce.get, uuid, batch.length, wait);
    const rows = await readBulkRows(commerce.get, uuid, batch.length);
    const gone = rows.filter((r) => r.state === 'done').map((r) => batch[r.index]);
    await recorder.drop(...gone);
    commerce.log?.(`took back ${gone.length} of ${batch.length} products in one bulk call`);
    for (const row of rows.filter((r) => r.state !== 'done')) {
        commerce.log?.(`product ${batch[row.index].id} did not finish in the bulk queue (${row.message}); taking it back on its own`);
        await one(batch[row.index]);
    }
}

/**
 * Take these recorded products back, fifty at a time.
 *
 * @param products - products and gift cards from the record, by SKU
 * @param one - takes one back on its own and drops it from the record
 * @throws what `one` throws, and a bulk call refused for anything but its shape
 */
export async function removeProductsInBulk(
    commerce: BulkRemovalAccess,
    recorder: Pick<InstallRecorder, 'drop'>,
    products: readonly CreatedObject[],
    one: TakeBackOne,
    wait: BulkWait = BULK_WAIT,
): Promise<void> {
    for (let start = 0; start < products.length; start += PRODUCTS_PER_BULK) {
        await removeBatch(commerce, recorder, products.slice(start, start + PRODUCTS_PER_BULK), one, wait);
    }
}
