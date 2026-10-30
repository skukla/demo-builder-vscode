/**
 * A pack is never saved with a credential in it (datapack-engine step 08; research
 * `.rptc/research/project-export-datapacks/`, "Open": rows travel in files, so the "never a
 * credential" rule applies to rows).
 *
 * Bodea's customer rows each carry a top-level `password` (read 2026-10-29), so an SC's buyers can
 * sign in on the storefront once the pack is installed. Demo Builder's engine still sends it when
 * it creates the customer (`customerKinds.ts`); it is never logged, never hashed into the install
 * record, and never written into a saved pack, a copy between stores or a zip: every writer runs
 * its rows through this first. Commerce's own credential fields (`password_hash`, `rp_token`) are
 * dropped too, in case a hand-made row carries them.
 *
 * @module features/data-installer/services/packCredentials
 */

/** Credential fields on a customer row or inside its `customer`. */
const CREDENTIAL_FIELDS = new Set(['password', 'password_hash', 'rp_token', 'rp_token_created_at']);

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);

function stripped(row: unknown): unknown {
    if (!isRow(row)) return row;
    return Object.fromEntries(Object.entries(row).filter(([key]) => !CREDENTIAL_FIELDS.has(key)));
}

/** One `customers` row: no credential at the top or inside its customer. */
function customerRow(row: unknown): unknown {
    const top = stripped(row);
    if (!isRow(top) || !isRow(top.customer)) return top;
    return { ...top, customer: stripped(top.customer) };
}

/** `customers_export` (the bulk import's form): its `source.items` rows. */
function bulkCustomers(records: unknown): unknown {
    if (!isRow(records) || !isRow(records.source) || !Array.isArray(records.source.items)) return records;
    return { ...records, source: { ...records.source, items: records.source.items.map(stripped) } };
}

/**
 * A data kind's rows with no credential in them; any other kind is answered unchanged.
 *
 * @param dataType - the pack's data kind
 * @param records - its rows, as the pack holds them
 */
export function withoutCredentials(dataType: string, records: unknown): unknown {
    if (dataType === 'customers' && Array.isArray(records)) return records.map(customerRow);
    if (dataType === 'customers_export') return bulkCustomers(records);
    return records;
}
