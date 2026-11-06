/**
 * Which categories Clear Demo Data deletes, and in what order.
 *
 * Under each chosen store's root, a category goes unless Demo Builder installed it or something it
 * installed sits under it. So a category going has nothing staying under it, and deleting the top ones
 * takes the rest: Commerce deletes a category's children with it. Deleting every category deepest
 * first sent one request each (2026-11-06).
 *
 * @module features/data-installer/services/demoDataWipe/wipeCategories
 */

import type { WipeCategory } from './wipeReads';
import type { WipeScope } from './wipeScope';

export interface CategoryDecision {
    remove: WipeCategory[];
    shared: Array<{ root: string; under: WipeCategory[]; with: string[] }>;
    holding: WipeCategory[];
}

const segmentsOf = (c: WipeCategory): string[] => (c.path ?? '').split('/').filter(Boolean);

/** The categories under each chosen store's root: deleted, or left with the reason. */
export function decideCategories(tree: readonly WipeCategory[], scope: WipeScope, recorded: Set<string>): CategoryDecision {
    const decided: CategoryDecision = { remove: [], shared: [], holding: [] };
    const holdsRecorded = new Set(tree.filter((c) => recorded.has(String(c.id))).flatMap((c) => segmentsOf(c).slice(0, -1)));
    const under = (root: string) => tree.filter((c) => segmentsOf(c)[1] === root && segmentsOf(c).length > 2);
    for (const [root, others] of scope.sharedRoots) decided.shared.push({ root, under: under(root), with: others });
    for (const root of scope.clearedRoots) {
        for (const category of under(root)) {
            if (recorded.has(String(category.id))) continue;
            (holdsRecorded.has(String(category.id)) ? decided.holding : decided.remove).push(category);
        }
    }
    decided.remove.sort((a, b) => segmentsOf(b).length - segmentsOf(a).length);
    return decided;
}

/**
 * The categories going, the top ones first, and each under one of them by the top it goes with. A
 * category is only deleted when nothing under it stays (`decideCategories`), so a top's delete takes
 * every category under it.
 */
export function categoryOrder(remove: readonly WipeCategory[]): { categoryIds: string[]; categoryUnder: Record<string, string> } {
    const going = new Set(remove.map((c) => String(c.id)));
    const topOf = (c: WipeCategory): string | undefined => segmentsOf(c).slice(0, -1).find((id) => going.has(id));
    const categoryUnder: Record<string, string> = {};
    for (const category of remove) {
        const top = topOf(category);
        if (top !== undefined) categoryUnder[String(category.id)] = top;
    }
    const ids = remove.map((c) => String(c.id));
    return { categoryIds: [...ids.filter((id) => !categoryUnder[id]), ...ids.filter((id) => categoryUnder[id])], categoryUnder };
}
