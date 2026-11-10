/**
 * A datapack run's rows, one per data type, decided from what the engine says (owner, 2026-11-07):
 * where each type stands while the run goes, and how it ended once it has, on the same rows when it
 * ended with a problem (`docs/development/sop/dialog-design.md`). The import's window draws them
 * under its Install step (`importSteps`), and a save's progress window since walk F91, its rows named
 * for the save (`SAVE_RUN`) and sent from the extension; so this module sits beside
 * `pickableKinds.ts`, read by both sides.
 *
 * Pure: no React. Rows sit in the order the engine installs, from the start, so nothing moves as
 * each type begins. Work outside the data types has no row of its own (review, 2026-11-10, the run
 * rule of 2026-11-10): the import says it on its steps; a save says it on the row it leads to, the
 * first row while it finds what to read, the last while it writes what it read.
 *
 * @module features/data-installer/runRows
 */

import { inInstallOrder } from './services/demoBuilderEngine/installOrder';
import { type DataTypeStatus, FINISHING_STOP, type JobStanding, REPLACE_STOP, SAVE_STOP } from './types';
import { dataTypeLabel } from './ui/dataTypeLabel';
import type { OperationRow } from '@/types/webviewPayloads';

/** What a run's rows are named and ordered by: an import's, or a save's. */
export interface RunWords {
    /** A type's line while it is in progress, when the engine gives no count. */
    doing: string;
    /** The rows' order: the order the run works through the types. */
    order: (kinds: string[]) => string[];
    /** The engine's step outside the data types goes on the row it leads to (a save has no steps). */
    phaseOnRows?: true;
}

/** An import: types in the order the engine installs them. */
const IMPORT_RUN: RunWords = { doing: 'Installing', order: inInstallOrder };

/** A save: types in the order given, which is the order capture reads them (`CAPTURE_PHASES`). */
export const SAVE_RUN: RunWords = { doing: 'Reading', order: (kinds) => kinds, phaseOnRows: true };

/** What the rows are drawn from: a live poll, or the finished job's record. */
export interface RunSource extends Pick<JobStanding, 'phase' | 'stoppedAt' | 'rowNotes'> {
    perType: Record<string, DataTypeStatus>;
    /** The types the import asked for: rows from the first poll, before the engine reaches them. */
    dataTypes: string[];
    /** The engine's count for the type in progress. */
    detail?: string;
    /** Why the job stopped, for the row it stopped on. */
    reason?: string;
    /** Still running. Otherwise each row says how it ended. */
    running?: boolean;
}

/** Verify the Import's kind (`importSteps`): no data type is named this. */
export const FINISHING = FINISHING_STOP;
/** Uninstall the Previous Version's kind, when an import replaces the demo's pack. */
export const REPLACING = REPLACE_STOP;
/** Save Your Changes' kind, when the SC's changes are saved before an import replaces them. */
export const SAVING = SAVE_STOP;

/** Every data type's row, in the run's order: those asked for and any the engine added. */
export function runRows(source: RunSource, words: RunWords = IMPORT_RUN): OperationRow[] {
    const kinds = words.order([...new Set([...source.dataTypes, ...Object.keys(source.perType)])]);
    const rows = kinds.map((kind) => rowOf(kind, source, words));
    return words.phaseOnRows ? withPhase(rows, source) : rows;
}

/**
 * A save's step outside the data types, on the row it leads to: the first row, spinning, before any
 * is read; the last, spinning, once every one is read and the save is writing.
 */
function withPhase(rows: OperationRow[], source: RunSource): OperationRow[] {
    const { phase } = source;
    if (!source.running || !phase || rows.length === 0) return rows;
    const at = rows.every((row) => row.status === 'pending') ? 0 : rows.length - 1;
    if (at > 0 && rows.some((row) => row.status !== 'success')) return rows;
    return rows.map((row, i) => (i === at ? { ...row, status: 'checking', line: phase } : row));
}

function rowOf(kind: string, source: RunSource, words: RunWords): OperationRow {
    const row = { kind, label: dataTypeLabel(kind) };
    const state = source.perType[kind] ?? 'pending';
    if (state === 'error') {
        return kind === source.stoppedAt
            ? {
                  ...row,
                  status: 'error',
                  problem: { text: source.reason ?? 'Stopped', failed: true },
              }
            : { ...row, status: 'pending', line: 'Not run' };
    }
    if (state === 'pending') return { ...row, status: 'pending', line: 'Waiting' };
    if (state === 'processing' && !source.phase)
        return { ...row, status: 'checking', line: source.detail ?? words.doing };
    const note = source.rowNotes?.[kind];
    return note
        ? { ...row, status: 'warning', problem: { text: note, failed: false } }
        : { ...row, status: 'success', line: 'Done' };
}
