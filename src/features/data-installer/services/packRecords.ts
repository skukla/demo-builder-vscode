/**
 * A pack's records by name, per data type, for the install window's Review Records (datapack
 * simplification step 03, S4). Each record is named as the pack names it, by `keyOf`
 * (`packForm.ts`): the name a repeat install finds it by, so the spot check and the install agree.
 * A data type that keeps no record (`keyOf` has no key for it) has no names to show.
 *
 * Pure: no store, no read.
 *
 * @module features/data-installer/services/packRecords
 */

import { keyOf } from './demoBuilderEngine/packForm';
import type { PackItems } from './demoBuilderEngine/runPack';

/** Each kind's record names, in the pack's order; kinds with no key or no rows are left out. */
export function recordNames(items: PackItems): Record<string, string[]> {
    const named: Record<string, string[]> = {};
    for (const [kind, rows] of Object.entries(items)) {
        if (!Array.isArray(rows)) continue;
        const names = rows
            .map((row) => keyOf(kind, row))
            .filter((name): name is string => Boolean(name));
        if (names.length > 0) named[kind] = names;
    }
    return named;
}
