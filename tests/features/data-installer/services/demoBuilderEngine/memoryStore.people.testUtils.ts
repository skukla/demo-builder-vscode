/**
 * The in-memory store's customers and promotions (`memoryStore.testUtils.ts` is the one entry):
 * customer groups, customers, cart rules and coupons, on the routes `customerKinds.ts`, `b2bReads.ts`,
 * `cartRulesKind.ts`, `couponsKind.ts`, `b2bContainers.ts` and `b2bStoreCopies.ts` read and write.
 *
 * Customers arrive through the Import API, which `withBulkQueue` turns into `POST customers`; as the
 * import does, a customer made here signs in on the one website (1). A new store has Commerce's four
 * groups. As in Commerce, deleting a cart rule deletes its coupons.
 */

import {
    type IdSource,
    type StorePart,
    filtersOf,
    matches,
    notFound,
    page,
} from './memoryStore.routes.testUtils';
import type { CommerceCoupon, CommerceSalesRule } from '@/types/commerceSalesRule';
import type { CommerceCustomer, CommerceCustomerGroup } from '@/types/commerceWire';

/** Commerce's own groups, as a new store has them. */
function storeGroups(): Map<number, CommerceCustomerGroup> {
    const own: CommerceCustomerGroup[] = [
        { id: 0, code: 'NOT LOGGED IN', tax_class_id: 3 },
        { id: 1, code: 'General', tax_class_id: 3 },
        { id: 2, code: 'Wholesale', tax_class_id: 3 },
        { id: 3, code: 'Retailer', tax_class_id: 3 },
    ];
    return new Map(own.map((g) => [g.id ?? 0, g]));
}

/** A search over one map, each filter on the field the search names. */
function searched<T extends object>(
    path: string,
    rows: Iterable<T>,
    fields: Record<string, (row: T) => unknown>
) {
    const f = filtersOf(path);
    return page(
        [...rows].filter((row) =>
            Object.entries(fields).every(([name, value]) => matches(f.get(name), value(row)))
        )
    );
}

/** The customers and promotions, and their routes. */
export function peoplePart(ids: IdSource): StorePart & {
    groups: Map<number, CommerceCustomerGroup>;
    customers: Map<number, CommerceCustomer>;
    rules: Map<number, CommerceSalesRule>;
    coupons: Map<number, CommerceCoupon>;
} {
    const groups = storeGroups();
    const customers = new Map<number, CommerceCustomer>();
    const rules = new Map<number, CommerceSalesRule>();
    const coupons = new Map<number, CommerceCoupon>();
    const byId =
        <T>(rows: Map<number, T>) =>
        (path: string, m: RegExpExecArray) =>
            rows.get(Number(m[1])) ?? notFound(path);
    const remove =
        <T>(rows: Map<number, T>) =>
        (_body: unknown, m: RegExpExecArray) => (rows.delete(Number(m[1])), true);
    return {
        groups,
        customers,
        rules,
        coupons,
        reads: [
            [
                /^customerGroups\/search\?/u,
                (path) => searched(path, groups.values(), { customer_group_code: (g) => g.code }),
            ],
            [/^customerGroups\/(\d+)$/u, byId(groups)],
            [
                /^customers\/search\?/u,
                (path) =>
                    searched(path, customers.values(), {
                        email: (c) => c.email,
                        group_id: (c) => c.group_id,
                    }),
            ],
            [/^customers\/(\d+)$/u, byId(customers)],
            [
                /^salesRules\/search\?/u,
                (path) => searched(path, rules.values(), { name: (r) => r.name }),
            ],
            [/^salesRules\/(\d+)$/u, byId(rules)],
            [
                /^coupons\/search\?/u,
                (path) =>
                    searched(path, coupons.values(), {
                        code: (c) => c.code,
                        rule_id: (c) => c.rule_id,
                    }),
            ],
            [/^coupons\/(\d+)$/u, byId(coupons)],
        ],
        writes: [
            [
                'POST',
                /^customerGroups$/u,
                (body) => {
                    const made: CommerceCustomerGroup = {
                        ...(body as { group: CommerceCustomerGroup }).group,
                        id: ids.next(),
                    };
                    groups.set(made.id ?? 0, made);
                    return made;
                },
            ],
            ['DELETE', /^customerGroups\/(\d+)$/u, remove(groups)],
            [
                'POST',
                /^customers$/u,
                (body) => {
                    const { customer } = body as { customer: CommerceCustomer };
                    const made: CommerceCustomer = {
                        group_id: 1,
                        ...customer,
                        id: ids.next(),
                        website_id: 1,
                        store_id: 1,
                    };
                    customers.set(made.id ?? 0, made);
                    return made;
                },
            ],
            ['DELETE', /^customers\/(\d+)$/u, remove(customers)],
            [
                'POST',
                /^salesRules$/u,
                (body) => {
                    const made: CommerceSalesRule = {
                        ...(body as { rule: CommerceSalesRule }).rule,
                        rule_id: ids.next(),
                    };
                    rules.set(made.rule_id ?? 0, made);
                    return made;
                },
            ],
            [
                'DELETE',
                /^salesRules\/(\d+)$/u,
                (_body, m) => {
                    rules.delete(Number(m[1]));
                    for (const [id, coupon] of coupons)
                        if (coupon.rule_id === Number(m[1])) coupons.delete(id);
                    return true;
                },
            ],
            [
                'POST',
                /^coupons$/u,
                (body) => {
                    const made: CommerceCoupon = {
                        ...(body as { coupon: CommerceCoupon }).coupon,
                        coupon_id: ids.next(),
                    };
                    coupons.set(made.coupon_id ?? 0, made);
                    return made;
                },
            ],
            ['DELETE', /^coupons\/(\d+)$/u, remove(coupons)],
        ],
    };
}
