/**
 * Import-time data type dependencies — the resolver behind partial-import
 * selection.
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

import {
    IMPORT_DEPENDENCIES,
    blockedBy,
    deselectType,
    missingDependencies,
    selectType,
    withDependencies,
} from '@/features/data-installer/ui/importDependencies';

/**
 * The import processor order, measured live 2026-08-17 via
 * `list_datapack_data_types({operationMode:'import'})`. Recorded so the map
 * cannot name a type the service no longer has.
 */
const LIVE_IMPORT_TYPES = [
    'attribute_sets', 'product_attributes', 'attribute_assign_to_set', 'categories',
    'customer_groups', 'stocks', 'sources', 'stock_source_links', 'products',
    'product_export', 'giftcards', 'source_items', 'customers_export', 'customers',
    'cart_rules', 'coupons', 'b2b_shared_catalogs', 'b2b_companies',
    'b2b_shared_catalog_company_assignments', 'b2b_shared_catalog_categories',
    'b2b_shared_catalog_products',
];

/** A pack holding everything, for cases where availability is not the subject. */
const ALL = LIVE_IMPORT_TYPES;

describe('withDependencies', () => {
    it('adds the three types products needs', () => {
        expect(withDependencies(['products'], ALL).sort()).toEqual(
            ['attribute_sets', 'categories', 'customer_groups', 'products'].sort(),
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

    it('does not mutate the caller’s array', () => {
        const selected = ['products'];
        withDependencies(selected, ALL);
        expect(selected).toEqual(['products']);
    });
});

describe('blockedBy', () => {
    it('names the selected types that still need this one', () => {
        expect(blockedBy('customer_groups', ['products', 'customer_groups'])).toEqual(['products']);
    });

    it('reports every dependent, not just the first', () => {
        const out = blockedBy('customer_groups', ['products', 'customers', 'customer_groups']);
        expect(out.sort()).toEqual(['customers', 'products']);
    });

    it('is empty when nothing selected depends on it', () => {
        expect(blockedBy('customer_groups', ['customer_groups', 'categories'])).toEqual([]);
    });

    it('never reports the type as blocking itself', () => {
        expect(blockedBy('products', ['products'])).toEqual([]);
    });
});

describe('missingDependencies', () => {
    it('reports a dependency the pack does not contain', () => {
        // The case auto-selection cannot fix and the user must know about
        // BEFORE importing, not after products fails.
        const pack = ['products', 'attribute_sets', 'customer_groups'];

        expect(missingDependencies(['products'], pack)).toEqual(['categories']);
    });

    it('is empty when every dependency is present', () => {
        expect(missingDependencies(['products'], ALL)).toEqual([]);
    });

    it('only considers SELECTED types', () => {
        // `coupons` is in the pack but unselected, so its missing `cart_rules`
        // is not the user's problem yet.
        const pack = ['products', 'attribute_sets', 'categories', 'customer_groups', 'coupons'];

        expect(missingDependencies(['products'], pack)).toEqual([]);
    });

    it('de-duplicates a dependency two selected types share', () => {
        const pack = ['products', 'customers', 'attribute_sets', 'categories'];

        // products and customers both need customer_groups, which is absent.
        expect(missingDependencies(['products', 'customers'], pack)).toEqual(['customer_groups']);
    });
});

/**
 * Ticking and unticking, with provenance.
 *
 * Unticking has to undo what ticking did and nothing more, which means the
 * selection has to remember WHO chose each type. Without that, "clear the
 * dependencies" is wrong half the time: it either strands types nobody picked,
 * or it throws away a choice the user made before the dependency was borrowed.
 */
describe('selectType', () => {
    const empty = { selected: [], auto: [] };

    it('records what it added as auto, and the click itself as the user’s', () => {
        const out = selectType(empty, 'products', ALL);

        expect(out.selected).toContain('products');
        expect([...out.auto].sort()).toEqual(['attribute_sets', 'categories', 'customer_groups']);
        expect(out.auto).not.toContain('products');
    });

    it('does not claim a type the user had already ticked', () => {
        const mine = { selected: ['categories'], auto: [] };

        const out = selectType(mine, 'products', ALL);

        // categories was the user's before products borrowed it.
        expect(out.auto).not.toContain('categories');
        expect([...out.auto].sort()).toEqual(['attribute_sets', 'customer_groups']);
    });

    it('only claims what the pack can offer', () => {
        const out = selectType(empty, 'products', ['products', 'categories']);

        expect(out.auto).toEqual(['categories']);
    });
});

describe('deselectType', () => {
    it('drops the type and the dependencies it brought', () => {
        const after = selectType({ selected: [], auto: [] }, 'products', ALL);

        const out = deselectType(after, 'products');

        expect(out.selected).toEqual([]);
        expect(out.auto).toEqual([]);
    });

    it('keeps a dependency the user owned', () => {
        const after = selectType({ selected: ['categories'], auto: [] }, 'products', ALL);

        const out = deselectType(after, 'products');

        expect(out.selected).toEqual(['categories']);
    });

    it('keeps a dependency another selected type still needs', () => {
        const one = selectType({ selected: [], auto: [] }, 'products', ALL);
        const two = selectType(one, 'customers', ALL);

        const out = deselectType(two, 'products');

        // customers still needs customer_groups; products leaving cannot strip it.
        expect(out.selected).toContain('customer_groups');
        expect(out.selected).toContain('customers');
        expect(out.selected).not.toContain('products');
    });

    it('refuses while something selected still needs the type', () => {
        const after = selectType({ selected: [], auto: [] }, 'products', ALL);

        const out = deselectType(after, 'categories');

        expect(out.selected).toEqual(after.selected);
    });

    it('is a no-op for a type that was never selected', () => {
        const state = { selected: ['categories'], auto: [] };

        expect(deselectType(state, 'products').selected).toEqual(['categories']);
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
        expect([...named].filter((t) => !LIVE_IMPORT_TYPES.includes(t))).toEqual([]);
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
