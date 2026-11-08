/**
 * The order Demo Builder's engine installs data types in, as plain names, for the import window to
 * draw its rows in from the start: rows that moved as each type began would jump under the SC's eye
 * (owner, 2026-11-07). The engine's own list is `INSTALLABLE_KINDS` in `runPack.ts`, which a webview
 * cannot import (it brings the whole engine); `installOrder.test.ts` fails when the two disagree.
 *
 * @module features/data-installer/services/demoBuilderEngine/installOrder
 */

export const INSTALL_ORDER: readonly string[] = [
    'attribute_sets',
    'product_attributes',
    'attribute_assign_to_set',
    'categories',
    'customer_groups',
    'stocks',
    'sources',
    'stock_source_links',
    'products',
    'product_export',
    'giftcards',
    'source_items',
    'customers_export',
    'customers',
    'cart_rules',
    'coupons',
    'b2b_shared_catalogs',
    'b2b_companies',
    'b2b_shared_catalog_company_assignments',
    'b2b_shared_catalog_categories',
    'b2b_shared_catalog_products',
    'store_config',
];

/** The data types in install order; any the list does not know go last, in the order given. */
export function inInstallOrder(kinds: readonly string[]): string[] {
    const known = INSTALL_ORDER.filter((kind) => kinds.includes(kind));
    return [...known, ...kinds.filter((kind) => !INSTALL_ORDER.includes(kind))];
}
