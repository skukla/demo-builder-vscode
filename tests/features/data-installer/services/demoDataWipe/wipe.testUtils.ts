/**
 * A fake of the reads a wipe makes (step 10), answering from the typed sandbox in
 * `tests/helpers/commerceWipeFixtures.ts`, filtering a search by the one field its address names
 * (`website_id` eq, `store_id` / `customer_id` in) as Commerce would. Every read's address and every
 * write, with its body, are kept, so a suite asserts both.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { CommerceCoupon, CommerceSalesRule } from '@/types/commerceSalesRule';
import type { CommerceCustomer, CommerceOrder, CommerceProduct, CommerceReturn, CommerceSystemConfigPutAnswer, CommerceSystemConfigWrite } from '@/types/commerceWire';
import type { InstanceState } from '../../../../helpers/commerceWipeInstanceFixtures';
import { DELETE_COMPANY_ADMIN_REFUSED_DB08 } from '../../../../helpers/commerceB2bFixtures';
import {
    ADMIN_GROUP,
    ADMIN_VIEW,
    ADMIN_WEBSITE,
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
    /** Cart rules (step 11). Absent: `salesRules/search` answers 404, as the wipe reads as none. */
    rules?: CommerceSalesRule[];
    coupons?: CommerceCoupon[];
    /** Companies, catalogs, groups, attribute sets, attributes, settings. Absent: their routes answer 404, as on a store without B2B. */
    instance?: InstanceState;
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
    if (data.rules && /^salesRules\/\d+$/u.test(path)) {
        const id = Number(idIn(path));
        const rule = (body as { rule?: CommerceSalesRule } | undefined)?.rule;
        data.rules = rule ? data.rules.map((r) => (r.rule_id === id ? rule : r)) : data.rules.filter((r) => r.rule_id !== id);
        if (!rule) data.coupons = (data.coupons ?? []).filter((c) => c.rule_id !== id);
    }
    if (path.startsWith('returns/') && data.returns) {
        const rma = data.returns.find((r) => String(r.entity_id) === idIn(path));
        if (rma) rma.status = (body as { rmaDataObject: { status: string } }).rmaDataObject.status;
    }
}

/** What Commerce does with a wipe's instance-wide writes, as measured live (`commerceB2bFixtures.ts`). */
function applyInstance(data: SandboxState, method: string, path: string, body: unknown): unknown {
    const { instance } = data;
    const id = idIn(path);
    if (method !== 'DELETE' && path !== 'system/config') return undefined;
    if (/^customers\/\d+$/u.test(path)) {
        // Live 2026-10-30: Commerce refuses to delete a company's admin while the company stands.
        if (instance?.companies.some((c) => String(c.super_user_id) === id)) throw new CommerceReadError(DELETE_COMPANY_ADMIN_REFUSED_DB08.message, DELETE_COMPANY_ADMIN_REFUSED_DB08.status);
        data.customers = data.customers.filter((c) => String(c.id) !== id);
    }
    if (/^products\/[^/]+$/u.test(path)) data.products = data.products.filter((p) => encodeURIComponent(p.sku) !== path.split('/')[1]);
    if (!instance) return undefined;
    if (/^company\/\d+$/u.test(path)) instance.companies = instance.companies.filter((c) => String(c.id) !== id);
    if (/^sharedCatalog\/\d+$/u.test(path)) {
        // Live 2026-10-30: deleting a catalog deletes its group too, and moves everyone in it to General.
        const groupId = instance.catalogs.find((c) => String(c.id) === id)?.customer_group_id;
        instance.catalogs = instance.catalogs.filter((c) => String(c.id) !== id);
        instance.groups = instance.groups.filter((g) => g.id !== groupId);
        for (const customer of data.customers.filter((c) => c.group_id === groupId)) {
            instance.movedToGeneral.push(Number(customer.id));
            customer.group_id = 1;
        }
    }
    if (/^customerGroups\/\d+$/u.test(path)) {
        if (!instance.groups.some((g) => String(g.id) === id)) throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
        instance.groups = instance.groups.filter((g) => String(g.id) !== id);
    }
    if (/^products\/attribute-sets\/\d+$/u.test(path)) instance.sets = instance.sets.filter((s) => s.attribute_set_id !== Number(path.split('/')[2]));
    if (/^products\/attributes\/[^/]+$/u.test(path)) instance.attributes = instance.attributes.filter((a) => a.attribute_code !== path.split('/')[2]);
    if (path === 'system/config') return putSettings(instance, body as { items: CommerceSystemConfigWrite[] });
    return undefined;
}

/** `PUT system/config`: each row saved, or refused in `errors` under HTTP 200 (Adobe's page). */
function putSettings(instance: InstanceState, body: { items: CommerceSystemConfigWrite[] }): CommerceSystemConfigPutAnswer {
    const answer: Required<CommerceSystemConfigPutAnswer> = { items: [], errors: [] };
    for (const item of body.items) {
        const rows = instance.settings?.websites[item.scope_code ?? ''];
        const row = rows?.find((r) => r.path === item.path);
        if (row && item.path !== REFUSED_SETTING) {
            row.value = item.value;
            answer.items.push({ ...row });
        } else answer.errors.push({ path: item.path, scope: item.scope, scope_code: item.scope_code, message: `Configuration path "${item.path}" was not found, is not visible for this scope, or is not allowed.` });
    }
    return answer;
}

