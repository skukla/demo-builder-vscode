/**
 * The import window's rows, one per data type, decided from what the engine says (owner,
 * 2026-11-07): where each type stands while the import runs, and how it ended once it has, on the
 * same rows ("A run ends where it ran", `docs/development/sop/dialog-design.md`).
 *
 * Pure: no React. Rows sit in the order the engine installs, from the start, so nothing moves as
 * each type begins. The engine's work outside any one type has a row of its own at each end:
 * Preparing Import (reading the datapack, comparing the store with it) and Finishing Import
 * (recording what went in, the store settings, the check), each spinning with its step as its line.
 * That work was a grey line under the list, while every row said Waiting (owner, 2026-11-07).
 *
 * @module features/data-installer/ui/components/importRunRows
 */

import { STORE_CONFIG_KIND } from '../../services/datapackCatalog';
import { inInstallOrder } from '../../services/demoBuilderEngine/installOrder';
import { type DataTypeStatus, FINISHING_STOP, type JobStanding } from '../../types';
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
    /** Still running: the end rows spin or wait. Otherwise each says how it ended. */
    running?: boolean;
}

/** The end rows' kinds: no data type is named this. */
export const PREPARING = 'preparing';
export const FINISHING = FINISHING_STOP;

/**
 * Every row: Preparing Import, the types in install order (those asked for and any the engine added
 * because they need them), then Finishing Import.
 */
export function runRows(source: RunSource): RunRow[] {
    const kinds = inInstallOrder([
        ...new Set([...source.dataTypes, ...Object.keys(source.perType)]),
    ]);
    const states = kinds.map((kind) => source.perType[kind] ?? 'pending');
    const begun = states.some((state) => state !== 'pending' && state !== 'error');
    return [
        preparingRow(source, begun),
        ...kinds.map((kind) => rowOf(kind, source)),
        finishingRow(source, begun, kinds),
    ];
}

const DONE = { status: 'success', line: 'Done' } as const;

/** Before the first type: spins with the engine's step; it failed when the job stopped before any. */
function preparingRow(source: RunSource, begun: boolean): RunRow {
    const row = { kind: PREPARING, label: 'Preparing Import' };
    if (source.running) {
        return begun ? { ...row, ...DONE } : { ...row, status: 'checking', line: source.phase ?? 'Starting' };
    }
    if (!begun && !source.stoppedAt && source.reason) {
        return { ...row, status: 'error', problem: { text: source.reason, failed: true } };
    }
    return { ...row, ...DONE };
}

/**
 * After the last type: spins while the engine works with no type left to start. Failed when the job
 * stopped there, after every type was in. Not run when it stopped on a type; the store settings fail
 * without stopping it, so the check still ran.
 */
function finishingRow(source: RunSource, begun: boolean, kinds: string[]): RunRow {
    const row = { kind: FINISHING, label: 'Finishing Import' };
    if (source.running) {
        return begun && source.phase
            ? { ...row, status: 'checking', line: source.phase }
            : { ...row, status: 'pending', line: 'Waiting' };
    }
    if (source.stoppedAt === FINISHING_STOP) {
        return { ...row, status: 'error', problem: { text: source.reason ?? 'It stopped here.', failed: true } };
    }
    const stopped = kinds.some((kind) => source.perType[kind] === 'error' && kind !== STORE_CONFIG_KIND);
    return stopped ? { ...row, status: 'pending', line: 'Not run' } : { ...row, ...DONE };
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
