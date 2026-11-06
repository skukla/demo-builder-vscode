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
 * A delete-mode product import (`POST import/json`, `behavior: 'delete'`, the route a removal uses
 * since 2026-11-06) runs as one `DELETE products/{sku}` per row through the fake's single route, so a
 * removal suite's assertions on those deletes still hold, and a deleted SKU then reads as missing.
 * A row the single route refuses is simply not deleted, as Commerce's import skips an invalid row.
 *
 * A customer import (`POST import/json`, `entity: 'customer_composite'`, the route every customer is
 * made by since 2026-11-06) runs each customer through the fake's own `POST customers`, its answer's id
 * kept, and a later `customers/search` by that email also finds it, so a suite's fake store needs nothing
 * new. A stop-on-errors call whose customer the fake refuses answers "Row 1: <its words>", as Commerce does.
 * Every import body is kept in `imports`, for a suite to assert what was sent.
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
        await send(method, path, body);
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

type DeleteImport = { source?: { entity?: string; behavior?: string; items?: Array<{ sku: string }> } };

type CustomerImport = { source: { entity: string; validation_strategy?: string; items: Array<Record<string, string>> } };

/** A customer import, or undefined for any other call. */
function customerImportOf(method: string, path: string, body: unknown): CustomerImport['source'] | undefined {
    const source = (body as CustomerImport | undefined)?.source;
    return method === 'POST' && path === 'import/json' && source?.entity === 'customer_composite' ? source : undefined;
}

/** An import row's address columns as a REST address. */
function addressOf(row: Record<string, string>): Record<string, unknown> | undefined {
    if (!row._address_city && !row._address_street) return undefined;
    return {
        firstname: row._address_firstname,
        lastname: row._address_lastname,
        street: (row._address_street ?? '').split('\n'),
        city: row._address_city,
        region: { region: row._address_region },
        country_id: row._address_country_id,
        postcode: row._address_postcode,
        telephone: row._address_telephone,
        ...(row._address_default_billing_ === '1' ? { default_billing: true } : {}),
        ...(row._address_default_shipping_ === '1' ? { default_shipping: true } : {}),
    };
}

/** A customer import row as the `POST customers` body it stands for. */
function customerBodyOf(row: Record<string, string>, more: Array<Record<string, string>>): unknown {
    const numbers = ['group_id', 'gender', 'disable_auto_group_change'];
    const customer: Record<string, unknown> = { email: row.email, firstname: row.firstname, lastname: row.lastname };
    for (const field of ['middlename', 'prefix', 'suffix', 'dob', 'taxvat', ...numbers]) if (row[field] !== undefined) customer[field] = numbers.includes(field) ? Number(row[field]) : row[field];
    const addresses = [row, ...more].map(addressOf).filter(Boolean);
    if (addresses.length > 0) customer.addresses = addresses;
    return { customer, ...(row.password ? { password: row.password } : {}) };
}

/** A delete-mode product import, or undefined for any other call. */
function deleteImportOf(method: string, path: string, body: unknown): Array<{ sku: string }> | undefined {
    const source = (body as DeleteImport | undefined)?.source;
    const isDelete = method === 'POST' && path === 'import/json' && source?.entity === 'catalog_product' && source.behavior === 'delete';
    return isDelete ? (source?.items ?? []) : undefined;
}

/** Each row through the single delete; one refused is left, as the import skips an invalid row. */
async function runDeleteImport(send: CommerceSend, items: Array<{ sku: string }>, gone: Set<string>): Promise<string[]> {
    let deleted = 0;
    for (const { sku } of items) {
        try {
            await send('DELETE', `products/${encodeURIComponent(sku)}`, undefined);
            gone.add(sku.toLowerCase());
            deleted += 1;
        } catch (error) {
            if (error instanceof CommerceReadError && CALL_REFUSALS.has(error.status ?? 0)) throw error;
        }
    }
    return [`Entities Processed: ${deleted}`];
}

/** The fake's get and send with the bulk queue in front of them. */
export function withBulkQueue(
    get: CommerceGet,
    send: CommerceSend
): { get: CommerceGet; send: CommerceSend; imports: unknown[] } {
    const bulks = new Map<string, Operation[]>();
    const gone = new Set<string>();
    const customersMade: Array<Record<string, unknown>> = [];
    const imports: unknown[] = [];
    /** Each customer of the import through the fake's own create; a stop-on-errors refusal in Commerce's words. */
    const runCustomerImport = async (source: CustomerImport['source']): Promise<string[]> => {
        const main = source.items.filter((row) => row.firstname !== undefined);
        for (const row of main) {
            const more = source.items.filter((r) => r !== row && r.firstname === undefined && r.email === row.email);
            try {
                const answer = (await send('POST', 'customers', customerBodyOf(row, more))) as Record<string, unknown> | null;
                customersMade.push({ ...(answer ?? {}), email: row.email });
            } catch (error) {
                // Only a row's refusal (a 4xx) is skipped; no answer, or who we are, fails the whole import call.
                const refused = error instanceof CommerceReadError && error.status !== undefined && error.status >= 400 && error.status < 500 && !CALL_REFUSALS.has(error.status);
                if (!refused) throw error;
                if (source.validation_strategy === 'validation-stop-on-errors') return [`Row 1: ${reasonOf(newCatalogSession(), error)}`];
            }
        }
        return [`Entities Processed: ${source.items.length}`];
    };
    const single = /^products\/([^/?]+)$/u;
    const outer: CommerceGet = async (path) => {
        const status = /^bulk\/([^/]+)\/status$/u.exec(path);
        if (status) {
            const operations = bulks.get(status[1]) ?? [];
            const answer: CommerceBulkStatus = { operations_list: operations, operation_count: operations.length, user_type: 2, bulk_id: status[1] };
            return answer;
        }
        const one = single.exec(path);
        if (one && gone.has(decodeURIComponent(one[1]).toLowerCase())) throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
        const email = path.startsWith('customers/search?') ? /\[field\]=email&searchCriteria\[filterGroups\]\[0\]\[filters\]\[0\]\[value\]=([^&]*)/u.exec(path)?.[1] : undefined;
        const made = email ? customersMade.filter((c) => String(c.email).toLowerCase() === decodeURIComponent(email).toLowerCase()) : [];
        if (made.length > 0) {
            const known = (await get(path).catch(() => ({ items: [] }))) as { items?: unknown[] } | null;
            const items = [...(known?.items ?? []), ...made];
            return { items, total_count: items.length };
        }
        try {
            return await get(path);
        } catch (error) {
            const list = SKU_LIST.exec(path);
            if (!list || !(error instanceof CommerceReadError) || error.status !== 404) throw error;
            return skuListFromSingles(outer, list[1]);
        }
    };
    return {
        get: outer,
        imports,
        send: async (method, path, body, route) => {
            const deletes = deleteImportOf(method, path, body);
            if (path === 'import/json') imports.push(body);
            if (deletes) return runDeleteImport(send, deletes, gone);
            const customers = customerImportOf(method, path, body);
            if (customers) return runCustomerImport(customers);
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
    };
}
