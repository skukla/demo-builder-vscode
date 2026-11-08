/**
 * The import window's rows, one per data type, decided from what the engine says (owner,
 * 2026-11-07): where each type stands while the import runs, and how it ended once it has, on the
 * same rows ("A run ends where it ran", `docs/development/sop/dialog-design.md`).
 *
 * Pure: no React. Rows sit in the order the engine installs, from the start, so nothing moves as
 * each type begins. A type the engine is between (reading the store first, the check at the end)
 * is not running: its rows are in, and the window says the phase under the list.
 *
 * @module features/data-installer/ui/components/importRunRows
 */

import { inInstallOrder } from '../../services/demoBuilderEngine/installOrder';
import type { DataTypeStatus, JobStanding } from '../../types';
import { dataTypeLabel } from '../dataTypeLabel';
import type { StepStatus } from '@/core/ui/components/feedback/StepStatusIcon';

/** One row: its icon, its name, and the line under it, or the problem in its place. */
export interface RunRow {
    kind: string;
    label: string;
    status: StepStatus;
    /** Where it stands: "Waiting", "450 of 2,046 products", "Done", "Not run". */
    line?: string;
    /** What is wrong with it: red when it failed, orange when it went in with a problem. */
    problem?: { text: string; failed: boolean };
}

/** What the rows are drawn from: a live poll, or the finished job's record. */
export interface RunSource extends Pick<JobStanding, 'phase' | 'stoppedAt' | 'rowNotes'> {
    perType: Record<string, DataTypeStatus>;
    /** The types the import asked for: rows from the first poll, before the engine reaches them. */
    dataTypes: string[];
    /** The engine's count for the type in progress. */
    detail?: string;
    /** Why the job stopped, for the row it stopped on. */
    reason?: string;
}

/** Every row, in install order: the types asked for and any the engine added because they need them. */
export function runRows(source: RunSource): RunRow[] {
    const kinds = inInstallOrder([
        ...new Set([...source.dataTypes, ...Object.keys(source.perType)]),
    ]);
    return kinds.map((kind) => rowOf(kind, source));
}

function rowOf(kind: string, source: RunSource): RunRow {
    const row = { kind, label: dataTypeLabel(kind) };
    const state = source.perType[kind] ?? 'pending';
    if (state === 'error') {
        return kind === source.stoppedAt
            ? {
                  ...row,
                  status: 'error',
                  problem: { text: source.reason ?? 'It stopped here.', failed: true },
              }
            : { ...row, status: 'pending', line: 'Not run' };
    }
    if (state === 'pending') return { ...row, status: 'pending', line: 'Waiting' };
    if (state === 'processing' && !source.phase)
        return { ...row, status: 'checking', line: source.detail ?? 'Installing' };
    const note = source.rowNotes?.[kind];
    return note
        ? { ...row, status: 'warning', problem: { text: note, failed: false } }
        : { ...row, status: 'success', line: 'Done' };
}
