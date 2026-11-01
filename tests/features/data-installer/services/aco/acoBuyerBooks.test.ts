/**
 * The books a shopper asks for, added to a pack that lacks them. The ids are literal: the guest and
 * group-20 ones are what ACCS answered on 2026-11-01, so computing them here would prove nothing.
 */

import { withBuyerBooks } from '@/features/data-installer/services/aco/acoBuyerBooks';

const GUEST = 'site::b6589fc6ab0dc82cf12099d1c2d40ab994e8410c';
const GROUP_20 = 'site::91032ad7bbcb6cf72875e8e8207dcfba80173f7c';
const BOOKS = { websiteCode: 'site', groupIds: [0, 20] };

describe('withBuyerBooks', () => {
    it('gives each group a book under the id Commerce answers, pointing at a website pack\'s one book', () => {
        const items = withBuyerBooks({ aco_price_books: [{ priceBookId: 'main', name: 'Main', currency: 'USD' }] }, BOOKS);
        expect(items.aco_price_books).toEqual([
            { priceBookId: 'main', name: 'Main', currency: 'USD' },
            { priceBookId: GUEST, parentId: 'main', name: 'Shoppers in group 0' },
            { priceBookId: GROUP_20, parentId: 'main', name: 'Shoppers in group 20' },
        ]);
    });

    it('adds nothing to a pack exported from this website, which has them', () => {
        const items = {
            aco_price_books: [
                { priceBookId: 'site', name: 'Site', currency: 'USD' },
                { priceBookId: GUEST, parentId: 'site', name: 'Guest' },
                { priceBookId: GROUP_20, parentId: 'site', name: 'Group 20' },
            ],
        };
        expect(withBuyerBooks(items, BOOKS)).toBe(items);
    });

    it("keeps a group's prices when the pack came from another website", () => {
        const other20 = 'other::91032ad7bbcb6cf72875e8e8207dcfba80173f7c';
        const items = withBuyerBooks(
            {
                aco_price_books: [
                    { priceBookId: 'other', name: 'Other', currency: 'USD' },
                    { priceBookId: other20, parentId: 'other', name: 'Group 20' },
                ],
            },
            BOOKS,
        );
        expect(items.aco_price_books).toEqual(
            expect.arrayContaining([
                { priceBookId: GROUP_20, parentId: other20, name: 'Shoppers in group 20' },
                { priceBookId: GUEST, parentId: 'other', name: 'Shoppers in group 0' },
            ]),
        );
    });

    it('leaves a pack with no price books alone', () => {
        const items = { aco_products: [] };
        expect(withBuyerBooks(items, BOOKS)).toBe(items);
    });
});
