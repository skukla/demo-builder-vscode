/**
 * The store's copy of each thing the record lists, in pack form, and the pack's rows by the
 * name the pack gives them (step 05). Products are read a page at a time by SKU, not one call
 * each; the rest by the routes install already reads.
 *
 * The product page is the Bodea sandbox's captured answer (products-page.json); the inventory
 * lists are the captured `sources.json` / `stocks.json` / `stock-source-links.json` shapes,
 * typed to `commerceWire`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { productLookups } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import { packedFingerprint, readCopies, rowsByKey } from '@/features/data-installer/services/demoBuilderEngine/storeCopies';
import { fingerprintRow } from '@/features/data-installer/services/demoBuilderEngine/fingerprint';
import type { CommerceInventoryStock, CommerceProduct, CommerceStockSourceLink } from '@/types/commerceWire';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

const CAPTURED = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../../fixtures/commerce-rest/products-page.json'), 'utf8'),
) as { body: { items: CommerceProduct[] } };

const skuIn = (skus: string) =>
    page('products', `&searchCriteria[filterGroups][0][filters][0][field]=sku&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(skus)}&searchCriteria[filterGroups][0][filters][0][conditionType]=in`);

const STOCK: CommerceInventoryStock = { stock_id: 7, name: 'Bodea Stock', extension_attributes: { sales_channels: [{ type: 'website', code: 'bodea' }] } };
const LINK: CommerceStockSourceLink = { stock_id: 7, source_code: 'east', priority: 1 };
/** The inventory's three lists, at the addresses `readInventory` reads them from. */
const INVENTORY = {
    'inventory/sources?searchCriteria[pageSize]=200': { items: [{ source_code: 'east', name: 'East', enabled: true }] },
    'inventory/stocks?searchCriteria[pageSize]=200': { items: [STOCK] },
    'inventory/stock-source-links?searchCriteria[pageSize]=200': { items: [LINK] },
};

describe('readCopies', () => {
    it('reads recorded products a page of SKUs at a time, and leaves out one the store no longer has', async () => {
        const ctx = await fakeContext({
            [skuIn('essentials-plan,DigiWristQuantum,gone-sku')]: { items: CAPTURED.body.items, total_count: 2 },
        });

        const copies = await readCopies(ctx, productLookups(ctx), 'products', [
            { kind: 'products', id: 'essentials-plan' },
            { kind: 'products', id: 'DigiWristQuantum' },
            { kind: 'products', id: 'gone-sku' },
        ]);

        expect([...copies.keys()]).toEqual(['essentials-plan', 'DigiWristQuantum']);
        expect((copies.get('DigiWristQuantum') as { product: CommerceProduct }).product.sku).toBe('DigiWristQuantum');
    });

    it('reads stocks, sources and links from one read of the inventory, naming a link\'s stock', async () => {
        const ctx = await fakeContext(INVENTORY);

        const links = await readCopies(ctx, productLookups(ctx), 'stock_source_links', [{ kind: 'stock_source_links', id: '7/east' }]);
        const stocks = await readCopies(ctx, productLookups(ctx), 'stocks', [{ kind: 'stocks', id: '7' }, { kind: 'stocks', id: '8' }]);

        expect(links.get('7/east')).toEqual({ stockSourceLink: { stock_id: 'Bodea Stock', source_code: 'east', priority: 1 } });
        expect(stocks.get('7')).toEqual({ stock: { name: 'Bodea Stock' } });
        expect(stocks.has('8')).toBe(false);
    });

    it('reads an added option by its id, and finds it gone when the attribute no longer has it', async () => {
        const ctx = await fakeContext({
            'products/attributes/color': { attribute_code: 'color', frontend_input: 'select', options: [{ label: 'Teal', value: '51' }] },
        });

        const copies = await readCopies(ctx, productLookups(ctx), 'attribute_options', [
            { kind: 'attribute_options', id: 'color/51' },
            { kind: 'attribute_options', id: 'color/52' },
        ]);

        expect(copies.get('color/51')).toEqual({ attribute_code: 'color', label: 'Teal' });
        expect(copies.has('color/52')).toBe(false);
    });
});

describe('rowsByKey', () => {
    it('lists a pack\'s categories, its root among them, by their place under the root', () => {
        const rows = rowsByKey('categories', {
            root_category: { name: 'Bodea' },
            categories: [{ category: { name: 'Products', path: 'Bodea' } }],
        });

        expect([...rows.keys()]).toEqual(['(root)', 'Products']);
    });

    it('lists the options an attribute row carries, for the option kind', () => {
        const rows = rowsByKey('attribute_options', [{ attribute: { attribute_code: 'color', frontend_input: 'select', options: [{ label: 'Teal' }] } }]);

        expect(rows.get('color/Teal')).toEqual({ attribute_code: 'color', label: 'Teal' });
    });
});

describe('packedFingerprint', () => {
    it('hashes a product\'s whole row, so any change the pack makes is an update', () => {
        const row = { product: { sku: 'vrrack', price: 10 } };

        expect(packedFingerprint('products', row)).toBe(fingerprintRow(row));
    });

    it('hashes only an attribute\'s options, the one part a repeat install brings in', () => {
        const a = { attribute: { attribute_code: 'color', frontend_input: 'select', default_frontend_label: 'Colour', options: [{ label: 'Teal' }] } };
        const b = { attribute: { ...a.attribute, default_frontend_label: 'Color' } };

        expect(packedFingerprint('product_attributes', a)).toBe(packedFingerprint('product_attributes', b));
    });

    it('hashes a set by its name alone: it has nothing else to bring in', () => {
        expect(packedFingerprint('attribute_sets', { attributeSet: { attribute_set_name: 'Racks', sort_order: 1 } })).toBe(
            packedFingerprint('attribute_sets', { attributeSet: { attribute_set_name: 'Racks', sort_order: 9 } }),
        );
    });
});
