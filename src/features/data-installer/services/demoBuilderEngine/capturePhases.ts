/**
 * What a save's progress line counts: the data types this save is about, rather than every type a
 * save could read. "0 of 12 data types: Products, Gift Cards" was the line for a pack of two customer
 * groups (owner, 2026-11-05). A read with nothing to do is skipped over; the reads themselves do not
 * change.
 *
 * The same reads are the save's rows (walk F91): a row per data type the save is about, in the order
 * capture reads them, between Preparing Save and Finishing Save, drawn as the import's are
 * (`runRows`, `SAVE_RUN`).
 *
 * @module features/data-installer/services/demoBuilderEngine/capturePhases
 */

import { type RunSource, SAVE_RUN, runRows } from '../../runRows';
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

/** A save's rows at each point of it (walk F91). */
export interface CaptureRows {
    /** Before the reads: the first row spins with what the save does first. */
    preparing: (step: string) => OperationRow[];
    /** A read under way, by its place in `CAPTURE_PHASES`: the types before it done, its own spinning. */
    reading: (at: number) => OperationRow[];
    /** After the reads: the last row spins with what the save is writing. */
    finishing: (step: string) => OperationRow[];
}

/**
 * The save's rows, the import's (`runRows`) named for the save.
 *
 * @param seeded - the kinds the save starts from, as `captureLines` takes them
 */
export function captureRows(seeded: Iterable<string>): CaptureRows {
    const shown = shownPhases(seeded);
    const kinds = shown.flat();
    const rows = (perType: Record<string, DataTypeStatus>, more: Partial<RunSource> = {}): OperationRow[] => runRows({ dataTypes: kinds, perType, ...more }, SAVE_RUN);
    const statesAt = (at: number): Record<string, DataTypeStatus> =>
        Object.fromEntries(shown.flatMap((phase, i) => phase.map((kind): [string, DataTypeStatus] => [kind, readState(i, at)])));
    const allDone = (): Record<string, DataTypeStatus> => Object.fromEntries(kinds.map((kind): [string, DataTypeStatus] => [kind, 'success']));
    return {
        preparing: (step) => rows({}, { phase: step, running: true }),
        reading: (at) => rows(statesAt(at), { running: true }),
        finishing: (step) => rows(allDone(), { phase: step, running: true }),
    };
}
