/**
 * What a data type needs in order to import.
 *
 * An install asked for part of a datapack (an agent's `dataTypes`; the screen
 * installs the whole pack since step 03) takes what each type needs with it
 * (`askedKinds.ts`): `products` without `customer_groups` fails the whole products
 * type. Pick a type, get what it needs.
 *
 * ## Why this is a hand-written map when `dataTypeLabel` argues against one
 *
 * That module derives labels from codes rather than mapping 21 types, because a
 * map goes stale the moment the service adds a type. The reasoning is right and
 * it does not apply here: a label can be computed from a code, a dependency
 * cannot. There is nothing to derive from, so the choice is a map or nothing.
 *
 * ## Why NOT the export catalogue's `depends_on`
 *
 * `get-export-data-types` returns real dependency edges, and using them here
 * would be wrong. **Measured:** the `bodea` pack imported all 14 of its types
 * successfully with no `stocks` and no `sources`, while that catalogue says
 * `stock_source_links` depends on both and `source_items` depends on `sources`.
 * Applying it would force two types onto a pack that does not contain them and
 * report a problem on an import that works.
 *
 * Those edges exist so an EXPORT can turn ids into names — the Export guide says
 * so: "converting customer group ID to code requires fetching customer groups."
 * They describe what a read needs, not what a write requires.
 *
 * No endpoint exposes import edges. `get-processor-order?operation_mode=import`
 * returns 21 ordered names and nothing else. Until the service exposes
 * `depends_on` for import mode — it has the data, in its own processor config —
 * this map is the honest alternative, and each edge carries its evidence so a
 * weak one is visible rather than implied.
 *
 * @module features/data-installer/ui/importDependencies
 */

/**
 * Import-time dependencies, strongest evidence first.
 *
 * DOCUMENTED — the Import guide's substitution list for products. Each is a
 * lookup that fails without the named type:
 *   - `attribute_set_id` resolves an attribute set NAME  → attribute_sets
 *   - `category_ids` resolves category URL KEYS          → categories
 *   - `tier_prices.customer_group_id` resolves a CODE    → customer_groups
 *
 * The third of those was MEASURED, and it is why the cost is worth stating:
 * Bodea's tier prices name the "Platinum Buyer" group, the service resolves that
 * name to an id at import time, and with no groups imported the lookup failed
 * and took the ENTIRE `products` type down — 56 products, zero landed
 * (2026-08-14). One failed lookup fails the type, not the row.
 *
 * That measurement also rules out the obvious alternative to this map: `validate`
 * mode cannot catch it. Confirmed again 2026-08-17 — validating `products` alone,
 * with none of its three dependencies present, answers `{valid: true}`. It checks
 * that each type has a processor and that the data matches its schema; it does
 * not check whether the selection is coherent. (Control: an unknown type does
 * come back `{valid: false}`, so the pass is a real answer.)
 *
 * STRONG — the service's own description of the coupons processor says it
 * "converts rule_id to rule_name for import compatibility", which is an
 * import-facing statement about needing the rules present.
 *
 * INFERRED — from the observed import order and the shape of the data. Weaker
 * than the rest; these are the first to re-check if the service ever answers
 * the question properly.
 *
 * Deliberately ABSENT: every inventory edge. See the module docstring — bodea
 * disproves them, and `importDependencies.test.ts` fails if they come back.
 */
export const IMPORT_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
    // documented
    products: ['attribute_sets', 'categories', 'customer_groups'],
    // strong
    coupons: ['cart_rules'],
    // inferred
    attribute_assign_to_set: ['attribute_sets', 'product_attributes'],
    customers: ['customer_groups'],
};

/** One type's dependencies, or none. */
function dependenciesOf(
    type: string,
    map: Readonly<Record<string, readonly string[]>>,
): readonly string[] {
    return map[type] ?? [];
}

/**
 * The selection, plus everything it needs that the pack actually has.
 *
 * Transitive, and it stops at what `available` contains: a dependency the pack
 * does not hold is left out rather than invented.
 *
 * @param selected - the types currently ticked
 * @param available - the types this datapack contains
 * @param map - injectable for tests; the real map by default
 * @returns a new array; the input is never mutated
 */
export function withDependencies(
    selected: readonly string[],
    available: readonly string[],
    map: Readonly<Record<string, readonly string[]>> = IMPORT_DEPENDENCIES,
): string[] {
    const inPack = new Set(available);
    const resolved = new Set(selected);
    // Queue rather than recursion: a cycle in the map must terminate, and the
    // `resolved` set is what makes it do so.
    const queue = [...selected];

    while (queue.length > 0) {
        const type = queue.shift() as string;
        for (const dependency of dependenciesOf(type, map)) {
            if (!inPack.has(dependency) || resolved.has(dependency)) {
                continue;
            }
            resolved.add(dependency);
            queue.push(dependency);
        }
    }

    return [...resolved];
}
