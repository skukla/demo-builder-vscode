/**
 * Typed shapes for what `preview-datapack-changes` answers (`ChangePreview`), so a fake preview cannot
 * answer in a shape the code no longer reads (root CLAUDE.md, "A shape written where the compiler
 * cannot read it").
 *
 * @module tests/helpers/changePreviewFixtures
 */

import type { ChangePreview, KindChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';

/** How many of each a kind would change. */
export interface KindCounts {
    add?: number;
    update?: number;
    inStore?: number;
    remove?: number;
    keep?: number;
}

const named = (count = 0) => ({ count, names: [] });

/** One kind's changes, every count 0 unless given. */
export function kindChanges(kind: string, counts: KindCounts = {}): KindChanges {
    return {
        kind,
        add: named(counts.add),
        update: named(counts.update),
        inStore: named(counts.inStore),
        remove: named(counts.remove),
        keep: named(counts.keep),
    };
}

/** A pack Demo Builder installed here that the store already matches: every kind changes nothing. */
export const MATCHING_PREVIEW: ChangePreview = {
    installed: true,
    kinds: [kindChanges('categories'), kindChanges('products')],
};
