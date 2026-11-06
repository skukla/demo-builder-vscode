/**
 * exportRows and exportCategories — a Commerce product export read into rows, and the categories
 * its products name. Column names and values are Luma's own export's (Luma's source repo is public;
 * tests/fixtures/data-installer/commerce-product-export-luma.csv, trimmed to seven products).
 */

import * as fs from 'fs';
import * as path from 'path';
import { CsvError } from '@/features/data-installer/services/exportPack/csvTable';
import { categoriesFromPaths, categoryUrlKeys, onRoot } from '@/features/data-installer/services/exportPack/exportCategories';
import { firstRows, openRow, pairs, readExportTable } from '@/features/data-installer/services/exportPack/exportRows';

const CSV = fs.readFileSync(path.join(__dirname, '../../../../fixtures/data-installer/commerce-product-export-luma.csv'), 'utf8');

describe('readExportTable', () => {
    it('reads the CSV Commerce writes, a quoted description with a line break included', () => {
        const rows = readExportTable(CSV, 'products.csv');

        expect(rows).toHaveLength(7);
        expect(rows[0].sku).toBe('MH01-XS-Black');
        expect(rows[0].description).toBe('Soft, "warm" and\nwashable, in two lines.');
    });

    it('reads the same table kept as JSON, as Luma\'s source repo keeps it', () => {
        const table = [['sku', 'name'], ['MH01', 'Chaz Kangeroo Hoodie']];
        const wrapped = JSON.stringify({ data: { productExport: { data: JSON.stringify(table) } } });

        expect(readExportTable(wrapped, 'products.json')).toEqual([{ sku: 'MH01', name: 'Chaz Kangeroo Hoodie' }]);
        expect(readExportTable(JSON.stringify(table), 'products.json')).toEqual([{ sku: 'MH01', name: 'Chaz Kangeroo Hoodie' }]);
    });

    it('refuses a file with no sku column: it is not a product export', () => {
        expect(() => readExportTable('email,firstname\na@b.c,A\n', 'customers.csv')).toThrow(/no sku column/);
        expect(() => readExportTable('{"a":1}', 'x.json')).toThrow(CsvError);
    });
});

describe('opening a row', () => {
    it('splits a map on a comma only where a new key follows, so a value may hold a comma', () => {
        expect(pairs('climate=All-Weather|Cool,material=Wool, Cotton,new=No')).toEqual({
            climate: 'All-Weather|Cool',
            material: 'Wool, Cotton',
            new: 'No',
        });
    });

    it('opens the categories, the extras and a configurable\'s variations', () => {
        const mh01 = firstRows(readExportTable(CSV, 'p.csv').map(openRow)).find((r) => r.fields.sku === 'MH01')!;

        expect(mh01.categories).toContain('Luma Catalog/Men/Tops/Hoodies & Sweatshirts');
        expect(mh01.extra.eco_collection).toBe('Yes');
        expect(mh01.variations).toEqual([
            { sku: 'MH01-XS-Black', size: 'XS', color: 'Black' },
            { sku: 'MH01-XS-Gray', size: 'XS', color: 'Gray' },
        ]);
    });

    it('keeps one row per SKU, the store-wide one over a store view\'s', () => {
        const rows = [
            openRow({ sku: 'A', store_view_code: 'default', name: 'view' }),
            openRow({ sku: 'A', store_view_code: '', name: 'store-wide' }),
        ];
        expect(firstRows(rows).map((r) => r.fields.name)).toEqual(['store-wide']);
    });
});

describe('categoriesFromPaths', () => {
    it('makes the tree the paths name under the pack\'s own root, a same-named category keyed apart', () => {
        const paths = onRoot(['Default Category/Men/Tops/Jackets', 'Default Category/Women/Tops/Jackets'], 'Luma Catalog');
        const tree = categoriesFromPaths(paths, 'Luma Catalog');
        const keys = categoryUrlKeys(tree);

        expect(tree.root_category.name).toBe('Luma Catalog');
        expect(keys.get('Luma Catalog/Men/Tops/Jackets')).toBe('jackets');
        expect(keys.get('Luma Catalog/Women/Tops/Jackets')).toBe('jackets-women');
        expect(new Set(keys.values()).size).toBe(keys.size);
        expect(tree.categories.map((c) => c.category.parent_id)).toEqual([3, 3, 4, 4, 5, 5]);
    });
});
