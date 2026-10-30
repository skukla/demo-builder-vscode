/**
 * The `customer_groups` and `customers` kinds (datapack-engine step 08; spec
 * `.rptc/research/datapack-engine/customers-b2b-spec.md` §1-2).
 *
 * What the store already has is left alone, and only what this engine makes is recorded, by the
 * pack's name for it: a group by its code, a customer by its email (lower case: Commerce compares
 * emails without case). The service instead POSTed every row, called a refusal in English a
 * duplicate, and on removal deleted whoever had that email, the SC's own customers included.
 *
 * Groups come before the products whose tier prices name them; customers after the products,
 * before the companies that make some of them their admin.
 *
 * **Passwords.** Bodea's customer rows each carry a top-level `password` (read 2026-10-29). It is
 * sent when the customer is created, so the demo's buyers can sign in on the storefront, and
 * nowhere else: never logged, never in the install record or a fingerprint (`packedFingerprint`
 * hashes the row without it), never on an update, and never in a saved pack or a zip
 * (`packCredentials.ts`). A captured customer has none: Commerce never answers one.
 *
 * | Write | Endpoint | Body |
 * |---|---|---|
 * | make a group | `POST customerGroups` | `{ group: { code, tax_class_id } }`, answers the group |
 * | update / remove a group | `PUT` / `DELETE customerGroups/{id}` | `{ group: { id, code, tax_class_id } }` |
 * | make a customer | `POST customers` | `{ customer, password? }`, answers the customer |
 * | update / remove a customer | `PUT` / `DELETE customers/{id}` | `{ customer }`, the store's copy with the pack's fields over it |
 *
 * None of the writes' answers is captured live; the reads they are checked against are
 * (`GET customerGroups/{id}`, `GET customers/{id}`).
 *
 * @module features/data-installer/services/demoBuilderEngine/customerKinds
 */

import { z } from 'zod';
import { CUSTOMER_GROUP_KIND, CUSTOMER_KIND, customerKey } from './b2bKeys';
import { customerByEmail, groupByCode } from './b2bReads';
import { deleteIfPresent, type KindContext, parseRows, ownedId, readOrNull, segment } from './kindContext';
import { nameOrId } from './packForm';
import { type ProductLookups, productLookups } from './productLookups';
import type { CommerceCustomer, CommerceCustomerAddress, CommerceCustomerGroup, CommerceSend } from '@/types/commerceWire';

export { CUSTOMER_GROUP_KIND, CUSTOMER_KIND, customerKey } from './b2bKeys';

/** Commerce's "Retail Customer" tax class, what a group takes when the pack names none. */
const RETAIL_TAX_CLASS = 3;

const groupRows = z.array(z.object({ customer_group: z.object({ code: z.string().min(1), tax_class_id: z.number().optional() }).passthrough() }));
const customerRows = z.array(
    z
        .object({
            customer: z
                .object({
                    email: z.string().email(),
                    firstname: z.string().min(1),
                    lastname: z.string().min(1),
                    group_id: z.union([z.string(), z.number()]).optional(),
                    addresses: z.array(z.record(z.unknown())).optional(),
                })
                .passthrough(),
            password: z.string().optional(),
        })
        .passthrough(),
);

export type CustomerGroupRows = z.infer<typeof groupRows>;
export type CustomerRows = z.infer<typeof customerRows>;
type CustomerRow = CustomerRows[number];

export const parseCustomerGroupRows = (records: unknown): CustomerGroupRows => parseRows(groupRows, records, 'customer groups');
export const parseCustomerRows = (records: unknown): CustomerRows => parseRows(customerRows, records, 'customers');

/** Make each group the store lacks; record it by its code. */
export async function installCustomerGroups(ctx: KindContext, rows: CustomerGroupRows): Promise<void> {
    for (const { customer_group: group } of rows) {
        if (ownedId(ctx.session, CUSTOMER_GROUP_KIND, group.code) !== undefined) continue;
        if (await groupByCode(ctx.get, group.code)) continue;
        const body: { group: CommerceCustomerGroup } = { group: { code: group.code, tax_class_id: group.tax_class_id ?? RETAIL_TAX_CLASS } };
        const id = Number(((await ctx.send('POST', 'customerGroups', body)) as CommerceCustomerGroup | null)?.id);
        if (!Number.isInteger(id)) throw new Error(`Commerce did not answer the new customer group ${group.code}'s id.`);
        await ctx.recorder.record({ kind: CUSTOMER_GROUP_KIND, id: String(id), key: group.code });
        ctx.log(`created customer group ${group.code}`);
    }
}

export async function removeCustomerGroup(send: CommerceSend, id: string): Promise<void> {
    await deleteIfPresent(send, `customerGroups/${segment(id)}`);
}

/** Bring a group this engine made up to the pack's row. */
export async function updateCustomerGroup(ctx: KindContext, id: string, row: unknown): Promise<void> {
    const [{ customer_group: group }] = parseCustomerGroupRows([row]);
    const body: { group: CommerceCustomerGroup } = { group: { id: Number(id), code: group.code, tax_class_id: group.tax_class_id ?? RETAIL_TAX_CLASS } };
    await ctx.send('PUT', `customerGroups/${segment(id)}`, body);
}

