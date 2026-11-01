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

// Literal on purpose: computing them here would agree with any formula the code used. The guest id
// is what ACCS answered on 2026-11-01, and so is the group-20 id below; the other two are that same
// SHA-1 of the group id, worked out outside this code.
const GUEST_BOOK = 'base::b6589fc6ab0dc82cf12099d1c2d40ab994e8410c';
const GENERAL_BOOK = 'base::356a192b7913b04c54574d18c28d46e6395428ab';
const VIP_BOOK = 'base::1b6453892473a467d07372d45eb05abc2031647a';

describe('priceBookRows', () => {
    it('makes a root book per website, with its currency, and a book per group under it', () => {
        const rows = priceBookRows([BASE], ACO_GROUPS, () => 'USD');

        expect(rows).toEqual([
            { priceBookId: 'base', name: 'Main Website', currency: 'USD' },
            { priceBookId: GUEST_BOOK, parentId: 'base', name: 'NOT LOGGED IN (Main Website)' },
            { priceBookId: GENERAL_BOOK, parentId: 'base', name: 'General (Main Website)' },
            { priceBookId: VIP_BOOK, parentId: 'base', name: 'VIP Gold (Main Website)' },
        ]);
    });
});

describe('childBookId', () => {
    it('is the id Commerce answers for a website and customer group', () => {
        expect(childBookId({ id: 6, code: 'justrite_test_website', name: 'T' }, { id: 20, code: 'Any name' })).toBe(
            'justrite_test_website::91032ad7bbcb6cf72875e8e8207dcfba80173f7c',
        );
    });

    it('depends on the group id alone, so a renamed group keeps its book', () => {
        expect(childBookId(BASE, { id: 4, code: 'Renamed' })).toBe(VIP_BOOK);
    });

    it('never shortens the id, because a shortened id can match nothing', () => {
        const longCode = 'a'.repeat(32);
        expect(childBookId({ id: 1, code: longCode, name: 'Long' }, { id: 0, code: 'x' })).toBe(
            `${longCode}::b6589fc6ab0dc82cf12099d1c2d40ab994e8410c`,
        );
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

    it("carries a discount into every group's book, since a child book does not inherit one", () => {
        const rows = priceRows(catalogProduct('A', { price: 10 }, { special_price: '8' }), BASE, GROUPS);
        const discounts = [{ code: 'special_price', price: 2 }];
        expect(rows).toEqual([
            { sku: 'A', priceBookId: 'base', regular: 10, discounts },
            { sku: 'A', priceBookId: GUEST_BOOK, regular: 10, discounts },
            { sku: 'A', priceBookId: GENERAL_BOOK, regular: 10, discounts },
            { sku: 'A', priceBookId: VIP_BOOK, regular: 10, discounts },
        ]);
    });

    it("applies the sale price to a group's own price too, when it is below it", () => {
        const product = catalogProduct(
            'A',
            { price: 10, tier_prices: [{ customer_group_id: 4, qty: 1, value: 9 }] },
            { special_price: '8' },
        );
        expect(priceRows(product, BASE, GROUPS).find((r) => r.priceBookId === VIP_BOOK)).toEqual({
            sku: 'A',
            priceBookId: VIP_BOOK,
            regular: 9,
            discounts: [{ code: 'special_price', price: 1 }],
        });
    });

    it("leaves a group's price alone when the sale price is above it", () => {
        const product = catalogProduct(
            'A',
            { price: 10, tier_prices: [{ customer_group_id: 4, qty: 1, value: 7 }] },
            { special_price: '8' },
        );
        expect(priceRows(product, BASE, GROUPS).find((r) => r.priceBookId === VIP_BOOK)).toEqual({
            sku: 'A',
            priceBookId: VIP_BOOK,
            regular: 7,
        });
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

        const tierPrices = [{ qty: 5, price: 8 }];
        expect(priceRows(product, BASE, GROUPS)).toEqual([
            { sku: 'A', priceBookId: 'base', regular: 9, tierPrices },
            { sku: 'A', priceBookId: GUEST_BOOK, regular: 9, tierPrices },
            { sku: 'A', priceBookId: GENERAL_BOOK, regular: 9, tierPrices },
            { sku: 'A', priceBookId: VIP_BOOK, regular: 9, tierPrices },
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
                priceBookId: VIP_BOOK,
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
