/**
 * What a save's progress line counts: the data types this save is about, rather than every type a
 * save could read. "0 of 12 data types: Products, Gift Cards" was the line for a pack of two customer
 * groups (owner, 2026-11-05). A read with nothing to do is skipped over; the reads themselves do not
 * change.
 *
 * The same reads are the save's rows (walk F91): two steps (decisions.md, Phase 7b), "Export from
 * Commerce" with a row per data type the save is about under it, in the order capture reads them
 * (`runRows`, `SAVE_RUN`), then the write into the pack as its own row, so a failed write shows on
 * its own row. The words are the prototype's (`mockups/flow/scenarioSave.ts`, `typesRunSteps`).
 *
 * @module features/data-installer/services/demoBuilderEngine/capturePhases
 */

import { SAVE_RUN, runRows } from '../../runRows';
import type { DataTypeStatus } from '../../types';
import { phaseLine } from '../datapackTypesLine';
import { CAPTURE_PHASES } from './capture';
import type { OperationRow } from '@/types/webviewPayloads';

/** A kind a save is seeded with, read under another of the phases' names. */
const READ_UNDER: Readonly<Record<string, readonly string[]>> = {
    // A product brings its attributes, set, categories and stock with it.
    products: ['product_attributes', 'attribute_sets', 'categories', 'source_items'],
    attribute_assign_to_set: ['attribute_sets'],
    attribute_options: ['product_attributes'],
    sources: ['source_items'],
    stocks: ['source_items'],
    stock_source_links: ['source_items'],
    coupons: ['cart_rules'],
};

/**
 * The line for each read of a save.
 *
 * @param seeded - the kinds the save starts from: what the pack made, holds, and what was picked
 * @returns the line for a read, by its place in `CAPTURE_PHASES`
 */
export function captureLines(seeded: Iterable<string>): (at: number) => string {
    const shown = shownPhases(seeded);
    const phases = shown.filter((phase) => phase.length > 0);
    // Nothing recognised: say every read, rather than count to zero.
    if (phases.length === 0) return (at) => phaseLine(CAPTURE_PHASES, at);
    return (at) => phaseLine(phases, shown.slice(0, at).filter((phase) => phase.length > 0).length);
}

/** Each read's data types this save is about, by its place in `CAPTURE_PHASES`; an empty read has none. */
function shownPhases(seeded: Iterable<string>): string[][] {
    const active = new Set<string>();
    for (const kind of seeded) {
        active.add(kind);
        for (const also of READ_UNDER[kind] ?? []) active.add(also);
    }
    return CAPTURE_PHASES.map((phase) => phase.filter((kind) => active.has(kind)));
}

/** Where a read stands while the read at `at` is under way. */
function readState(read: number, at: number): DataTypeStatus {
    if (read < at) return 'success';
    return read === at ? 'processing' : 'pending';
}

/** A save's two steps at each point of it (walk F91; Phase 7b). */
export interface CaptureRows {
    /** Before the reads: the export spins with what the save does first. */
    preparing: (step: string) => OperationRow[];
    /** A read under way, by its place in `CAPTURE_PHASES`: the types before it done, its own spinning. */
    reading: (at: number) => OperationRow[];
    /** After the reads: the export done, the save's row spinning with what it is writing. */
    finishing: (step: string) => OperationRow[];
}

const EXPORT = { kind: 'export', label: 'Export from Commerce' } as const;
const WAITING = 'Waiting';
const NOT_RUN = 'Not run';
const STOPPED = 'Stopped';

/** The export step over its types: done when every one is, else how many are, else what it does. */
function exportStep(types: OperationRow[], line?: string): OperationRow {
    const done = types.filter((type) => type.status === 'success').length;
    if (line) return { ...EXPORT, status: 'checking', line, types };
    if (types.length > 0 && done === types.length) return { ...EXPORT, status: 'success', line: 'Exported', types };
    // The prototype's step line counts data types (`scenarioInstall.ts` `typesStep`); the type
    // being read says "Exporting" (`SAVE_RUN`).
    const counted = types.length > 0 ? `${done} of ${types.length} data type${types.length === 1 ? '' : 's'}` : SAVE_RUN.doing;
    return { ...EXPORT, status: 'checking', line: counted, types };
}

/**
 * The save's two steps: the import's rows (`runRows`) for the data types, under Export from
 * Commerce, then the write.
 *
 * @param seeded - the kinds the save starts from, as `captureLines` takes them
 * @param into - the name of the datapack the save writes: the demo's own, or the Save As name
 */
export function captureRows(seeded: Iterable<string>, into: string): CaptureRows {
    const shown = shownPhases(seeded);
    const kinds = shown.flat();
    const save = { kind: 'save', label: `Save ${into}` };
    const typeRows = (perType: Record<string, DataTypeStatus>): OperationRow[] => runRows({ dataTypes: kinds, perType, running: true }, SAVE_RUN);
    const statesAt = (at: number): Record<string, DataTypeStatus> =>
        Object.fromEntries(shown.flatMap((phase, i) => phase.map((kind): [string, DataTypeStatus] => [kind, readState(i, at)])));
    const allDone = (): Record<string, DataTypeStatus> => Object.fromEntries(kinds.map((kind): [string, DataTypeStatus] => [kind, 'success']));
    const waiting: OperationRow = { ...save, status: 'pending', line: WAITING };
    return {
        preparing: (step) => [exportStep(typeRows({}), step), waiting],
        reading: (at) => [exportStep(typeRows(statesAt(at))), waiting],
        finishing: (step) => [exportStep(typeRows(allDone())), { ...save, status: 'checking', line: step }],
    };
}

/** A row the save stopped on: spinning becomes red, not started becomes "Not run". */
function stoppedRow(row: OperationRow): OperationRow {
    if (row.status === 'checking') return { ...row, status: 'error', line: STOPPED };
    return row.status === 'pending' ? { ...row, line: NOT_RUN } : row;
}

/**
 * The save's steps as it stopped (dialog design rules: how a run ended, on the rows it ended on):
 * the row that was spinning red, a step red when a type under it was, and what had not started
 * "Not run". The reason is the window's sentence under them, so it is said once.
 *
 * @param rows - the steps last sent while the save ran (`captureRows`)
 */
export function stoppedRows(rows: readonly OperationRow[]): OperationRow[] {
    return rows.map((row) => {
        if (!row.types) return stoppedRow(row);
        const types = row.types.map(stoppedRow);
        const failed = types.some((type) => type.status === 'error');
        return failed ? { ...row, status: 'error', line: STOPPED, types } : { ...stoppedRow(row), types };
    });
}
