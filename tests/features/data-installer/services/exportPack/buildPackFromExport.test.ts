/**
 * buildPackFromExport — a datapack from a Commerce product export, with and without a base pack.
 *
 * The export is Luma's own, trimmed (tests/fixtures/data-installer/commerce-product-export-luma.csv;
 * Luma's source repo is public). On the full Luma and Venia exports the products, gift cards and
 * stock it makes matched the converter that rebuilt both packs row for row (2026-11-05, 3,208
 * products, website ids and SKU case aside: the converter lowercased SKUs to match the Data
 * Installer's packs); these pin the behaviour on a few rows.
 */

import * as fs from 'fs';
import * as path from 'path';
import { packRowProblems } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import { buildPackFromExport } from '@/features/data-installer/services/exportPack/buildPackFromExport';

const CSV = fs.readFileSync(path.join(__dirname, '../../../../fixtures/data-installer/commerce-product-export-luma.csv'), 'utf8');
const ID = { name: 'luma-from-export', version: 'main' };

const itemOf = (pack: DatapackFile, kind: string) => pack.items.find((i) => i.dataType === kind)?.records;
type Row = { product: Record<string, any> };
const product = (pack: DatapackFile, sku: string) => (itemOf(pack, 'products') as Row[]).find((r) => r.product.sku === sku)!.product;

/** A base pack defining the attributes the export's products name, as the Data Installer's Luma does. */
const BASE: DatapackFile = {
    id: { name: 'luma', version: 'eds-compatible' },
    displayName: 'Luma',
    items: [
        {
            dataType: 'product_attributes',
            records: [
                ...['color', 'size'].map((code) => ({ attribute: { attribute_code: code, frontend_input: 'select' } })),
                { attribute: { attribute_code: 'climate', frontend_input: 'multiselect' } },
                ...['eco_collection', 'new'].map((code) => ({ attribute: { attribute_code: code, frontend_input: 'boolean' } })),
            ],
        },
        { dataType: 'cart_rules', records: [{ rule: { name: 'Spend $50' } }] },
        { dataType: 'products', records: [{ product: { sku: 'old' } }] },
    ],
};