/** A setting Commerce refuses to save, as `errors` would say. */
export const REFUSED_SETTING = 'payment/companycredit/active';

const SCOPE = /[?&]scope=(default|website)(?:&scopeCode=([^&]*))?/u;
const NOT_NULL = /\[field\]=(\w+)&searchCriteria\[filterGroups\]\[0\]\[filters\]\[0\]\[value\]=1&searchCriteria\[filterGroups\]\[0\]\[filters\]\[0\]\[conditionType\]=notnull/u;

/** The settings at the scope asked, by the paths asked for, when it names any. */
function readSettings(instance: InstanceState, path: string): unknown {
    const [, scope, code] = SCOPE.exec(path) ?? [];
    const rows = scope === 'default' ? instance.settings?.default : instance.settings?.websites[decodeURIComponent(code ?? '')];
    const asked = /conditionType\]=in/u.test(path) ? decodeURIComponent(/\[value\]=([^&]*)/u.exec(path)?.[1] ?? '').split(',') : undefined;
    const items = (rows ?? []).filter((row) => !asked || asked.includes(row.path));
    return { items, total_count: items.length };
}

/** The instance-wide reads, or undefined when a read is someone else's. */
function readInstance(data: SandboxState, path: string): unknown {
    const { instance } = data;
    if (!instance) return undefined;
    if (instance.failing.some((pattern) => pattern.test(path))) throw new CommerceReadError(`Commerce answered 500 for ${path}`, 500);
    const page = <T>(items: T[]) => ({ items, total_count: items.length });
    const id = path.includes('/') ? idIn(path) : '';
    if (path.startsWith('system/config?') && instance.settings) return readSettings(instance, path);
    if (path.startsWith('company?')) return page(instance.companies.map((c) => ({ id: c.id, company_name: c.company_name, company_email: c.company_email, customer_group_id: c.customer_group_id })));
    if (path.startsWith('company/')) return instance.companies.find((c) => String(c.id) === id) ?? null;
    if (path.startsWith('hierarchy/')) return instance.hierarchies[id];
    if (path.startsWith('sharedCatalog?')) return page(instance.catalogs);
    if (path.startsWith('customerGroups/')) return instance.groups.find((g) => String(g.id) === id) ?? null;
    if (path.startsWith('products/attribute-sets/sets/list?')) return page(instance.sets);
    const setId = /^products\/attribute-sets\/(\d+)\/attributes/u.exec(path)?.[1];
    if (setId) return instance.setAttributes[setId] ?? [];
    if (path.startsWith('products/attributes/')) return instance.attributes.find((a) => a.attribute_code === path.split('/')[2]) ?? null;
    return undefined;
}

/** A `products` search that names a set, or asks who carries an attribute; undefined for a website's. */
function productSearch(data: SandboxState, path: string): CommerceProduct[] | undefined {
    const [field, values] = filterOf(path);
    if (field === 'attribute_set_id') return data.products.filter((p) => values.includes(Number(p.attribute_set_id)));
    const code = NOT_NULL.exec(path)?.[1];
    if (code) return data.products.filter((p) => (p.custom_attributes ?? []).some((a) => a.attribute_code === code));
    return undefined;
}

function reader(data: SandboxState) {
    const page = <T>(items: T[]) => ({ items, total_count: items.length });
    const matching = <T>(path: string, items: T[], fieldOf: (item: T) => unknown): T[] => {
        const [, values] = filterOf(path);
        return items.filter((item) => values.includes(Number(fieldOf(item))));
    };
    return (path: string): unknown => {
        const instanceAnswer = readInstance(data, path);
        if (instanceAnswer !== undefined) return instanceAnswer;
        // Commerce answers its Admin scope (id 0) first, beside the real ones.
        if (path === 'store/websites') return [ADMIN_WEBSITE, ...SANDBOX_WEBSITES];
        if (path === 'store/storeGroups') return [ADMIN_GROUP, ...SANDBOX_GROUPS];
        if (path === 'store/storeViews') return [ADMIN_VIEW, ...SANDBOX_VIEWS];
        if (path.startsWith('categories/list?')) return page(SANDBOX_CATEGORIES);
        if (path.startsWith('products?')) {
            const searched = productSearch(data, path);
            if (searched) return page(searched);
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
        // Every rule, as if no filter were asked: the wipe decides by each rule's websites itself.
        if (data.rules && path.startsWith('salesRules/search?')) return page(data.rules);
        if (data.rules && path.startsWith('salesRules/')) return data.rules.find((r) => String(r.rule_id) === idIn(path)) ?? null;
        if (data.rules && path.startsWith('coupons/search?')) return page(matching(path, data.coupons ?? [], (c) => c.coupon_id));
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
        ...(state.rules ? { rules: state.rules, coupons: state.coupons ?? [] } : {}),
        ...(state.instance ? { instance: state.instance } : {}),
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
        const instanceAnswer = applyInstance(data, method, path, body);
        if (instanceAnswer !== undefined) return instanceAnswer;
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
