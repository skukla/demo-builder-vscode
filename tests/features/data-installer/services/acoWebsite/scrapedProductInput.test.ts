/**
 * The input `make_aco_pack_from_products` publishes (PL-60 slice A). The registrar makes a write
 * tool's TOP level strict (`strictifyWriteSchema`), but a nested object is only as strict as it is
 * declared, and zod's default strips unknown keys silently. A misspelt `proposd` would then drop
 * the very marker that says a value was made up, so each nested object must refuse it.
 */

import { z } from 'zod';
import { MAKE_ACO_PACK_INPUT } from '@/features/data-installer/services/acoWebsite/scrapedProductInput';
import type { ScrapedProduct } from '@/types/scrapedProduct';

/** The schema as the registrar publishes a write tool's: top level strict. */
const tool = z.object(MAKE_ACO_PACK_INPUT).strict();

const PRODUCT: ScrapedProduct = {
    origin: 'https://shop.example.com/collections/boots',
    data: { name: 'Trail Boot', image: 'https://cdn.example.com/a.jpg', price: 12.5 },
    proposed: ['price'],
};

const args = (product: unknown) => ({
    datapackName: 'aco_boots',
    version: 'v1',
    locale: 'en-US',
    currency: 'USD',
    products: [product],
});

describe('make_aco_pack_from_products input', () => {
    it('takes a typed product', () => {
        expect(tool.safeParse(args(PRODUCT)).success).toBe(true);
    });

    it.each([
        ['a misspelt marker on the product', { ...PRODUCT, proposd: ['price'] }],
        ['an unknown field on its data', { ...PRODUCT, data: { ...PRODUCT.data, colour: 'red' } }],
        ['an unknown field on an attribute', { ...PRODUCT, data: { ...PRODUCT.data, attributes: [{ name: 'Size', values: ['S'], kind: 'x' }] } }],
    ])('refuses %s instead of dropping it', (_label, product) => {
        expect(tool.safeParse(args(product)).success).toBe(false);
    });

    it.each([
        ['a product with no image', { origin: PRODUCT.origin, data: { name: 'Trail Boot' } }],
        ['a price that is text', { ...PRODUCT, data: { ...PRODUCT.data, price: '$12.50' } }],
        ['a negative price', { ...PRODUCT, data: { ...PRODUCT.data, price: -1 } }],
        ['a currency that is not ISO 4217', { ...PRODUCT, data: { ...PRODUCT.data, currency: 'dollars' } }],
        ['a field outside the proposable ones', { ...PRODUCT, proposed: ['name'] }],
    ])('refuses %s', (_label, product) => {
        expect(tool.safeParse(args(product)).success).toBe(false);
    });

    it('refuses more than 100 products, the cap DSC uses', () => {
        expect(tool.safeParse({ ...args(PRODUCT), products: Array.from({ length: 101 }, () => PRODUCT) }).success).toBe(false);
    });
});
