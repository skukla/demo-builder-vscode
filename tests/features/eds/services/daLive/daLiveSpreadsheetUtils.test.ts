/**
 * The DA.live sheet document: reading what aem.live serves, and building what
 * DA.live stores.
 *
 * The fixtures are what aem.live really serves (read 2026-10-12 from a colleague's
 * storefront, `/placeholders/cart.json` and `/redirects.json`), the first cut down to
 * two rows. Neither carries a `columns` list.
 *
 * The expected document is the one shape proven to be a real sheet: it is what
 * `createJsonSpreadsheet` writes for `/.da/library/blocks.json`, which answers 200 on
 * a live site, with and without `?sheet=data`.
 */

import {
    buildSheetDocument,
    readServedSheets,
    type DaLiveSheetDocument,
    type NamedSheet,
} from '@/features/eds/services/daLive/daLiveSpreadsheetUtils';

const SERVED_MULTI_SHEET = {
    data: {
        total: 2,
        offset: 0,
        limit: 2,
        data: [
            { Key: 'Cart.Cart.heading', Value: 'Shopping Cart ({count})' },
            { Key: 'Cart.Cart.editCart', Value: 'Edit' },
        ],
    },
    dnt: { total: 1, offset: 0, limit: 1, data: [{ 'dnt-sheet': '*', 'dnt-columns': 'Key' }] },
    ':version': 3,
    ':names': ['data', 'dnt'],
    ':type': 'multi-sheet',
};

const SERVED_SINGLE_SHEET = { total: 1, limit: 1, offset: 0, data: [{ URL: '' }], ':type': 'sheet' };

describe('readServedSheets', () => {
    it('reads every sheet of a multi-sheet document, in the order it names them', () => {
        expect(readServedSheets(SERVED_MULTI_SHEET)).toStrictEqual([
            { name: 'data', rows: SERVED_MULTI_SHEET.data.data, total: 2, sheetParam: 'data' },
            { name: 'dnt', rows: SERVED_MULTI_SHEET.dnt.data, total: 1, sheetParam: 'dnt' },
        ]);
    });

    it('carries the total the server states, which can exceed the rows on this page', () => {
        const sheets = readServedSheets({ ...SERVED_SINGLE_SHEET, total: 2500 });

        expect(sheets?.[0]).toMatchObject({ total: 2500, rows: [{ URL: '' }] });
    });

    it('takes the row count as the total when the server states none', () => {
        expect(readServedSheets({ data: [{ a: '1' }, { a: '2' }] })?.[0].total).toBe(2);
    });

    it('reads a single sheet as one sheet named data', () => {
        // No `sheetParam`: a single sheet is the whole document, asked for bare.
        expect(readServedSheets(SERVED_SINGLE_SHEET)).toStrictEqual([
            { name: 'data', rows: [{ URL: '' }], total: 1 },
        ]);
    });

    it('leaves out a named sheet that has no row list', () => {
        const sheets = readServedSheets({ ...SERVED_MULTI_SHEET, ':names': ['data', 'gone'] });

        expect(sheets?.map((sheet) => sheet.name)).toStrictEqual(['data']);
    });

    it.each([
        ['an error body', { message: 'not found' }],
        ['a multi-sheet document with no readable sheet', { ':type': 'multi-sheet', ':names': ['x'] }],
        ['null', null],
        ['a string', 'nope'],
    ])('answers null for %s', (_label, served) => {
        expect(readServedSheets(served)).toBeNull();
    });
});

describe('buildSheetDocument', () => {
    it('builds the multi-sheet document DA.live stores, one entry per sheet', () => {
        const sheets: NamedSheet[] = [
            { name: 'data', rows: [{ Key: 'a', Value: 'b' }, { Key: 'c', Value: 'd' }] },
            { name: 'dnt', rows: [{ 'dnt-sheet': '*', 'dnt-columns': 'Key' }] },
        ];

        const expected: DaLiveSheetDocument = {
            data: {
                total: 2,
                limit: 2,
                offset: 0,
                data: [{ Key: 'a', Value: 'b' }, { Key: 'c', Value: 'd' }],
                ':colWidths': [300, 300],
            },
            dnt: {
                total: 1,
                limit: 1,
                offset: 0,
                data: [{ 'dnt-sheet': '*', 'dnt-columns': 'Key' }],
                ':colWidths': [300, 300],
            },
            ':names': ['data', 'dnt'],
            ':version': 3,
            ':type': 'multi-sheet',
        };
        expect(buildSheetDocument(sheets)).toStrictEqual(expected);
    });

    it('sizes the column widths from the declared columns when a sheet has them', () => {
        const document = buildSheetDocument([
            { name: 'data', rows: [], columns: ['name', 'path', 'note'] },
        ]);

        expect(document.data).toStrictEqual({
            total: 0,
            limit: 0,
            offset: 0,
            data: [],
            ':colWidths': [300, 300, 300],
        });
    });

    it('turns what aem.live serves into a document with the same sheets and rows', () => {
        const document = buildSheetDocument(readServedSheets(SERVED_MULTI_SHEET) ?? []);

        expect(document[':names']).toStrictEqual(['data', 'dnt']);
        expect(document[':type']).toBe('multi-sheet');
        expect(document.data).toMatchObject({ total: 2, data: SERVED_MULTI_SHEET.data.data });
        expect(document.dnt).toMatchObject({ total: 1, data: SERVED_MULTI_SHEET.dnt.data });
    });

    it('turns a single served sheet into a document whose one sheet is named data', () => {
        const document = buildSheetDocument(readServedSheets(SERVED_SINGLE_SHEET) ?? []);

        expect(document[':names']).toStrictEqual(['data']);
        expect(document.data).toMatchObject({ total: 1, limit: 1, offset: 0, data: [{ URL: '' }] });
    });
});
