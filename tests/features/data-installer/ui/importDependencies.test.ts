/**
 * Import-time data type dependencies: the resolver behind a partial install
 * (`askedKinds.ts`).
 *
 * The load-bearing claim of this whole module is NEGATIVE, so it is pinned
 * first: the export catalogue's `depends_on` edges do not describe an import.
 * Measured, not argued — the `bodea` pack imported all 14 of its types
 * successfully with no `stocks` and no `sources`, while the export catalogue
 * says `stock_source_links` needs both and `source_items` needs `sources`.
 * Copying those edges in would force two types onto a pack that does not have
 * them and report a problem on an import that works.
 *
 * That is why the map here is small, hand-built, and evidence-tiered rather
 * than fetched.
 */

import { IMPORT_DEPENDENCIES, withDependencies } from '@/features/data-installer/ui/importDependencies';

/**
 * The import processor order, measured live 2026-08-17 via
 * `list_datapack_data_types({operationMode:'import'})`. Recorded so the map
 * cannot name a type the service no longer has.
 */
const LIVE_IMPORT_TYPES = [
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
];

/** A pack holding everything, for cases where availability is not the subject. */
const ALL = LIVE_IMPORT_TYPES;

describe('withDependencies', () => {
    it('adds the three types products needs', () => {
        expect(withDependencies(['products'], ALL).sort()).toEqual(
            ['attribute_sets', 'categories', 'customer_groups', 'products'].sort()
        );
    });

    it('keeps what was already selected', () => {
        expect(withDependencies(['products', 'coupons'], ALL)).toContain('coupons');
    });

    it('only adds types the pack actually contains', () => {
        // A pack with products but no categories: categories cannot be ticked
        // because there is nothing to tick.
        const pack = ['products', 'attribute_sets', 'customer_groups'];

        const out = withDependencies(['products'], pack);

        expect(out).not.toContain('categories');
        expect(out.sort()).toEqual(pack.sort());
    });

    it('resolves transitively', () => {
        // Injected chain: the real map has no two-link path today, and a
        // resolver that only went one level would pass every other test here.
        const chain = { a: ['b'], b: ['c'], c: [] };

        expect(withDependencies(['a'], ['a', 'b', 'c'], chain).sort()).toEqual(['a', 'b', 'c']);
    });

    it('terminates on a cycle rather than hanging', () => {
        const cyclic = { a: ['b'], b: ['a'] };

        expect(withDependencies(['a'], ['a', 'b'], cyclic).sort()).toEqual(['a', 'b']);
    });

    it('returns the input unchanged for a type with no dependencies', () => {
        expect(withDependencies(['categories'], ALL)).toEqual(['categories']);
    });

    it('adds cart_rules for coupons — the rule_id → rule_name substitution', () => {
        // STRONG evidence: the coupons processor "converts rule_id to rule_name for
        // import compatibility", so the rules have to be there first.
        expect(withDependencies(['coupons'], ALL).sort()).toEqual(['cart_rules', 'coupons']);
    });

    it('adds both types an attribute assignment needs', () => {
        expect(withDependencies(['attribute_assign_to_set'], ALL).sort()).toEqual(
            ['attribute_assign_to_set', 'attribute_sets', 'product_attributes'].sort()
        );
    });

    it('does not mutate the caller’s array', () => {
        const selected = ['products'];
        withDependencies(selected, ALL);
        expect(selected).toEqual(['products']);
    });
});

describe('the map itself', () => {
    it('names only types the service still has', () => {
        const named = new Set<string>();
        for (const [type, deps] of Object.entries(IMPORT_DEPENDENCIES)) {
            named.add(type);
            deps.forEach((d) => named.add(d));
        }

        // A renamed or removed type fails here instead of silently doing
        // nothing at runtime. Re-measure LIVE_IMPORT_TYPES if this fires.
        expect([...named].filter((t) => !LIVE_IMPORT_TYPES.includes(t))).toStrictEqual([]);
    });

    it('carries NO inventory edges — bodea disproved them for import', () => {
        // stock_source_links → [stocks, sources] and source_items → [sources]
        // are EXPORT ordering facts. Bodea imported both types successfully with
        // neither dependency present. If someone "completes" this map from the
        // export catalogue, this fails.
        expect(IMPORT_DEPENDENCIES.stock_source_links).toBeUndefined();
        expect(IMPORT_DEPENDENCIES.source_items).toBeUndefined();
    });

    it('encodes the three substitutions the Import guide documents', () => {
        expect([...(IMPORT_DEPENDENCIES.products ?? [])].sort()).toEqual([
            'attribute_sets',
            'categories',
            'customer_groups',
        ]);
    });
});
