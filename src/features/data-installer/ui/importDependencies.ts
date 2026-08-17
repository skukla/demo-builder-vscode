/**
 * What a data type needs in order to import.
 *
 * Someone importing part of a datapack picks types off a checkbox grid. Picking
 * `products` without `customer_groups` fails the whole products type, and
 * nothing in the UI said so beyond one hardcoded warning about that single pair.
 * This generalises it: pick a type, get what it needs.
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
 * does not hold cannot be ticked, so it is reported by
 * {@link missingDependencies} instead of silently appearing here.
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

/**
 * Which selected types still need `type` — empty means it can be unticked.
 *
 * Direct dependents only. A transitive one cannot be selected without its own
 * direct dependency also being selected, so the direct check already covers it.
 *
 * @param type - the type the user is trying to untick
 * @param selected - the types currently ticked
 * @param map - injectable for tests; the real map by default
 */
export function blockedBy(
    type: string,
    selected: readonly string[],
    map: Readonly<Record<string, readonly string[]>> = IMPORT_DEPENDENCIES,
): string[] {
    return selected.filter(
        (candidate) => candidate !== type && dependenciesOf(candidate, map).includes(type),
    );
}

/**
 * A selection, and which of it the SYSTEM chose.
 *
 * `auto` is the provenance record, and it exists for one question: when a type
 * is unticked, do its dependencies go with it? Without provenance that question
 * has no right answer — clearing them strands nothing but discards choices the
 * user made before the dependency was borrowed, and keeping them leaves types
 * selected that nobody picked, bound for a live Commerce instance.
 *
 * `auto` is always a subset of `selected`.
 */
export interface TypeSelection {
    selected: readonly string[];
    auto: readonly string[];
}

/**
 * Tick `type`, taking its satisfiable dependencies with it.
 *
 * Anything added that the user had not already selected is recorded as `auto`.
 * A type the user had ticked themselves keeps its provenance even when a later
 * selection depends on it — that is what makes {@link deselectType} able to
 * leave it alone.
 */
export function selectType(
    selection: TypeSelection,
    type: string,
    available: readonly string[],
    map: Readonly<Record<string, readonly string[]>> = IMPORT_DEPENDENCIES,
): TypeSelection {
    const before = new Set([...selection.selected, type]);
    const after = withDependencies([...before], available, map);

    return {
        selected: after,
        // Only what THIS click introduced joins the auto set; existing entries
        // keep whatever provenance they already had.
        auto: [...selection.auto, ...after.filter((t) => !before.has(t))],
    };
}

/**
 * Untick `type`, and drop the dependencies it alone was holding.
 *
 * Refuses outright while something still selected needs `type` — the checkbox is
 * disabled in that state, and this makes it unreachable rather than merely hard
 * to reach.
 *
 * A dependency is dropped only when BOTH hold: the system added it, and nothing
 * still selected needs it. Everything else stays.
 */
export function deselectType(
    selection: TypeSelection,
    type: string,
    map: Readonly<Record<string, readonly string[]>> = IMPORT_DEPENDENCIES,
): TypeSelection {
    if (blockedBy(type, selection.selected, map).length > 0) {
        return selection;
    }

    const remaining = selection.selected.filter((t) => t !== type);
    const auto = new Set(selection.auto);
    // Only what the departing type could have brought is a candidate; a
    // dependency of something else was never this click's to remove.
    const candidates = new Set(dependenciesOf(type, map));

    const kept = remaining.filter(
        (t) => !candidates.has(t) || !auto.has(t) || blockedBy(t, remaining, map).length > 0,
    );

    return {
        selected: kept,
        auto: [...auto].filter((t) => kept.includes(t)),
    };
}

/**
 * Dependencies of the selected types that this datapack does NOT contain.
 *
 * The case selection cannot fix. A pack holding `products` but no `categories`
 * will fail its category lookups however the boxes are ticked, and the only
 * useful moment to say so is before the import runs.
 *
 * @param selected - the types currently ticked
 * @param available - the types this datapack contains
 * @param map - injectable for tests; the real map by default
 */
export function missingDependencies(
    selected: readonly string[],
    available: readonly string[],
    map: Readonly<Record<string, readonly string[]>> = IMPORT_DEPENDENCIES,
): string[] {
    const inPack = new Set(available);
    const missing = new Set<string>();

    for (const type of selected) {
        for (const dependency of dependenciesOf(type, map)) {
            if (!inPack.has(dependency)) {
                missing.add(dependency);
            }
        }
    }

    return [...missing];
}
