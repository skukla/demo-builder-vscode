/**
 * captureLines: a save's progress line counts the data types this save is about, not every type a
 * save could read (owner, 2026-11-05).
 */

import { captureLines, captureRows, stoppedRows } from '@/features/data-installer/services/demoBuilderEngine/capturePhases';
import type { OperationRow } from '@/types/webviewPayloads';

describe('captureLines', () => {
    it('counts only what was picked', () => {
        const line = captureLines(['customer_groups']);

        expect(line(0)).toBe('0 of 1 data type: Customer Groups');
        expect(line(5)).toBe('0 of 1 data type: Customer Groups');
        expect(line(6)).toBe('1 of 1 data type');
    });

    it('counts what a product brings with it', () => {
        const line = captureLines(['products']);

        expect(line(0)).toBe('0 of 5 data types: Products');
        expect(line(1)).toBe('1 of 5 data types: Categories');
        expect(line(4)).toBe('4 of 5 data types: Stock Quantities');
    });

    it('counts a kind read under another by the phase that reads it', () => {
        expect(captureLines(['coupons'])(0)).toBe('0 of 1 data type: Cart Rules');
    });

    it('says every read when it recognises nothing, rather than counting to zero', () => {
        expect(captureLines([])(0)).toBe('0 of 12 data types: Products, Gift Cards');
    });
});

// Phase 7b (decisions.md): the save run is two steps, "Export from Commerce" with the data types
// under it, then the write into the pack as its own row, so a failed write shows on its own row.
// The words are the prototype's (`mockups/flow/scenarioSave.ts` `typesRunSteps`, and
// `scenarioInstall.ts` `typesStep` and `unitStep`).
describe('captureRows, the save as two steps', () => {
    const steps = (rows: OperationRow[]) => rows.map((row) => [row.kind, row.label, row.status, row.line]);
    const types = (row: OperationRow | undefined) => (row?.types ?? []).map((t) => [t.label, t.status, t.line]);

    it('spins Export from Commerce with what the save does first, every type waiting, the save waiting', () => {
        const rows = captureRows(['products'], 'My Luma').preparing("Reading this demo's data");

        expect(steps(rows)).toEqual([
            ['export', 'Export from Commerce', 'checking', "Reading this demo's data"],
            ['save', 'Save My Luma', 'pending', 'Waiting'],
        ]);
        expect(types(rows[0])).toEqual([
            ['Products', 'pending', 'Waiting'],
            ['Categories', 'pending', 'Waiting'],
            ['Product Attributes', 'pending', 'Waiting'],
            ['Attribute Sets', 'pending', 'Waiting'],
            ['Stock Quantities', 'pending', 'Waiting'],
        ]);
    });

    it('counts the data types exported on the step, the type being read saying Exporting', () => {
        const rows = captureRows(['products'], 'My Luma').reading(2);

        expect(steps(rows)).toEqual([
            ['export', 'Export from Commerce', 'checking', '2 of 5 data types'],
            ['save', 'Save My Luma', 'pending', 'Waiting'],
        ]);
        expect(types(rows[0]).slice(0, 4)).toEqual([
            ['Products', 'success', 'Done'],
            ['Categories', 'success', 'Done'],
            ['Product Attributes', 'checking', 'Exporting'],
            ['Attribute Sets', 'pending', 'Waiting'],
        ]);
    });

    it('says one data type in the singular', () => {
        expect(captureRows(['customer_groups'], 'My Luma').reading(0)[0]?.line).toBe('0 of 1 data type');
    });

    it('marks the export Exported and spins the save with what it writes, once every type is read', () => {
        const rows = captureRows(['customer_groups'], 'Luma Holiday').finishing('Saving to My Datapacks');

        expect(steps(rows)).toEqual([
            ['export', 'Export from Commerce', 'success', 'Exported'],
            ['save', 'Save Luma Holiday', 'checking', 'Saving to My Datapacks'],
        ]);
        expect(types(rows[0])).toEqual([['Customer Groups', 'success', 'Done']]);
    });

    it('CONTROL: with no type it recognises, the export still spins while it reads', () => {
        expect(steps(captureRows([], 'My Luma').reading(0))[0]).toEqual(['export', 'Export from Commerce', 'checking', 'Exporting']);
    });
});

// A save that stops ends on the rows it stopped on (dialog design rules): the spinning row red,
// what had not started "Not run". The reason is the window's sentence under them, said once.
describe('stoppedRows', () => {
    const shape = (rows: OperationRow[]) => rows.map((row) => [row.label, row.status, row.line, ...(row.types ?? []).map((t) => `${t.label}: ${t.status}`)]);

    it('puts a failed write on the save row, the export done', () => {
        const rows = stoppedRows(captureRows(['customer_groups'], 'My Luma').finishing('Saving to My Datapacks'));

        expect(shape(rows)).toEqual([
            ['Export from Commerce', 'success', 'Exported', 'Customer Groups: success'],
            ['Save My Luma', 'error', 'Stopped'],
        ]);
    });

    it('puts a failed read on its type under the export, the rest not run', () => {
        const rows = stoppedRows(captureRows(['products'], 'My Luma').reading(1));

        expect(shape(rows)).toEqual([
            ['Export from Commerce', 'error', 'Stopped', 'Products: success', 'Categories: error', 'Product Attributes: pending', 'Attribute Sets: pending', 'Stock Quantities: pending'],
            ['Save My Luma', 'pending', 'Not run'],
        ]);
        expect(rows[0]?.types?.[2]?.line).toBe('Not run');
    });

    it('puts a stop before any read on the export step', () => {
        const rows = stoppedRows(captureRows(['customer_groups'], 'My Luma').preparing("Reading this demo's data"));

        expect(shape(rows)).toEqual([
            ['Export from Commerce', 'error', 'Stopped', 'Customer Groups: pending'],
            ['Save My Luma', 'pending', 'Not run'],
        ]);
    });
});
