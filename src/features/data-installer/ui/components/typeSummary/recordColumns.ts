/**
 * What each data type's records column holds, for Review Records' header (walk F147, owner yes
 * 2026-11-16). The pane used to head every type "Name", over SKUs, attribute codes and coupon
 * codes alike. Products and gift cards show **SKU** and **Name**, the shared set every products
 * grid shows (Assign ERP Products adds its own columns after them); Name only when the window has
 * the names, so a column is never shown empty.
 *
 * @module features/data-installer/ui/components/typeSummary/recordColumns
 */

/** The data types whose records are products, by SKU. */
const PRODUCT_TYPES: ReadonlySet<string> = new Set(['products', 'giftcards']);

/** Each type's one column, by what its record's name is (`keyOf`, `packForm.ts`); Name for the rest. */
const COLUMN: Readonly<Record<string, string>> = {
    product_attributes: 'Code',
    attribute_options: 'Attribute and Option',
    attribute_assign_to_set: 'Set and Attribute',
    categories: 'Category',
    coupons: 'Code',
    sources: 'Code',
    stock_source_links: 'Stock and Source',
    customers: 'Email',
    customer_groups: 'Code',
    orders: 'Order',
    returns: 'Return',
    website_settings: 'Setting',
};

/** Whether a type's records are products, shown by SKU with their names. */
export function isProductType(type: string): boolean {
    return PRODUCT_TYPES.has(type);
}

/**
 * The column headers for a type's records.
 *
 * @param type - the data type shown
 * @param named - the window has the products' names, so a Name column has something in it
 */
export function recordColumns(type: string, named: boolean): string[] {
    if (isProductType(type)) return named ? ['SKU', 'Name'] : ['SKU'];
    return [COLUMN[type] ?? 'Name'];
}
