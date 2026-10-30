/**
 * A fake of the reads a wipe makes (step 10), answering from the typed sandbox in
 * `tests/helpers/commerceWipeFixtures.ts`, filtering a search by the one field its address names
 * (`website_id` eq, `store_id` / `customer_id` in) as Commerce would. Every read's address and every
 * write, with its body, are kept, so a suite asserts both.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { CommerceCustomer, CommerceOrder, CommerceProduct, CommerceReturn } from '@/types/commerceWire';
import {
    SANDBOX_CATEGORIES,
    SANDBOX_GROUPS,
    SANDBOX_VIEWS,
    SANDBOX_WEBSITES,
    TEST_SITE_CUSTOMERS,
    TEST_SITE_PRODUCTS,
} from '../../../../helpers/commerceWipeFixtures';

const FILTER = /searchCriteria\[filterGroups\]\[0\]\[filters\]\[0\]\[field\]=(\w+)&searchCriteria\[filterGroups\]\[0\]\[filters\]\[0\]\[value\]=([^&]*)/u;

export interface SandboxState {
    products: CommerceProduct[];
    customers: CommerceCustomer[];
    orders: CommerceOrder[];
    /** Absent: the store has no returns module, and `returns` answers 404. */
    returns?: CommerceReturn[];
}

/** The ids a search filters on, from its address: `[field, values]`. */
function filterOf(path: string): [string, number[]] {
    const match = FILTER.exec(path);
    return [match?.[1] ?? '', decodeURIComponent(match?.[2] ?? '').split(',').map(Number)];
}

/** The id in "orders/702?fields=state". */
const idIn = (path: string): string => path.split('/')[1].split('?')[0];

/**
 * What Commerce does with the writes a wipe's orders make, as far as a later read sees it: a refund
 * credits its lines and closes the order once nothing is left to invoice or refund; a cancel cancels
 * it; a note joins its history; a return's save sets its status.
 */
function apply(data: SandboxState, path: string, body: unknown): void {
    if (/^order\/\d+\/refund$/u.test(path)) {
        const order = data.orders.find((o) => String(o.entity_id) === path.split('/')[1]);
        const items = (body as { items: Array<{ order_item_id: number; qty: number }> }).items;
        for (const line of order?.items ?? []) line.qty_refunded = Number(line.qty_refunded ?? 0) + (items.find((i) => i.order_item_id === line.item_id)?.qty ?? 0);
        const open = (order?.items ?? []).some((l) => Number(l.qty_ordered) - Number(l.qty_refunded ?? 0) - Number(l.qty_canceled ?? 0) > 0);
        if (order && !open) order.state = 'closed';
    }
    const order = data.orders.find((o) => String(o.entity_id) === path.split('/')[1]);
    if (order && path.endsWith('/cancel')) order.state = 'canceled';
    if (order && path.endsWith('/comments')) order.status_histories = [...(order.status_histories ?? []), { comment: (body as { statusHistory: { comment: string } }).statusHistory.comment }];
    if (path.startsWith('returns/') && data.returns) {
        const rma = data.returns.find((r) => String(r.entity_id) === idIn(path));
        if (rma) rma.status = (body as { rmaDataObject: { status: string } }).rmaDataObject.status;
    }
}

function reader(data: SandboxState) {
    const page = <T>(items: T[]) => ({ items, total_count: items.length });
    const matching = <T>(path: string, items: T[], fieldOf: (item: T) => unknown): T[] => {
        const [, values] = filterOf(path);
        return items.filter((item) => values.includes(Number(fieldOf(item))));
    };
    return (path: string): unknown => {
        if (path === 'store/websites') return SANDBOX_WEBSITES;
        if (path === 'store/storeGroups') return SANDBOX_GROUPS;
        if (path === 'store/storeViews') return SANDBOX_VIEWS;
        if (path.startsWith('categories/list?')) return page(SANDBOX_CATEGORIES);
        if (path.startsWith('products?')) {
            const [website] = filterOf(path)[1];
            return page(data.products.filter((p) => p.extension_attributes?.website_ids?.map(Number).includes(website)));
        }
        // Answers every customer, as if the filter were ignored: the wipe must still take only the website's.
        if (path.startsWith('customers/search?')) return page(data.customers);
        if (path.startsWith('orders?')) {
            const [field] = filterOf(path);
            return page(matching(path, data.orders, (o) => (field === 'customer_id' ? o.customer_id : o.store_id)));
        }
        if (path.startsWith('orders/')) return data.orders.find((o) => String(o.entity_id) === idIn(path));
        if (data.returns && path.startsWith('returns?')) return page(matching(path, data.returns, (r) => r.order_id));
        if (data.returns && path.startsWith('returns/')) return data.returns.find((r) => String(r.entity_id) === idIn(path));
        throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
    };
}

/**
 * @param refuse - the writes Commerce refuses, by path
 * @param answer - what a write answers, by path, done instead of Commerce's own (default: the write
 *   takes effect, and answers `true`, a refund its credit memo id)
 */
export function sandbox(state: Partial<SandboxState> = {}, refuse: (path: string) => boolean = () => false, answer?: (path: string, body: unknown) => unknown) {
    // Copied deep: a refund or a return's close changes what a later read sees, never the fixture.
    const data: SandboxState = structuredClone({
        products: state.products ?? [...TEST_SITE_PRODUCTS],
        customers: state.customers ?? [...TEST_SITE_CUSTOMERS],
        orders: state.orders ?? [],
        ...(state.returns ? { returns: state.returns } : {}),
    });
    const reads: string[] = [];
    const sent: Array<{ method: string; path: string; body?: unknown }> = [];
    const read = reader(data);
    const get = async (path: string): Promise<unknown> => {
        reads.push(path);
        return read(path);
    };
    const send = async (method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<unknown> => {
        sent.push(body === undefined ? { method, path } : { method, path, body });
        if (refuse(path)) throw new CommerceReadError('Commerce answered 400: The product is in use.', 400);
        if (answer) return answer(path, body);
        apply(data, path, body);
        return path.includes('/refund') ? 9001 : true;
    };
    return { data, reads, sent, get, send };
}

/** The writes a run made, without their bodies, for suites that assert only the order. */
export function writesOf(sent: ReadonlyArray<{ method: string; path: string }>): Array<{ method: string; path: string }> {
    return sent.map(({ method, path }) => ({ method, path }));
}

/** This project's records: Demo Builder made one product, one customer and one category. */
export const PROJECT_RECORDS: InstallRecord[] = [
    {
        format: 1,
        pack: { name: 'zz-test', version: '1' },
        engine: 'demo-builder',
        startedAt: '2026-10-30T10:00:00.000Z',
        target: { websiteCode: 'justrite_test_website', storeCode: 'justrite_test_view' },
        created: [
            { kind: 'products', id: 'ZZ-MADE-BY-DEMO-BUILDER' },
            { kind: 'customers', id: '72' },
            { kind: 'categories', id: '155' },
        ],
    },
];
