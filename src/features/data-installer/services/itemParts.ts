/**
 * How big a data item is as a store request, and how to send one that is too big in parts
 * (2026-11-05).
 *
 * Both datapack stores run on App Builder, which caps every action's request body at 1 MB and
 * cannot be configured (developer.adobe.com/app-builder/docs/guides/runtime_guides/system-settings/,
 * `payload`). Luma's products are about 5 MB. Demo Builder's own store takes a list of rows in parts
 * (`add-data-item` with `append`, the store's `itemParts.js`); the Data Installer does not, so an
 * item too big for one request cannot go to it, and that is said before anything is written.
 *
 * A list of rows splits, and so does an Import API body (`{ source: { items } }`, the Data Installer's
 * `product_export` kind, 2026-11-06), whose `items` are its rows: each part is the same body with some
 * of them, and the store appends one part's items to the last's (`itemParts.js` there too).
 *
 * Sizes are measured as sent: the rows travel as a JSON string inside the JSON body, so every quote
 * in them is escaped and the body is larger than the rows.
 *
 * @module features/data-installer/services/itemParts
 */

/** The most a request body may hold, with room for the request's other fields. */
export const ONE_REQUEST_BYTES = 950 * 1024;

/** The most one part's rows may hold, as sent. */
export const PART_BYTES = 800 * 1024;

/** A value's size once it is a string inside a JSON body. */
function sentBytes(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(JSON.stringify(value)), 'utf8');
}

/** Whether these rows fit in one request. */
export function fitsOneRequest(records: unknown): boolean {
    return sentBytes(records) <= ONE_REQUEST_BYTES;
}

/** An item's rows, and the item again around some of them: a list is its own rows, an import body its `items`. */
export interface ItemRows {
    rows: unknown[];
    wrap: (rows: unknown[]) => unknown;
}

/** The item's rows, or undefined when it is neither a list nor an Import API body. */
export function rowsOfItem(records: unknown): ItemRows | undefined {
    if (Array.isArray(records)) return { rows: records, wrap: (rows) => rows };
    const source = (records as { source?: { items?: unknown } } | null)?.source;
    if (!source || !Array.isArray(source.items)) return undefined;
    return { rows: source.items, wrap: (rows) => ({ ...(records as object), source: { ...source, items: rows } }) };
}

/** Whether these rows can go in parts: a list, or an Import API body. */
export function splittable(records: unknown): boolean {
    return rowsOfItem(records) !== undefined;
}

/**
 * The item in parts of at most PART_BYTES of rows as sent, at least one row a part, in order, each in
 * the item's own form. An item that fits in one request, or cannot be split, stays one part.
 */
export function partsOf(records: unknown): unknown[] {
    const item = rowsOfItem(records);
    if (fitsOneRequest(records) || !item) return [records];
    return rowParts(item.rows).map(item.wrap);
}

/** Rows in parts of at most PART_BYTES as sent, at least one row a part. */
function rowParts(records: readonly unknown[]): unknown[][] {
    const parts: unknown[][] = [];
    let part: unknown[] = [];
    let bytes = 2;
    for (const row of records) {
        const size = sentBytes(row) + 1;
        if (part.length > 0 && bytes + size > PART_BYTES) {
            parts.push(part);
            part = [];
            bytes = 2;
        }
        part.push(row);
        bytes += size;
    }
    parts.push(part);
    return parts;
}

/**
 * The data types a store could not take, before anything is written: too big for one request, and
 * either the store takes no parts or the item is not a list.
 */
export function itemsTooLarge(
    items: ReadonlyArray<{ dataType: string; records: unknown }>,
    inParts: boolean,
): string[] {
    return items
        .filter((item) => !fitsOneRequest(item.records) && !(inParts && splittable(item.records)))
        .map((item) => item.dataType);
}
