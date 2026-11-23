/**
 * The install summary's rows, from the check's preview (`preview-datapack-changes`; step 03, S4).
 * One row per data type, its plain name and its count (prototype-conventions rule 8): bare, "56",
 * when every record is new; "53 added, 3 updated" only when some already exist (decisions Phase 5,
 * J2-1; rule 5, the verb only when it says something new). A type with nothing to change is not
 * listed (rule 7). A kind that installs with another (an attribute's options) counts on that type,
 * as the install asks for it.
 *
 * Pure: no React.
 *
 * @module features/data-installer/ui/components/job/installRows
 */

import type { ChangedKind } from '../../../removalChanges';
import type { KindChanges } from '../../../services/demoBuilderEngine/storeChanges';
import { dataTypeLabel } from '../../dataTypeLabel';

/** One row of the type table. */
export interface TypeRow {
    /** The data type's code, as the pack and the records name it. */
    type: string;
    label: string;
    /** How many records it puts in Commerce. */
    count: number;
    /** What happens, as the row says it: "56", "53 added, 3 updated". */
    happens: string;
}

interface Counts {
    added: number;
    updated: number;
    removed: number;
}

const digits = (n: number): string => n.toLocaleString('en-US');

/** "56" when only added; else each count with its verb, added first. */
function happensOf(counts: Counts): string {
    if (counts.updated === 0 && counts.removed === 0) return digits(counts.added);
    const parts: Array<[number, string]> = [
        [counts.added, 'added'],
        [counts.updated, 'updated'],
        [counts.removed, 'removed'],
    ];
    return parts
        .filter(([count]) => count > 0)
        .map(([count, word]) => `${digits(count)} ${word}`)
        .join(', ');
}

/** The rows, in the order the preview names the kinds. */
export function installRows(kinds: readonly KindChanges[]): TypeRow[] {
    const counts = new Map<string, Counts>();
    for (const kind of kinds) {
        const type = kind.installsWith ?? kind.kind;
        const sum = counts.get(type) ?? { added: 0, updated: 0, removed: 0 };
        counts.set(type, {
            added: sum.added + kind.add.count,
            updated: sum.updated + kind.update.count,
            removed: sum.removed + kind.remove.count,
        });
    }
    return [...counts.entries()]
        .map(([type, sum]) => ({
            type,
            label: dataTypeLabel(type),
            count: sum.added + sum.updated + sum.removed,
            happens: happensOf(sum),
        }))
        .filter((row) => row.count > 0);
}

/**
 * Rows of a count by type, the count bare and no example names (decisions Phase 3, J2-1): "Save Your
 * Changes First?"'s, the SC's changes (step 03, S6); and the Uninstall question's, what the install
 * record lists (S7).
 */
export function countedRows(kinds: ReadonlyArray<Pick<ChangedKind, 'kind' | 'count'>>): TypeRow[] {
    return kinds.map((kind) => ({
        type: kind.kind,
        label: dataTypeLabel(kind.kind),
        count: kind.count,
        happens: digits(kind.count),
    }));
}
