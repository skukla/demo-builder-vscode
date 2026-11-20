/**
 * csvTable — our own CSV reader (owner, 2026-11-05: no parser from npm, PL-94). Each case is one a
 * file may carry after passing through Excel, which is why each has its own test.
 */

import { CsvError, parseCsv } from '@/features/data-installer/services/exportPack/csvTable';

describe('parseCsv', () => {
    it('reads plain fields and rows', () => {
        expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('keeps a comma, a doubled quote and a line break inside a quoted field', () => {
        expect(parseCsv('sku,description\nX,"Soft, ""warm"" and\nwashable"\n')).toEqual([
            ['sku', 'description'],
            ['X', 'Soft, "warm" and\nwashable'],
        ]);
    });

    it('takes Windows and old Mac line ends, and a last line with no line end', () => {
        expect(parseCsv('a,b\r\n1,2\r3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
    });

    it('drops the byte-order mark Excel writes at the start', () => {
        expect(parseCsv('﻿sku,name\nX,Y')).toEqual([['sku', 'name'], ['X', 'Y']]);
    });

    it('keeps empty fields, including a trailing one', () => {
        expect(parseCsv('a,,c,\n')).toEqual([['a', '', 'c', '']]);
    });

    it('refuses a quote that never closes, rather than reading the rest as one field', () => {
        expect(() => parseCsv('sku,description\nX,"never closed\nY,2\n')).toThrow(CsvError);
    });
});
