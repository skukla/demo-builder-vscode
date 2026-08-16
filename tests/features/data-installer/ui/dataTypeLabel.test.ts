/**
 * Human names for the service's data-type codes.
 *
 * The service ships NO display name. Both catalogue calls return a
 * `description` instead, and it is a sentence about the operation rather than a
 * label — `get-export-data-types` says "Export product attributes" and
 * `get-processor-order` says "Import attribute sets with loop processing and
 * group creation". One is mode-flavoured, the other leaks the processor's
 * internals. Neither belongs on a checkbox.
 *
 * So the label is derived from the code. That choice is what these tests pin:
 * derivation must stay readable for a type this extension has never heard of,
 * because the service adds them without asking us.
 *
 * Strict TDD: written BEFORE the module exists.
 */

import { dataTypeLabel } from '@/features/data-installer/ui/dataTypeLabel';

/**
 * Every data type the service offers, measured live on 2026-08-15 —
 * `get-processor-order` (21) ∪ `get-export-data-types` (18).
 *
 * Pinned as a list rather than a spot check so the derivation is exercised
 * against the real alphabet, not against examples chosen to make it pass.
 */
const REAL_CODES = [
    'attribute_assign_to_set',
    'attribute_sets',
    'b2b_companies',
    'b2b_shared_catalog_categories',
    'b2b_shared_catalog_company_assignments',
    'b2b_shared_catalog_products',
    'b2b_shared_catalogs',
    'cart_rules',
    'categories',
    'coupons',
    'customer_groups',
    'customers',
    'customers_export',
    'giftcards',
    'product_attributes',
    'product_export',
    'products',
    'source_items',
    'sources',
    'stock_source_links',
    'stocks',
];

describe('dataTypeLabel', () => {
    it('replaces the underscores with spaces and capitalises the first word', () => {
        expect(dataTypeLabel('attribute_sets')).toBe('Attribute sets');
        expect(dataTypeLabel('stock_source_links')).toBe('Stock source links');
    });

    /** Sentence case, matching the surrounding labels — "Target website", "Data types". */
    it('uses sentence case, not title case', () => {
        expect(dataTypeLabel('customer_groups')).toBe('Customer groups');
    });

    it('capitalises a single-word code', () => {
        expect(dataTypeLabel('products')).toBe('Products');
    });

    /**
     * The one thing mechanical casing cannot know. Five of the 21 codes carry
     * this prefix, so getting it wrong is not a corner case.
     */
    it('keeps B2B an acronym rather than "B2b"', () => {
        expect(dataTypeLabel('b2b_companies')).toBe('B2B companies');
        expect(dataTypeLabel('b2b_shared_catalog_company_assignments')).toBe(
            'B2B shared catalog company assignments',
        );
    });

    /**
     * The reason for deriving instead of hand-mapping: the service owns this
     * list and grows it. An unmapped type must still read as words.
     */
    it('reads a type this extension has never heard of', () => {
        expect(dataTypeLabel('loyalty_tier_rules')).toBe('Loyalty tier rules');
    });

    it('survives an empty or malformed code instead of throwing', () => {
        expect(dataTypeLabel('')).toBe('');
        expect(dataTypeLabel('__')).toBe('__');
    });

    /**
     * The whole point, asserted over the real alphabet: no underscore reaches
     * the screen. Counted into a variable — a bare `forEach` with no assertion
     * on the total would pass just as happily against an empty list.
     */
    it('leaves no underscore in any real data type', () => {
        const withUnderscore = REAL_CODES.filter((code) => dataTypeLabel(code).includes('_'));

        expect(withUnderscore).toEqual([]);
        expect(REAL_CODES).toHaveLength(21);
    });

    /** Presentation only — the label must never become the value sent. */
    it('is not reversible, and is therefore never a substitute for the code', () => {
        expect(dataTypeLabel('attribute_sets')).not.toBe('attribute_sets');
    });
});
