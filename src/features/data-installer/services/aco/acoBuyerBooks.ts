/**
 * The price books a shopper actually asks for (PL-60). An ACO storefront asks Commerce which book a
 * shopper gets, and Commerce answers `<website code>::<sha1(customer group id)>`. A book ACO never
 * loaded answers an empty price, even on a view with a default (measured 2026-11-01), so a pack made
 * from a website, or exported from another store, would show nobody a price.
 *
 * So when a pack is loaded, each group gets a book under the id Commerce will answer, with the pack's
 * own book as its parent: a child book inherits prices, discounts and tiers it does not set (also
 * measured). They travel on the pack's price book rows, so its record lists them and removing the
 * pack removes them.
 *
 * @module features/data-installer/services/aco/acoBuyerBooks
 */

import { buyerBookId } from '../acoExport/acoPriceRows';
import type { AcoPackItems } from './acoPackInstall';

/** Where a project's shoppers come from. */
export interface BuyerBooks {
    websiteCode: string;
    groupIds: readonly number[];
}

interface BookRow {
    priceBookId: string;
    parentId?: string;
}

const isBookRow = (row: unknown): row is BookRow =>
    typeof row === 'object' && row !== null && typeof (row as BookRow).priceBookId === 'string';

/** The pack's items, with the books its shoppers will ask for added where it lacks them. */
export function withBuyerBooks(items: AcoPackItems, { websiteCode, groupIds }: BuyerBooks): AcoPackItems {
    const rows = Array.isArray(items.aco_price_books) ? items.aco_price_books : [];
    const books = rows.filter(isBookRow);
    const root = books.find((book) => !book.parentId);
    if (!root) return items;
    const have = new Set(books.map((book) => book.priceBookId));
    const added = groupIds
        .filter((groupId) => !have.has(buyerBookId(websiteCode, groupId)))
        .map((groupId) => {
            // The same group's book in the pack keeps that group's prices; otherwise the pack's own.
            const own = buyerBookId(root.priceBookId, groupId);
            return {
                priceBookId: buyerBookId(websiteCode, groupId),
                parentId: have.has(own) ? own : root.priceBookId,
                name: `Shoppers in group ${groupId}`,
            };
        });
    return added.length > 0 ? { ...items, aco_price_books: [...rows, ...added] } : items;
}