describe('buildPackFromExport', () => {
    it('makes products, gift cards, categories and stock, children before the products that link them', () => {
        const { pack, products, giftCards } = buildPackFromExport({ exportText: CSV, exportName: 'products.csv', id: ID, displayName: 'Luma' });

        expect(pack.items.map((i) => i.dataType)).toEqual(['categories', 'products', 'giftcards', 'source_items', 'stock_source_links']);
        expect([products, giftCards]).toEqual([6, 1]);
        const types = (itemOf(pack, 'products') as Row[]).map((r) => r.product.type_id);
        expect(types.indexOf('configurable')).toBeGreaterThan(types.lastIndexOf('simple'));
        expect(product(pack, 'MH01').extension_attributes.configurable_product_links).toEqual(['MH01-XS-Black', 'MH01-XS-Gray']);
        expect(product(pack, '24-WG085_Group').product_links.map((l: any) => l.linked_product_sku)).toEqual(['24-WG085', '24-WG086']);
        const gift = (itemOf(pack, 'giftcards') as Row[])[0].product;
        expect(gift.extension_attributes.giftcard_amounts).toEqual([{ value: 10 }, { value: 20 }]);
        expect((itemOf(pack, 'source_items') as { sourceItems: unknown[] }).sourceItems).toHaveLength(6);
    });

    it('passes the install\'s own row checks', () => {
        const { pack } = buildPackFromExport({ exportText: CSV, exportName: 'products.csv', id: ID, displayName: 'Luma' });
        expect(packRowProblems(Object.fromEntries(pack.items.map((i) => [i.dataType, i.records])), undefined)).toStrictEqual([]);
    });

    it('without a base pack keeps Commerce\'s own fields and names every attribute it left out', () => {
        const result = buildPackFromExport({ exportText: CSV, exportName: 'products.csv', id: ID, displayName: 'Luma' });
        const codes = product(result.pack, 'MH01-XS-Black').custom_attributes.map((a: any) => a.attribute_code);

        expect(codes).not.toContain('color');
        expect(result.leftOutAttributes).toEqual(expect.arrayContaining(['color', 'size', 'eco_collection']));
        expect(result.leftOutAttributes).not.toContain('giftcard_type');
        // The storefront takes any SKU (ADR-024), so the export's are kept exactly.
        expect(product(result.pack, 'MH01-XS-Black').sku).toBe('MH01-XS-Black');
    });

    it('with a base pack keeps its attributes and other kinds, and replaces its products', () => {
        const { pack, leftOutAttributes } = buildPackFromExport({ exportText: CSV, exportName: 'products.csv', id: ID, displayName: 'Luma', base: BASE });
        const codes = product(pack, 'MH01-XS-Black').custom_attributes.map((a: any) => a.attribute_code);

        expect(codes).toEqual(expect.arrayContaining(['color', 'size']));
        expect(leftOutAttributes).not.toContain('color');
        expect(itemOf(pack, 'cart_rules')).toEqual(BASE.items[1].records);
        expect((itemOf(pack, 'products') as Row[]).some((r) => r.product.sku === 'old')).toBe(false);
    });

    // Live, 2026-11-06: "Yoga|Gym" read whole named no option, and 49 Luma products were skipped.
    it('holds a multi-select\'s values as a list of labels, not the export\'s |-joined string', () => {
        const { pack } = buildPackFromExport({ exportText: CSV, exportName: 'products.csv', id: ID, displayName: 'Luma', base: BASE });
        const climate = product(pack, 'MH01').custom_attributes.find((a: any) => a.attribute_code === 'climate');

        expect(climate.value).toEqual(['All-Weather', 'Cool', 'Indoor', 'Spring', 'Windy']);
    });

    // Live, 2026-11-06: Commerce refused "Yes" where it takes 1, and 163 Luma products were skipped.
    it('holds a yes/no attribute as 1 or 0, not the export\'s Yes or No', () => {
        const { pack } = buildPackFromExport({ exportText: CSV, exportName: 'products.csv', id: ID, displayName: 'Luma', base: BASE });
        const value = (code: string) => product(pack, 'MH01').custom_attributes.find((a: any) => a.attribute_code === code)?.value;

        expect([value('eco_collection'), value('new')]).toEqual(['1', '0']);
    });

    // 2026-11-06: the service's own import-form kind, installed through the Import API twice as fast.
    it("carries the export's rows in import form, the base pack's other kinds kept, images left out and every attribute kept", () => {
        const { pack, products, giftCards, leftOutAttributes } = buildPackFromExport({ exportText: CSV, exportName: 'products.csv', id: ID, displayName: 'Luma', base: BASE, importForm: true });

        expect(pack.items.map((i) => i.dataType)).toEqual(['product_attributes', 'cart_rules', 'product_export']);
        const source = (itemOf(pack, 'product_export') as { source: { entity: string; behavior: string; items: Array<Record<string, string>> } }).source;
        expect([source.entity, source.behavior]).toEqual(['catalog_product', 'append']);
        expect(source.items.map((r) => r.sku)).toContain('MH01');
        expect([products, giftCards]).toEqual([6, 1]);
        const mh01 = source.items.find((r) => r.sku === 'MH01') as Record<string, string>;
        expect(mh01.base_image).toBeUndefined();
        expect(mh01.additional_attributes).toContain('climate=All-Weather|Cool|Indoor|Spring|Windy');
        // Commerce's own attributes are not in a base pack's list, so none is dropped against it.
        expect(mh01.additional_attributes).toContain('material=');
        expect(leftOutAttributes).toStrictEqual([]);
        expect(packRowProblems(Object.fromEntries(pack.items.map((i) => [i.dataType, i.records])), undefined)).toStrictEqual([]);
    });

    // Luma's variations say size "32" where the option is "Size 32": 50 configurables refused (2026-11-06).
    it("names a configurable's option values by the base pack's options, in both forms", () => {
        const sized: DatapackFile = {
            ...BASE,
            items: BASE.items.map((item) =>
                item.dataType === 'product_attributes'
                    ? { ...item, records: [{ attribute: { attribute_code: 'size', frontend_input: 'select', options: [{ label: 'Size XS' }] } }] }
                    : item,
            ),
        };
        const records = buildPackFromExport({ exportText: CSV, exportName: 'products.csv', id: ID, displayName: 'Luma', base: sized });
        const imported = buildPackFromExport({ exportText: CSV, exportName: 'products.csv', id: ID, displayName: 'Luma', base: sized, importForm: true });

        const sizeOption = product(records.pack, 'MH01').extension_attributes.configurable_product_options.find((o: any) => o.attribute_id === 'size');
        expect(sizeOption.values).toEqual([{ value_index: 'Size XS' }]);
        const rows = (itemOf(imported.pack, 'product_export') as { source: { items: Array<Record<string, string>> } }).source.items;
        expect(rows.find((r) => r.sku === 'MH01')?.configurable_variations).toBe('sku=MH01-XS-Black,size=Size XS,color=Black|sku=MH01-XS-Gray,size=Size XS,color=Gray');
    });

    it('refuses a file that holds no products', () => {
        expect(() => buildPackFromExport({ exportText: 'sku,name\n', exportName: 'p.csv', id: ID, displayName: 'Luma' })).toThrow(/holds no products/);
    });
});
