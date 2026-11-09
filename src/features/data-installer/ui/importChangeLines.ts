/**
 * What importing a pack the project has again would change, as one line per data type (owner,
 * 2026-11-07, 2026-11-08): counts, not names. Shown under each data type in the Import form
 * (`useImportChanges`).
 *
 * A kind that installs with another (an attribute's options) is counted on that data type, as the
 * install asks for it. Rows the store has that Demo Builder did not make are left as they are, so
 * they are no change.
 *
 * Pure: no React.
 *
 * @module features/data-installer/ui/importChangeLines
 */

import type { KindChanges } from '../services/demoBuilderEngine/storeChanges';

interface Counts {
    updated: number;
    added: number;
    removed: number;
}

/** "12 updated, 3 added, 2 removed", digits with separators; "No changes" when all are zero. */
export function changesLine(counts: Counts | undefined): string {
    if (!counts) return 'No changes';
    const parts = (
        [
            [counts.updated, 'updated'],
            [counts.added, 'added'],
            [counts.removed, 'removed'],
        ] as const
    )
        .filter(([count]) => count > 0)
        .map(([count, word]) => `${count.toLocaleString('en-US')} ${word}`);
    return parts.length > 0 ? parts.join(', ') : 'No changes';
}

/** Each offered data type's line, from the preview's kinds. */
export function changeLines(kinds: readonly KindChanges[], types: readonly string[]): Record<string, string> {
    const counts = new Map<string, Counts>();
    for (const kind of kinds) {
        const type = kind.installsWith ?? kind.kind;
        const sum = counts.get(type) ?? { updated: 0, added: 0, removed: 0 };
        counts.set(type, {
            updated: sum.updated + kind.update.count,
            added: sum.added + kind.add.count,
            removed: sum.removed + kind.remove.count,
        });
    }
    return Object.fromEntries(types.map((type) => [type, changesLine(counts.get(type))]));
}