/** A group as a pack holds it: its code and tax class. */
export function groupPackForm(raw: CommerceCustomerGroup): { customer_group: { code: string; tax_class_id?: number } } {
    return { customer_group: { code: raw.code, ...(raw.tax_class_id !== undefined ? { tax_class_id: raw.tax_class_id } : {}) } };
}

/** What only the store a customer came from means, and Commerce's own credential fields. */
const STORE_ONLY_CUSTOMER_FIELDS = new Set([
    'id', 'website_id', 'store_id', 'created_at', 'updated_at', 'created_in', 'extension_attributes',
    'default_billing', 'default_shipping', 'confirmation', 'password', 'password_hash', 'rp_token', 'rp_token_created_at',
]);

const withoutFields = <T extends object>(row: T, drop: ReadonlySet<string>): Partial<T> =>
    Object.fromEntries(Object.entries(row).filter(([key]) => !drop.has(key))) as Partial<T>;

/** An address with no ids: the address and its owner are this store's. */
function addressFields({ id: _id, customer_id: _owner, ...address }: CommerceCustomerAddress): CommerceCustomerAddress {
    return address;
}

/** The pack's customer fields as Commerce takes them: this store's group id, no other store's ids. */
async function customerFields(lk: ProductLookups, row: CustomerRow): Promise<Partial<CommerceCustomer>> {
    const { group_id: group, addresses, ...fields } = withoutFields(row.customer, STORE_ONLY_CUSTOMER_FIELDS) as CustomerRow['customer'];
    return {
        ...(group !== undefined ? { group_id: await lk.groupId(String(group)) } : {}),
        ...(fields as Partial<CommerceCustomer>),
        ...(addresses ? { addresses: (addresses as CommerceCustomerAddress[]).map(addressFields) } : {}),
    };
}

/** Make each customer the install target's website lacks; record it by its email. */
export async function installCustomers(ctx: KindContext, rows: CustomerRows): Promise<void> {
    const websiteId = ctx.session.websiteId;
    if (websiteId === undefined) throw new Error("The install target names no website, so the pack's customers have nowhere to sign in.");
    const lk = productLookups(ctx);
    for (const row of rows) {
        const key = customerKey(row.customer.email);
        if (ownedId(ctx.session, CUSTOMER_KIND, key) !== undefined || ctx.recorder.byKey(CUSTOMER_KIND, key)) continue;
        if (await customerByEmail(ctx.get, row.customer.email, websiteId)) {
            ctx.log(`left customer ${key} as it is: the website already has it`);
            continue;
        }
        const customer = { ...(await customerFields(lk, row)), website_id: websiteId, store_id: ctx.session.storeId } as CommerceCustomer;
        const answer = (await ctx.send('POST', 'customers', { customer, ...(row.password ? { password: row.password } : {}) })) as CommerceCustomer | null;
        const id = Number(answer?.id);
        if (!Number.isInteger(id)) throw new Error(`Commerce did not answer the new customer ${key}'s id.`);
        await ctx.recorder.record({ kind: CUSTOMER_KIND, id: String(id), key });
        ctx.log(`created customer ${key}`);
    }
}

export async function removeCustomer(send: CommerceSend, id: string): Promise<void> {
    await deleteIfPresent(send, `customers/${segment(id)}`);
}

/**
 * Bring a customer this engine made up to the pack's row: the store's copy with the pack's fields
 * over it, so its website, its company link and anything the pack does not name stay as they are.
 * Never its password.
 */
export async function updateCustomer(ctx: KindContext, id: string, row: unknown): Promise<void> {
    const current = await readOrNull<CommerceCustomer>(ctx.get, `customers/${segment(id)}`);
    if (!current) return;
    const [pack] = parseCustomerRows([row]);
    const customer: CommerceCustomer = { ...current, ...(await customerFields(productLookups(ctx), pack)), id: current.id ?? Number(id) };
    await ctx.send('PUT', `customers/${segment(id)}`, { customer });
}

/**
 * A group id as a pack names it, under `field`: its code, or the id when the store cannot name
 * it (capture keeps an id it cannot name). Nothing when there is no group.
 */
export async function namedGroup(lk: ProductLookups, field: string, group: number | undefined): Promise<Record<string, string | number>> {
    if (group === undefined) return {};
    return { [field]: await nameOrId(lk, 'customer group', group, () => lk.groupCode(group)) };
}

/** A customer as a pack holds it: its group by code, no store's ids, never a password. */
export async function customerPackForm(lk: ProductLookups, raw: CommerceCustomer): Promise<{ customer: Record<string, unknown> }> {
    const { group_id: group, addresses, ...fields } = withoutFields(raw, STORE_ONLY_CUSTOMER_FIELDS);
    return {
        customer: {
            ...(await namedGroup(lk, 'group_id', group)),
            ...fields,
            ...(addresses ? { addresses: addresses.map(addressFields) } : {}),
        },
    };
}
