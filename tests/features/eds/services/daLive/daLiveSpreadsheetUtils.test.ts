/**
 * convertSpreadsheetJsonToHtml — a served sheet turned into the table DA.live takes.
 *
 * The fixtures are what aem.live really serves (read 2026-10-12 from a colleague's
 * storefront, `/placeholders/cart.json` and `/metadata.json`), cut down to two rows.
 * Neither carries a `columns` list: version 3 of the sheet format serves
 * total/offset/limit/data and nothing else, so the column names can only come from
 * the rows. The multi-sheet branch did not know that and wrote a table with no
 * columns at all, which is every label lost (EDS-40).
 */

import { convertSpreadsheetJsonToHtml } from '@/features/eds/services/daLive/daLiveSpreadsheetUtils';

const MULTI_SHEET = {
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

const SINGLE_SHEET = { total: 1, limit: 1, offset: 0, data: [{ URL: '/about' }], ':type': 'sheet' };

describe('a multi-sheet document as aem.live serves it', () => {
    it('keeps every column and row of a sheet that names no columns', () => {
        const html = convertSpreadsheetJsonToHtml(MULTI_SHEET);

        expect(html).toContain('<th>Key</th><th>Value</th>');
        expect(html).toContain('<td>Cart.Cart.heading</td><td>Shopping Cart ({count})</td>');
        expect(html).toContain('<td>Cart.Cart.editCart</td><td>Edit</td>');
    });

    it('names the table for its sheet and leaves the do-not-translate sheet out', () => {
        const html = convertSpreadsheetJsonToHtml(MULTI_SHEET);

        expect(html).toContain('<table class="sheet-data">');
        expect(html).not.toContain('dnt-sheet');
    });

    it('uses the columns a sheet does declare, in that order', () => {
        const html = convertSpreadsheetJsonToHtml({
            ...MULTI_SHEET,
            data: { ...MULTI_SHEET.data, columns: ['Value', 'Key'] },
        });

        expect(html).toContain('<th>Value</th><th>Key</th>');
    });
});

describe('a single sheet as aem.live serves it', () => {
    it('takes its columns from the first row', () => {
        const html = convertSpreadsheetJsonToHtml(SINGLE_SHEET);

        expect(html).toContain('<th>URL</th>');
        expect(html).toContain('<td>/about</td>');
    });

    it('answers null for something that is not a sheet', () => {
        expect(convertSpreadsheetJsonToHtml({ message: 'not found' })).toBeNull();
    });
});
