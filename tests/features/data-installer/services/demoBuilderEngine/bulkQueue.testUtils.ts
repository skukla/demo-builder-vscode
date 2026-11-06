/**
 * Commerce's bulk queue in front of a fake store, for the engine's suites.
 *
 * A bulk call runs each request through the fake's own single route straight away, as Commerce's
 * queue does once its consumer picks the call up, so a suite's assertions on the single writes
 * still hold. The status read lists each request by its index in the call, in the shape of a live
 * answer from the Justrite ACCS store (tests/fixtures/commerce-rest/bulk-status-products.json):
 * status 1 for a request the single route took, 3 with Commerce's words for one it refused (a
 * 4xx), and 2 for one that failed some other way, which Commerce marks as worth trying again.
 * Not signed in (401, 403) and too many calls (429) refuse the whole call, as Commerce checks them
 * when the call arrives.
 *
 * A `bySku` route runs as the single route with the SKU in its path, as Commerce runs it:
 * `DELETE products/bySku` with `{ sku }` is `DELETE products/{sku}`.
 *
 * A search for a list of SKUs that the fake does not answer is answered from its single-product
 * reads, so a path-table fake that knows `products/<sku>` needs nothing new.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { newCatalogSession } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import { reasonOf } from '@/features/data-installer/services/demoBuilderEngine/refusedRows';
import type {
    CommerceBulkAccepted,
    CommerceBulkStatus,
    CommerceGet,
    CommerceSend,
} from '@/types/commerceWire';

type Operation = NonNullable<CommerceBulkStatus['operations_list']>[number];

const SKU_LIST =
    /^products\?.*\[conditionType\]=in&searchCriteria\[filterGroups\]\[0\]\[filters\]\[0\]\[value\]=([^&]*)/u;

const CALL_REFUSALS = new Set([401, 403, 429]);

const SUCCESS =
    'Service execution success Magento\\Catalog\\Api\\ProductRepositoryInterface\\Proxy::save';

/** One request's end, as the queue would list it. */
async function runOne(
    send: CommerceSend,
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: unknown,
    id: number
): Promise<Operation> {
    try {
        // A `bySku` route is the synchronous `products/{sku}` with the SKU taken from the body.
        const sku = path.endsWith('/bySku') ? (body as { sku: string }).sku : undefined;
        if (sku !== undefined) await send(method, `${path.slice(0, -'/bySku'.length)}/${encodeURIComponent(sku)}`, undefined);
        else await send(method, path, body);
        return { id, status: 1, result_message: SUCCESS, error_code: null };
    } catch (error) {
        // Who we are and how fast we call are checked when the call arrives, not per request.
        if (error instanceof CommerceReadError && CALL_REFUSALS.has(error.status ?? 0)) throw error;
        const refused =
            error instanceof CommerceReadError &&
            error.status !== undefined &&
            error.status >= 400 &&
            error.status < 500;
        return {
            id,
            status: refused ? 3 : 2,
            result_message: reasonOf(newCatalogSession(), error),
            error_code: 0,
        };
    }
}

/** Each SKU in the list the fake has, read one at a time, as a search page. */
async function skuListFromSingles(get: CommerceGet, list: string): Promise<unknown> {
    const items: Array<{ id: number; sku: string }> = [];
    for (const sku of list.split(',').map(decodeURIComponent)) {
        try {
            const found = (await get(`products/${encodeURIComponent(sku)}`)) as {
                id?: number;
                sku?: string;
            } | null;
            if (found) items.push({ id: found.id ?? 0, sku: found.sku ?? sku });
        } catch (error) {
            if (!(error instanceof CommerceReadError) || error.status !== 404) throw error;
        }
    }
    return { items, total_count: items.length };
}

/** The fake's get and send with the bulk queue in front of them. */
export function withBulkQueue(
    get: CommerceGet,
    send: CommerceSend
): { get: CommerceGet; send: CommerceSend } {
    const bulks = new Map<string, Operation[]>();
    return {
        send: async (method, path, body, route) => {
            if (!route?.bulk) return send(method, path, body);
            const bodies = body as unknown[];
            const operations: Operation[] = [];
            for (const [id, one] of bodies.entries())
                operations.push(await runOne(send, method, path, one, id));
            const uuid = `bulk-${bulks.size + 1}`;
            bulks.set(uuid, operations);
            const accepted: CommerceBulkAccepted = {
                bulk_uuid: uuid,
                request_items: operations.map((op) => ({ id: op.id, status: 'accepted' })),
                errors: false,
            };
            return accepted;
        },
        get: async (path) => {
            const status = /^bulk\/([^/]+)\/status$/u.exec(path);
            if (status) {
                const operations = bulks.get(status[1]) ?? [];
                const answer: CommerceBulkStatus = {
                    operations_list: operations,
                    operation_count: operations.length,
                    user_type: 2,
                    bulk_id: status[1],
                };
                return answer;
            }
            try {
                return await get(path);
            } catch (error) {
                const list = SKU_LIST.exec(path);
                if (!list || !(error instanceof CommerceReadError) || error.status !== 404)
                    throw error;
                return skuListFromSingles(get, list[1]);
            }
        },
    };
}
