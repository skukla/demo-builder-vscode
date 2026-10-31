/**
 * Products read off a website as ACO pack rows (PL-60 slice A). The rows must pass the Data
 * Installer's own schemas (`acoRowsProblem`), every value the page did not state must be named as
 * proposed, and nothing is made up silently: a SKU the tool has to make is named as proposed too,
 * and a product with no price gets no price row rather than an invented one.
 */

import { acoRowsProblem } from '@/features/data-installer/services/acoExport/acoPackSchemas';
import {
    ScrapedPackError,
    scrapedAcoRows,
} from '@/features/data-installer/services/acoWebsite/scrapedAcoRows';
import type { ScrapedProduct } from '@/types/scrapedProduct';

const LISTING = 'https://shop.example.com/collections/boots';

const BOOT: ScrapedProduct = {
    origin: LISTING,
    readFrom: 'json-ld',
    data: {
        name: 'Trail Boot',
        image: 'https://cdn.example.com/trail-boot.jpg',
        description: 'A waterproof boot.',
        price: 129.5,
        currency: 'USD',
        categories: ['Boots', 'Hiking'],
        sku: 'TB-001',
        url: 'https://shop.example.com/products/trail-boot',
        attributes: [{ name: 'Shoe Size', values: ['8', '9', '10'] }],
    },
};

const SANDAL: ScrapedProduct = {
    origin: LISTING,
    readFrom: 'page',
    data: { name: 'Beach Sandal', image: 'https://cdn.example.com/sandal.png', price: 40 },
    proposed: ['price'],
};

const OPTIONS = { locale: 'en-US', currency: 'usd', priceBookId: 'main', priceBookName: 'Boots shop' };

describe('scrapedAcoRows', () => {
    it('makes one product, price and category row per product, in the shapes the schemas take', () => {
        const { rows } = scrapedAcoRows([BOOT, SANDAL], OPTIONS);

        expect(rows.aco_products).toHaveLength(2);
        expect(rows.aco_products[0]).toEqual({
            sku: 'TB-001',
            source: { locale: 'en-US' },
            name: 'Trail Boot',
            slug: 'trail-boot',
            status: 'ENABLED',
            visibleIn: ['CATALOG', 'SEARCH'],
            description: 'A waterproof boot.',
            images: [{ url: 'https://cdn.example.com/trail-boot.jpg', label: 'Trail Boot', roles: ['BASE', 'THUMBNAIL'] }],
            routes: [{ path: 'boots' }, { path: 'hiking' }],
            attributes: [{ code: 'shoe_size', values: ['8', '9', '10'] }],
        });
        expect(rows.aco_categories).toEqual([
            { slug: 'boots', source: { locale: 'en-US' }, name: 'Boots', description: null },
            { slug: 'hiking', source: { locale: 'en-US' }, name: 'Hiking', description: null },
        ]);
        expect(rows.aco_price_books).toEqual([{ priceBookId: 'main', name: 'Boots shop', currency: 'USD' }]);
        expect(rows.aco_prices).toEqual([
            { sku: 'TB-001', priceBookId: 'main', regular: 129.5 },
            { sku: expect.any(String), priceBookId: 'main', regular: 40 },
        ]);
        expect(rows.aco_metadata).toEqual([
            {
                code: 'shoe_size',
                source: { locale: 'en-US' },
                visibleIn: ['PRODUCT_DETAIL'],
                label: 'Shoe Size',
                dataType: 'TEXT',
                searchTypes: [],
                filterable: true,
            },
        ]);
        for (const kind of ['aco_products', 'aco_categories', 'aco_price_books', 'aco_prices', 'aco_metadata'] as const)
            expect(acoRowsProblem(kind, rows[kind])).toBeUndefined();
    });

    it('makes a SKU from the name when none was read, and names it as proposed', () => {
        const { rows, proposed } = scrapedAcoRows([SANDAL], OPTIONS);

        expect(rows.aco_products[0].sku).toBe('BEACHSAN');
        expect(proposed).toEqual([{ sku: 'BEACHSAN', name: 'Beach Sandal', fields: ['price', 'sku'] }]);
    });

    it('keeps made SKUs unique and at most 8 characters', () => {
        const twin: ScrapedProduct = { ...SANDAL, data: { ...SANDAL.data, name: 'Beach Sandals' } };
        const { rows } = scrapedAcoRows([SANDAL, twin], OPTIONS);

        const skus = rows.aco_products.map((p) => p.sku);
        expect(new Set(skus).size).toBe(2);
        for (const sku of skus) expect(sku.length).toBeLessThanOrEqual(8);
    });

    it('keeps slugs unique when two products share a name', () => {
        const again: ScrapedProduct = { ...BOOT, data: { ...BOOT.data, sku: 'TB-002' } };
        const { rows } = scrapedAcoRows([BOOT, again], OPTIONS);

        expect(rows.aco_products.map((p) => p.slug)).toEqual(['trail-boot', 'trail-boot-2']);
    });

    it('gives a product with no price no price row, and names it unpriced', () => {
        const noPrice: ScrapedProduct = { origin: LISTING, data: { name: 'Mystery Box', image: 'https://cdn.example.com/box.jpg', sku: 'MB' } };
        const { rows, unpriced } = scrapedAcoRows([noPrice], OPTIONS);

        expect(rows.aco_prices).toStrictEqual([]);
        expect(rows.aco_price_books).toStrictEqual([]);
        expect(unpriced).toEqual(['MB']);
        expect(rows.aco_products[0].description).toBeNull();
    });

    it('refuses two products that state the same SKU, naming both', () => {
        const clash: ScrapedProduct = { ...SANDAL, data: { ...SANDAL.data, sku: 'TB-001' } };

        expect(() => scrapedAcoRows([BOOT, clash], OPTIONS)).toThrow(ScrapedPackError);
        expect(() => scrapedAcoRows([BOOT, clash], OPTIONS)).toThrow(/TB-001.*Trail Boot.*Beach Sandal/);
    });

    it('refuses a product priced in another currency than the pack, naming it', () => {
        const euro: ScrapedProduct = { ...SANDAL, data: { ...SANDAL.data, currency: 'EUR' } };

        expect(() => scrapedAcoRows([euro], OPTIONS)).toThrow(/Beach Sandal.*EUR.*USD/);
    });

    it('refuses an image that is not an http(s) URL, since ACO fetches it from there', () => {
        const inline: ScrapedProduct = { ...SANDAL, data: { ...SANDAL.data, image: 'data:image/png;base64,AAAA' } };

        expect(() => scrapedAcoRows([inline], OPTIONS)).toThrow(/Beach Sandal/);
    });

    it('refuses an empty product list', () => {
        expect(() => scrapedAcoRows([], OPTIONS)).toThrow(ScrapedPackError);
    });
});
