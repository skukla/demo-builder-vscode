/**
 * The `customers_export` kind: customers in Commerce's import form, the Data Installer service's own
 * kind for them (`dsc-data-installer-api`, `config/data_processors_import.json`: `JsonImportProcessor`,
 * one `customer_composite` body sent to `import/json`). A pack holding it installs here as it does there,
 * with the service's substitutions: the target's website and store view on every row, and a group named
 * by code turned into this store's group id.
 *
 * As every customer this engine makes (`customerImport.ts`), each is pending first, read back by email,
 * and recorded; a customer the website already has, or one the pack made that the SC deleted since, is
 * left alone. A row naming a group the store lacks is skipped with its customer, by name.
 *
 * @module features/data-installer/services/demoBuilderEngine/customersExportKind
 */

import { z } from 'zod';
import { CUSTOMER_KIND, customerKey } from './b2bKeys';
import { customerByEmail } from './b2bReads';
import { type CustomerToMake, makeCustomersByImport } from './customerImport';
import { type KindContext, ownedId } from './kindContext';
import { isNumeric, productLookups } from './productLookups';
import { tryRow } from './refusedRows';
import { startRowCount } from './rowCount';

export const CUSTOMERS_EXPORT_KIND = 'customers_export';

const rowSchema = z
    .object({ email: z.string().min(1) })
    .catchall(z.union([z.string(), z.number()]));
const packSchema = z.object({
    source: z
        .object({ entity: z.literal('customer_composite'), items: z.array(rowSchema) })
        .passthrough(),
});

export type CustomerExportRow = z.infer<typeof rowSchema>;

/** The pack's rows, or why they cannot be installed. */
export function parseCustomersExport(records: unknown): CustomerExportRow[] {
    const parsed = packSchema.safeParse(records);
    if (!parsed.success)
        throw new Error(
            `The pack's customers_export rows are not in the shape Commerce takes: ${parsed.error.issues[0]?.message}`,
        );
    return parsed.data.source.items;
}

/** The rows by customer, in order: a customer's further addresses come on rows with its email. */
function byCustomer(rows: readonly CustomerExportRow[]): Map<string, CustomerExportRow[]> {
    const customers = new Map<string, CustomerExportRow[]>();
    for (const row of rows)
        customers.set(customerKey(row.email), [
            ...(customers.get(customerKey(row.email)) ?? []),
            row,
        ]);
    return customers;
}

/** One customer's rows as this store takes them: its website and store view, its group's id here. */
async function forStore(
    ctx: KindContext,
    rows: readonly CustomerExportRow[],
    groupId: (code: string) => Promise<number>,
): Promise<CustomerToMake> {
    const out: Array<Record<string, string>> = [];
    for (const row of rows) {
        const fields: Record<string, string> = Object.fromEntries(
            Object.entries(row).map(([k, v]) => [k, String(v)]),
        );
        if (ctx.session.websiteCode) fields._website = ctx.session.websiteCode;
        if (ctx.session.storeCode && fields._store !== undefined)
            fields._store = ctx.session.storeCode;
        if (fields.group_id !== undefined && !isNumeric(fields.group_id))
            fields.group_id = String(await groupId(fields.group_id));
        out.push(fields);
    }
    return { email: rows[0].email, rows: out };
}

/** Make each customer the website lacks, through the Import API, and record it by its email. */
export async function installCustomersExport(
    ctx: KindContext,
    rows: readonly CustomerExportRow[],
): Promise<void> {
    const websiteId = ctx.session.websiteId;
    if (websiteId === undefined)
        throw new Error(
            "The install target names no website, so the pack's customers have nowhere to sign in.",
        );
    const lk = productLookups(ctx);
    const todo: CustomerToMake[] = [];
    const notMade = [...byCustomer(rows)].filter(
        ([key]) =>
            ownedId(ctx.session, CUSTOMER_KIND, key) === undefined &&
            !ctx.recorder.byKey(CUSTOMER_KIND, key),
    );
    // No record keyed by this kind's rows, so it counts its own: one per customer not made yet (`rowCount.ts`).
    const counting = { ...ctx, count: startRowCount(ctx.progress, CUSTOMER_KIND, notMade.map(([key]) => key)) };
    for (const [key, own] of notMade) {
        if (await customerByEmail(ctx.get, own[0].email, websiteId)) {
            ctx.log(`left customer ${key} as it is: the website already has it`);
            counting.count.settled(CUSTOMER_KIND, key);
            continue;
        }
        const customer = await tryRow(ctx, { kind: CUSTOMER_KIND, key }, () =>
            forStore(ctx, own, (code) => lk.groupId(code)),
        );
        if (customer) todo.push(customer);
        else counting.count.settled(CUSTOMER_KIND, key);
    }
    await makeCustomersByImport(counting, todo);
}
