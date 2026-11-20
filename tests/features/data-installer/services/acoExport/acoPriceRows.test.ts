/**
 * `aco_price_books` and `aco_prices`: a book per website and per customer group under it, and
 * each product's prices in them, the service's mapping (`acoPriceBooksExportTransform.js`,
 * `acoPricesExportTransform.js`; aco-export-spec.md §3).
 */

import {
    childBookId,
    dedupePrices,
    priceBookRows,
    priceRows,
    storeViewFor,
} from '@/features/data-installer/services/acoExport/acoPriceRows';
import {
    ACO_GROUPS,
    ACO_STORE_VIEWS,
    ACO_WEBSITES,
    catalogProduct,
} from '../../../../helpers/acoFixtures';

const BASE = ACO_WEBSITES[0];
const GROUPS = new Map(ACO_GROUPS.map((g) => [String(g.id), g]));

describe('priceBookRows', () => {
    it('makes a root book per website, with its currency, and a book per group under it', () => {
        const rows = priceBookRows([BASE], ACO_GROUPS, () => 'USD');

        expect(rows).toEqual([
            { priceBookId: 'base', name: 'Main Website', currency: 'USD' },
            {
                priceBookId: 'base:not-logged-in',
                parentId: 'base',
                name: 'NOT LOGGED IN (Main Website)',
            },
            { priceBookId: 'base:general', parentId: 'base', name: 'General (Main Website)' },
            { priceBookId: 'base:vip-gold', parentId: 'base', name: 'VIP Gold (Main Website)' },
        ]);
    });
});

describe('childBookId', () => {
    it('cuts the group part so the whole id stays within 64 characters', () => {
        const id = childBookId(BASE, { id: 9, code: 'x'.repeat(80) });
        expect(id).toBe(`base:${'x'.repeat(59)}`);
    });

    it('names a group whose code slugs to nothing by its id', () => {
        expect(childBookId(BASE, { id: 9, code: '***' })).toBe('base:group-9');
    });
});

describe('priceRows', () => {
    it("prices the product in its website's book at its price", () => {
        expect(priceRows(catalogProduct('A', { price: 743.66 }), BASE, GROUPS)).toEqual([
            { sku: 'A', priceBookId: 'base', regular: 743.66 },
        ]);
    });

    it('makes a special price a discount of the amount off, rounded to cents', () => {
        const [row] = priceRows(
            catalogProduct('A', { price: 10 }, { special_price: '7.333' }),
            BASE,
            GROUPS
        );
        expect(row.discounts).toEqual([{ code: 'special_price', price: 2.67 }]);
    });

    it('ignores a special price at or above the price', () => {
        const [row] = priceRows(
            catalogProduct('A', { price: 10 }, { special_price: '10' }),
            BASE,
            GROUPS
        );
        expect(row).not.toHaveProperty('discounts');
    });

    it("turns all-groups tiers into the root book's tiers, a quantity-1 tier becoming its price", () => {
        const product = catalogProduct('A', {
            price: 10,
            tier_prices: [
                { customer_group_id: 32000, qty: 5, value: 8 },
                { customer_group_id: 32000, qty: 1, value: 9 },
            ],
        });

        expect(priceRows(product, BASE, GROUPS)).toEqual([
            { sku: 'A', priceBookId: 'base', regular: 9, tierPrices: [{ qty: 5, price: 8 }] },
        ]);
    });

    it('gives a group with its own tiers a row in its book, and skips a group the store does not have', () => {
        const product = catalogProduct('A', {
            price: 10,
            tier_prices: [
                { customer_group_id: 4, qty: 2, value: 7, extension_attributes: { website_id: 1 } },
                { customer_group_id: 77, qty: 2, value: 6 },
            ],
        });

        expect(priceRows(product, BASE, GROUPS)).toEqual([
            { sku: 'A', priceBookId: 'base', regular: 10 },
            {
                sku: 'A',
                priceBookId: 'base:vip-gold',
                regular: 10,
                tierPrices: [{ qty: 2, price: 7 }],
            },
        ]);
    });

    it('leaves out tiers set on another website', () => {
        const product = catalogProduct('A', {
            price: 10,
            tier_prices: [{ customer_group_id: 4, qty: 2, value: 7, website_id: 2 }],
        });
        expect(priceRows(product, BASE, GROUPS)).toEqual([
            { sku: 'A', priceBookId: 'base', regular: 10 },
        ]);
    });

    it('makes no row for a product with no price', () => {
        expect(priceRows(catalogProduct('A', { price: undefined }), BASE, GROUPS)).toStrictEqual([]);
    });
});

describe('dedupePrices', () => {
    it('keeps the last row for each product and book', () => {
        const rows = dedupePrices([
            { sku: 'A', priceBookId: 'base', regular: 1 },
            { sku: 'B', priceBookId: 'base', regular: 2 },
            { sku: 'A', priceBookId: 'base', regular: 3 },
        ]);
        expect(rows).toEqual([
            { sku: 'A', priceBookId: 'base', regular: 3 },
            { sku: 'B', priceBookId: 'base', regular: 2 },
        ]);
    });
});

describe('storeViewFor', () => {
    it('takes the first chosen store view of the website', () => {
        expect(storeViewFor(BASE, ACO_STORE_VIEWS, ['citisignal_us', 'fr'])).toBe('fr');
    });

    it("takes the website's lowest-id active store view when none of its views was chosen", () => {
        expect(storeViewFor(BASE, ACO_STORE_VIEWS, ['citisignal_us'])).toBe('default');
    });

    it('answers nothing for a website with no store view', () => {
        expect(
            storeViewFor({ id: 9, code: 'empty', name: 'Empty' }, ACO_STORE_VIEWS, [])
        ).toBeUndefined();
    });
});
