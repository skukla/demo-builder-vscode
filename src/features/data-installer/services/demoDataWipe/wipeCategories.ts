/**
 * Which categories Clear Demo Data deletes, and in what order.
 *
 * Under each root only the chosen websites' stores use, a category goes unless Demo Builder installed
 * it or something it installed sits under it. So a category going has nothing staying under it, and
 * deleting the top ones takes the rest: Commerce deletes a category's children with it. Deleting every
 * category deepest first sent one request each (2026-11-06). Under a root a website not chosen also
 * shows, every category is kept.
 *
 * @module features/data-installer/services/demoDataWipe/wipeCategories
 */

import type { WipeCategory } from './wipeReads';
import type { WipeScope } from './wipeScope';

export interface CategoryDecision {
    remove: WipeCategory[];
    /** Under a shared root, installed, or holding one installed: in the tree's order. */
    kept: WipeCategory[];
}

const segmentsOf = (c: WipeCategory): string[] => (c.path ?? '').split('/').filter(Boolean);

/** The categories under each chosen store's root: deleted, or kept. */
export function decideCategories(tree: readonly WipeCategory[], scope: WipeScope, recorded: ReadonlySet<string>): CategoryDecision {
    const holdsRecorded = new Set(tree.filter((c) => recorded.has(String(c.id))).flatMap((c) => segmentsOf(c).slice(0, -1)));
    const under = (c: WipeCategory): string | undefined => (segmentsOf(c).length > 2 ? segmentsOf(c)[1] : undefined);
    const remove: WipeCategory[] = [];
    const kept: WipeCategory[] = [];
    for (const category of tree) {
        const root = under(category);
        if (root === undefined || (!scope.clearedRoots.has(root) && !scope.sharedRoots.has(root))) continue;
        const stays = scope.sharedRoots.has(root) || recorded.has(String(category.id)) || holdsRecorded.has(String(category.id));
        (stays ? kept : remove).push(category);
    }
    remove.sort((a, b) => segmentsOf(b).length - segmentsOf(a).length);
    return { remove, kept };
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
