/**
 * "Save Changes to My Luma"'s rows (step-04 S2; decisions Phase 7b, J3-1; P4-Q3, step-07 E1): what
 * the datapack holds, one row per type, from what its install record lists, the count bare
 * ("2,046"), with how many the SC changed and added by hand since the install only where there are
 * some ("2,046, 4 changed, 2 added"; prototype-conventions rule 5, a word only when it says
 * something new). A changed or added type the record does not count gets a row of its own ("2
 * added"). What is added is what the save takes that the datapack does not hold (`demoAdditions.ts`).
 *
 * Pure: no React.
 *
 * @module features/data-installer/ui/components/save/saveRows
 */

import type { ChangedKind, RecordedKind } from '../../../removalChanges';
import { dataTypeLabel } from '../../dataTypeLabel';
import type { TypeRow } from '../job/installRows';

type Counted = ReadonlyArray<Pick<ChangedKind, 'kind' | 'count'>>;

const digits = (n: number): string => n.toLocaleString('en-US');

/** "2,046", "2,046, 4 changed, 2 added", or "4 changed" for a type the record does not count. */
function happensOf(count: number | undefined, changed: number, added: number): string {
    const parts = [
        ...(count === undefined ? [] : [digits(count)]),
        ...(changed > 0 ? [`${digits(changed)} changed`] : []),
        ...(added > 0 ? [`${digits(added)} added`] : []),
    ];
    return parts.join(', ');
}

/**
 * @param held - what the install record lists, by type, in install order
 * @param changed - the SC's changes, by type
 * @param added - what the SC added by hand since the install, by type
 */
export function saveRows(held: readonly RecordedKind[], changed: Counted, added: Counted = []): TypeRow[] {
    const changes = new Map(changed.map((each) => [each.kind, each.count]));
    const additions = new Map(added.map((each) => [each.kind, each.count]));
    const recorded = new Set(held.map((each) => each.kind));
    const unrecorded = [...new Set([...changed, ...added].map((each) => each.kind))].filter((kind) => !recorded.has(kind));
    const types: Array<{ type: string; count?: number }> = [
        ...held.map((each) => ({ type: each.kind, count: each.count })),
        ...unrecorded.map((type) => ({ type })),
    ];
    return types.map(({ type, count }) => ({
        type,
        label: dataTypeLabel(type),
        count: count ?? 0,
        happens: happensOf(count, changes.get(type) ?? 0, additions.get(type) ?? 0),
    }));
}
