/**
 * "Save Changes to My Luma"'s rows (step-04 S2; decisions Phase 7b, J3-1; P4-Q3): what the datapack
 * will hold, one row per type, from what its install record lists, the count bare ("2,046"), with
 * how many the SC changed only where they changed some ("2,046, 4 changed"; prototype-conventions
 * rule 5, a word only when it says something new). A changed type the record does not count gets a
 * row of its own. Records added by hand since the install show only once saved: neither read sees
 * them (the changes check reads what the datapack made).
 *
 * Pure: no React.
 *
 * @module features/data-installer/ui/components/save/saveRows
 */

import type { ChangedKind, RecordedKind } from '../../../removalChanges';
import { dataTypeLabel } from '../../dataTypeLabel';
import type { TypeRow } from '../job/installRows';

const digits = (n: number): string => n.toLocaleString('en-US');

/** "2,046", or "2,046, 4 changed"; "4 changed" for a type the record does not count. */
function happensOf(count: number | undefined, changed: number): string {
    if (count === undefined) return `${digits(changed)} changed`;
    return changed > 0 ? `${digits(count)}, ${digits(changed)} changed` : digits(count);
}

/**
 * @param held - what the install record lists, by type, in install order
 * @param changed - the SC's changes, by type
 */
export function saveRows(
    held: readonly RecordedKind[],
    changed: ReadonlyArray<Pick<ChangedKind, 'kind' | 'count'>>,
): TypeRow[] {
    const changes = new Map(changed.map((each) => [each.kind, each.count]));
    const recorded = new Set(held.map((each) => each.kind));
    const types: Array<{ type: string; count?: number }> = [
        ...held.map((each) => ({ type: each.kind, count: each.count })),
        ...changed.filter((each) => !recorded.has(each.kind)).map((each) => ({ type: each.kind })),
    ];
    return types.map(({ type, count }) => ({
        type,
        label: dataTypeLabel(type),
        count: count ?? 0,
        happens: happensOf(count, changes.get(type) ?? 0),
    }));
}
