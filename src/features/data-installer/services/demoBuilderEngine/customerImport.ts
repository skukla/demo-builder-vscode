/**
 * Customers made through Commerce's Import API (`customer_composite`), for every path that makes one:
 * a pack's customers, the service's `customers_export` kind, and a company's admin.
 *
 * Why not `POST customers`: on the Justrite ACCS sandbox every customer create through REST, the bulk
 * route included, is refused before anything is saved, whatever its body ("… company_id … The
 * "%company_id%" value's type is invalid. The "int" type was expected"), while the same customer imports
 * with its group and address (2026-11-06). The cause is on the store's side and was not found; ACCS's
 * own docs steer customer writes away from that route. The import is also one call for many customers.
 *
 * As every create here: each customer is pending on the record before the call, read back by email
 * after (the import's answer counts refused rows too), recorded with the store's id, and one that did not
 * land is sent alone, stopping on its error, for Commerce's reason (`importApi.ts`).
 *
 * @module features/data-installer/services/demoBuilderEngine/customerImport
 */

import { CUSTOMER_KIND, customerKey } from './b2bKeys';
import { customerByEmail } from './b2bReads';
import { importBody, importRefusal } from './importApi';
import type { CreatedObject } from './installRecord';
import { type KindContext, REQUESTS_AT_ONCE } from './kindContext';
import type { PendingObject } from './pendingRecord';
import { skipRow } from './refusedRows';
import { runInBatches } from '@/core/utils/promiseUtils';
import type { CommerceCustomer, CommerceCustomerAddress } from '@/types/commerceWire';

const ENTITY = 'customer_composite';

/** Customers per import call. */
const CUSTOMERS_PER_IMPORT = 100;

/** One customer to make: its email, and its import rows (the customer's, then one per further address). */
export interface CustomerToMake {
    email: string;
    rows: Array<Record<string, string>>;
}

/** The customer fields an import row carries, by REST name. */
const CUSTOMER_COLUMNS = [
    'firstname',
    'lastname',
    'middlename',
    'prefix',
    'suffix',
    'dob',
    'gender',
    'taxvat',
    'group_id',
    'disable_auto_group_change',
] as const;

/** An address as `_address_*` columns. */
function addressColumns(address: CommerceCustomerAddress): Record<string, string> {
    const region = address.region?.region ?? address.region?.region_code;
    const columns: Record<string, unknown> = {
        _address_firstname: address.firstname,
        _address_lastname: address.lastname,
        _address_company: address.company,
        _address_street: (address.street ?? []).join('\n'),
        _address_city: address.city,
        _address_region: region,
        _address_country_id: address.country_id,
        _address_postcode: address.postcode,
        _address_telephone: address.telephone,
        _address_default_billing_: address.default_billing ? '1' : undefined,
        _address_default_shipping_: address.default_shipping ? '1' : undefined,
    };
    return Object.fromEntries(
        Object.entries(columns)
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => [k, String(v)]),
    );
}

/**
 * A REST customer as import rows: the customer with its first address, then one row per further address
 * carrying only the email and website, as Commerce's customer import reads them.
 */
export function customerImportRows(
    customer: Partial<CommerceCustomer> & { email: string },
    ctx: Pick<KindContext, 'session'>,
    password?: string,
): CustomerToMake {
    const scope = {
        email: customer.email,
        _website: ctx.session.websiteCode ?? '',
        _store: ctx.session.storeCode ?? '',
    };
    const fields: Record<string, string> = { ...scope };
    for (const column of CUSTOMER_COLUMNS)
        if (customer[column] !== undefined && customer[column] !== null)
            fields[column] = String(customer[column]);
    if (password) fields.password = password;
    const [first, ...more] = customer.addresses ?? [];
    return {
        email: customer.email,
        rows: [
            { ...fields, ...(first ? addressColumns(first) : {}) },
            ...more.map((address) => ({
                email: customer.email,
                _website: scope._website,
                ...addressColumns(address),
            })),
        ],
    };
}

const pendingOf = (
    customers: readonly CustomerToMake[],
    websiteId: number | undefined,
): PendingObject[] =>
    customers.map((c) => ({
        kind: CUSTOMER_KIND,
        key: customerKey(c.email),
        ...(websiteId !== undefined ? { find: { websiteId } } : {}),
    }));

/** Each customer's id on the target website, by key; one not there is absent. */
async function idsOn(
    ctx: KindContext,
    customers: readonly CustomerToMake[],
): Promise<Map<string, number>> {
    const found = await runInBatches(
        [...customers],
        REQUESTS_AT_ONCE,
        async (c) =>
            [
                customerKey(c.email),
                (await customerByEmail(ctx.get, c.email, ctx.session.websiteId))?.id,
            ] as const,
    );
    return new Map(
        found.filter((entry): entry is readonly [string, number] => entry[1] !== undefined),
    );
}

/** One call's customers imported, read back, recorded; one that did not land sent alone for its reason. */
async function importCall(
    ctx: KindContext,
    customers: readonly CustomerToMake[],
): Promise<Map<string, number>> {
    const websiteId = ctx.session.websiteId;
    await ctx.recorder.markPending(pendingOf(customers, websiteId));
    await ctx.send(
        'POST',
        'import/json',
        importBody(
            ENTITY,
            'add_update',
            customers.flatMap((c) => c.rows),
        ),
    );
    let ids = await idsOn(ctx, customers);
    const reasons = new Map<string, string>();
    for (const c of customers.filter((one) => !ids.has(customerKey(one.email)))) {
        const answer = await ctx.send(
            'POST',
            'import/json',
            importBody(ENTITY, 'add_update', c.rows, 'validation-stop-on-errors'),
        );
        reasons.set(customerKey(c.email), importRefusal(answer) ?? '');
    }
    if (reasons.size > 0)
        ids = new Map([
            ...ids,
            ...(await idsOn(
                ctx,
                customers.filter((c) => reasons.has(customerKey(c.email))),
            )),
        ]);
    const made = customers.filter((c) => ids.has(customerKey(c.email)));
    const missing = customers.filter((c) => !ids.has(customerKey(c.email)));
    const objects: CreatedObject[] = made.map((c) => ({
        kind: CUSTOMER_KIND,
        id: String(ids.get(customerKey(c.email))),
        key: customerKey(c.email),
    }));
    await ctx.recorder.confirm(pendingOf(made, websiteId), objects);
    for (const c of made) ctx.log(`created customer ${customerKey(c.email)}`);
    await ctx.recorder.forgetPending(pendingOf(missing, websiteId));
    for (const c of missing)
        skipRow(ctx, {
            kind: CUSTOMER_KIND,
            key: customerKey(c.email),
            reason:
                reasons.get(customerKey(c.email)) ||
                'Commerce took the row but did not make the customer',
        });
    return ids;
}

/**
 * Make these customers through the Import API, a hundred to a call.
 *
 * @returns each made customer's id, by key (`customerKey`)
 * @throws an import call with no answer, or one refused for anything but a row: the customers stay pending
 */
export async function makeCustomersByImport(
    ctx: KindContext,
    customers: readonly CustomerToMake[],
): Promise<Map<string, number>> {
    const ids = new Map<string, number>();
    for (let start = 0; start < customers.length; start += CUSTOMERS_PER_IMPORT) {
        for (const [key, id] of await importCall(
            ctx,
            customers.slice(start, start + CUSTOMERS_PER_IMPORT),
        ))
            ids.set(key, id);
    }
    return ids;
}
