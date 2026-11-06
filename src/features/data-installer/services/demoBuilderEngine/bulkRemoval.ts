/**
 * Products deleted through Commerce's Import API in delete mode (owner, 2026-11-06: removing Luma one
 * product at a time took about 24 minutes, "way too long"). Every path that deletes products uses it:
 * a pack's removal (`removePack`), installing a pack again where it no longer has a product
 * (`repeatInstall.applyRemovals`), and Clear Demo Data (`demoDataWipe/wipeRun.ts`).
 *
 * `POST V1/import/json` with `{ source: { entity: 'catalog_product', behavior: 'delete', … items:
 * [{ sku }] } }`. ACCS takes the JSON form, not the CSV one, and `catalog_product` has a delete mode
 * (developer.adobe.com/commerce/webapi/rest/modules/import/). It is the Data Installer service's own
 * route for removing a pack's bulk products: `ProductExportDeleteProcessor` strips the rows to SKUs
 * and sends them in one import with the mode switched to delete. Unlike it, the answer is not trusted
 * here: the SKUs are read back after each call (`skusInStore`), and only one the store no longer
 * has counts as gone. The service's `products` kind deletes one product per call, as this engine did.
 *
 * The bulk queue's delete was tried first and does not work on ACCS: Commerce accepted every batch
 * and failed every row, "The product couldn't be removed" (live, 2026-11-06, 25 of 25 batches). A
 * product delete needs Commerce's "secure area", which its queue workers probably do not run in; that
 * cause is inferred, not verified.
 *
 * @module features/data-installer/services/demoBuilderEngine/bulkRemoval
 */

import { bulkRefusalWords, skusInStore, refusedForShape } from './bulkProducts';
import type { CreatedObject, InstallRecorder } from './installRecord';
import { PRODUCT_KINDS, removeProduct } from './productsKind';
import type { RemovalAccess } from './removers';

/** SKUs per delete call: the import runs inside the request, so a call stays well inside its wait. */
export const PRODUCTS_PER_IMPORT_DELETE = 200;

/** Products taken back on their own at once, when they must be: one at a time took 24 minutes for Luma. */
export const SINGLE_DELETES_AT_ONCE = 5;

/** Commerce, and where a removal says which way each batch went (Debug Logs). */
export type BulkRemovalAccess = RemovalAccess & { log?: (line: string) => void };

/** Take one product back on its own (`takeBack`); the record is written by the caller, once per group. */
export type TakeBackOne = (object: CreatedObject) => Promise<void>;

/** The delete-mode import of these SKUs. Every row is attempted; the read-back decides what went. */
function deleteImport(skus: readonly string[]): unknown {
    return {
        source: {
            entity: 'catalog_product',
            behavior: 'delete',
            validation_strategy: 'validation-skip-errors',
            allowed_error_count: String(skus.length),
            items: skus.map((sku) => ({ sku })),
        },
    };
}

/**
 * Delete these SKUs through the Import API, two hundred to a call, and answer which are gone, by
 * lowercased SKU (Commerce matches a SKU whatever its case). A SKU still there, or in a call the store
 * refused for its shape (no Import API, say), is not in the answer: the caller deletes it on its own.
 *
 * @throws an import refused for anything but its shape (not signed in, throttled, no answer)
 */
export async function deleteByImport(
    commerce: BulkRemovalAccess,
    skus: readonly string[],
): Promise<Set<string>> {
    const gone = new Set<string>();
    for (let start = 0; start < skus.length; start += PRODUCTS_PER_IMPORT_DELETE) {
        const batch = skus.slice(start, start + PRODUCTS_PER_IMPORT_DELETE);
        try {
            await commerce.send('POST', 'import/json', deleteImport(batch));
        } catch (error) {
            if (!refusedForShape(error)) throw error;
            commerce.log?.(
                `Commerce refused deleting ${batch.length} products in one import (${bulkRefusalWords(error)}); deleting them on their own`,
            );
            continue;
        }
        const still = await skusInStore(commerce.get, batch);
        const left = batch.filter((sku) => still.has(sku.toLowerCase()));
        for (const sku of batch) if (!still.has(sku.toLowerCase())) gone.add(sku.toLowerCase());
        commerce.log?.(
            `deleted ${batch.length - left.length} of ${batch.length} products in one import`,
        );
        if (left.length > 0)
            commerce.log?.(
                `${left.length} still in the store after the import (${left.slice(0, 3).join(', ')}); deleting them on their own`,
            );
    }
    return gone;
}

/**
 * A delete for each of these SKUs, for a caller that deletes and reports them one at a time (Clear
 * Demo Data's runner): the first call sends the import for all of them and reads them back; then a
 * SKU the import took is done, and one it did not is deleted on its own (`single`, by default
 * `removeProduct`).
 */
export function afterImportDelete(
    commerce: BulkRemovalAccess,
    skus: readonly string[],
    single: (sku: string) => Promise<void> = (sku) => removeProduct(commerce.send, sku),
): (sku: string) => Promise<void> {
    let imported: Promise<Set<string>> | undefined;
    return async (sku) => {
        imported ??= deleteByImport(commerce, skus);
        if ((await imported).has(sku.toLowerCase())) return;
        await single(sku);
    };
}

/**
 * Take these back on their own, a few at a time, dropping each group's successes in one write.
 *
 * @throws the first failure, after the products taken back before it have left the record
 */
async function takeBackEach(
    recorder: Pick<InstallRecorder, 'drop'>,
    objects: readonly CreatedObject[],
    one: TakeBackOne,
): Promise<void> {
    for (let start = 0; start < objects.length; start += SINGLE_DELETES_AT_ONCE) {
        const group = objects.slice(start, start + SINGLE_DELETES_AT_ONCE);
        const results = await Promise.allSettled(group.map((object) => one(object)));
        await recorder.drop(...group.filter((_, i) => results[i].status === 'fulfilled'));
        const failed = results.find(
            (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (failed) throw failed.reason;
    }
}

/**
 * Take these recorded products back: through the Import API, then any left on their own.
 *
 * @param products - products and gift cards from the record, by SKU
 * @param one - takes one back on its own (not the record: that is written here, once per group)
 * @throws what `one` throws, and an import refused for anything but its shape
 */
export async function removeProductsInBulk(
    commerce: BulkRemovalAccess,
    recorder: Pick<InstallRecorder, 'drop'>,
    products: readonly CreatedObject[],
    one: TakeBackOne,
): Promise<void> {
    const gone = await deleteByImport(
        commerce,
        products.map((object) => object.id),
    );
    await recorder.drop(...products.filter((object) => gone.has(object.id.toLowerCase())));
    await takeBackEach(
        recorder,
        products.filter((object) => !gone.has(object.id.toLowerCase())),
        one,
    );
}

/** The objects in order, split where they change between products and everything else. */
export function productRuns(objects: readonly CreatedObject[]): CreatedObject[][] {
    const runs: CreatedObject[][] = [];
    for (const object of objects) {
        const last = runs[runs.length - 1];
        if (last && PRODUCT_KINDS.includes(last[0].kind) === PRODUCT_KINDS.includes(object.kind))
            last.push(object);
        else runs.push([object]);
    }
    return runs;
}
