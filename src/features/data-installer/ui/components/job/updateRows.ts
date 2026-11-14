/**
 * An update's summary rows and its spot check's records (step-07 U1, J9-2), from its check's changes
 * (`update-datapack`, `UpdateTypeChange`). One row per data type the newer version changed, counted by
 * what the update writes, bare verbs ("3 updated", "12 added, 36 updated"; rule 5); the records it
 * writes are Review Records' Changed tab, and the SC's edits it leaves alone its Kept tab, with the
 * notice dot as Clear's kept records have (J1-3b).
 *
 * Pure: no React.
 *
 * @module features/data-installer/ui/components/job/updateRows
 */

import { updateHappens } from '../../../updateChanges';
import { dataTypeLabel } from '../../dataTypeLabel';
import type { TypeRow } from './installRows';
import type { UpdateTypeChange } from '@/types/webviewRequests';

/** The rows, in the order the check names the types. */
export function updateRows(changes: readonly UpdateTypeChange[]): TypeRow[] {
    return changes.map((change) => ({
        type: change.type,
        label: dataTypeLabel(change.type),
        count: change.added + change.updated + change.removed,
        happens: updateHappens(change),
    }));
}

/** Each type's records, for the spot check: the ones written (Changed) and the SC's edits kept (Kept). */
export function updateRecords(changes: readonly UpdateTypeChange[]): {
    changed: Record<string, string[]>;
    kept: Record<string, string[]>;
} {
    const changed: Record<string, string[]> = {};
    const kept: Record<string, string[]> = {};
    for (const change of changes) {
        changed[change.type] = change.changed;
        kept[change.type] = change.kept;
    }
    return { changed, kept };
}
