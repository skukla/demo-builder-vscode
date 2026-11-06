/**
 * itemParts — how big a data item is as a store request, and its parts when too big (2026-11-05).
 */

import { fitsOneRequest, itemsTooLarge, ONE_REQUEST_BYTES, PART_BYTES, partsOf } from '@/features/data-installer/services/itemParts';

const rowsOf = (count: number, bytes: number) => Array.from({ length: count }, (_, i) => ({ sku: `s${i}`, text: 'x'.repeat(bytes) }));
const sent = (value: unknown) => Buffer.byteLength(JSON.stringify(JSON.stringify(value)));

describe('partsOf', () => {
    it('keeps rows that fit in one request as one part', () => {
        const rows = rowsOf(3, 100);
        expect(partsOf(rows)).toEqual([rows]);
    });

    it('splits rows that do not into parts each under the part size as sent, in order', () => {
        const rows = rowsOf(30, 50 * 1024);
        const parts = partsOf(rows);

        expect(parts.length).toBeGreaterThan(1);
        expect(parts.every((part) => sent(part) <= PART_BYTES)).toBe(true);
        expect((parts as unknown[][]).flat()).toEqual(rows);
    });

    // 2026-11-06: the Data Installer's product_export kind is one Import API body; its items are its rows.
    it('splits an Import API body into the same body with some of its items each, in order', () => {
        const body = { source: { entity: 'catalog_product', behavior: 'append', items: rowsOf(30, 50 * 1024) } };
        const parts = partsOf(body) as Array<typeof body>;

        expect(parts.length).toBeGreaterThan(1);
        expect(parts.every((part) => part.source.entity === 'catalog_product' && sent(part) <= PART_BYTES + 1024)).toBe(true);
        expect(parts.flatMap((part) => part.source.items)).toEqual(body.source.items);
        expect(itemsTooLarge([{ dataType: 'product_export', records: body }], true)).toStrictEqual([]);
        expect(itemsTooLarge([{ dataType: 'product_export', records: body }], false)).toEqual(['product_export']);
    });

    it('measures the rows as sent, with their quotes escaped, not as they are', () => {
        const quoted = [{ text: '"'.repeat(Math.round(ONE_REQUEST_BYTES * 0.4)) }];
        expect(Buffer.byteLength(JSON.stringify(quoted))).toBeLessThan(ONE_REQUEST_BYTES);
        expect(fitsOneRequest(quoted)).toBe(false);
    });
});

describe('itemsTooLarge', () => {
    const items = [
        { dataType: 'products', records: rowsOf(30, 50 * 1024) },
        { dataType: 'categories', records: { categories: rowsOf(30, 50 * 1024) } },
        { dataType: 'coupons', records: [] },
    ];

    it('names a large list only for a store that takes no parts, and a large non-list for any store', () => {
        expect(itemsTooLarge(items, false)).toEqual(['products', 'categories']);
        expect(itemsTooLarge(items, true)).toEqual(['categories']);
    });
});
