/**
 * The import window's rows, decided from what the engine says (owner, 2026-11-07): one per data
 * type in install order, where each stands while it runs, and how each ended on the same row.
 */

import type { DataTypeStatus } from '@/features/data-installer/types';
import { SAVE_RUN, runRows, type RunSource } from '@/features/data-installer/runRows';
import type { OperationRow } from '@/types/webviewPayloads';

const source = (over: Partial<RunSource>): RunSource => ({
    perType: {},
    dataTypes: ['products', 'categories'],
    ...over,
});
const states = (map: Record<string, DataTypeStatus>) => map;
/** The data types' rows: since 2026-11-10 they are all the rows there are. */
const typeRows = (from: RunSource): OperationRow[] => runRows(from);

describe('runRows', () => {
    it('puts the rows in install order from the first poll, each waiting', () => {
        expect(typeRows(source({})).map((row) => [row.label, row.line])).toEqual([
            ['Categories', 'Waiting'],
            ['Products', 'Waiting'],
        ]);
    });

    it('adds a type the engine installs because another needs it', () => {
        const rows = typeRows(source({ perType: states({ attribute_sets: 'success' }) }));

        expect(rows.map((row) => row.kind)).toEqual(['attribute_sets', 'categories', 'products']);
    });

    it('shows the type in progress with the engine’s count', () => {
        const row = typeRows(
            source({
                perType: states({ categories: 'success', products: 'processing' }),
                detail: '450 of 2,046 products',
            })
        )[1];

        expect(row).toMatchObject({ status: 'checking', line: '450 of 2,046 products' });
    });

    it('shows a type the engine is between as done: its rows are in', () => {
        const row = typeRows(
            source({
                perType: states({ categories: 'success', products: 'processing' }),
                phase: 'Checking the products against the datapack',
            })
        )[1];

        expect(row).toMatchObject({ status: 'success', line: 'Done' });
    });

    it('puts the reason on the type it stopped on, red, and calls the rest not run', () => {
        const rows = typeRows(
            source({
                perType: states({ categories: 'error', products: 'error' }),
                stoppedAt: 'categories',
                reason: 'Commerce did not respond.',
            })
        );

        expect(rows[0]).toMatchObject({
            status: 'error',
            problem: { text: 'Commerce did not respond.', failed: true },
        });
        expect(rows[1]).toMatchObject({ status: 'pending', line: 'Not run' });
    });

    it('puts a problem that did not stop it on its row, orange', () => {
        const rows = typeRows(
            source({
                perType: states({ categories: 'success', products: 'success' }),
                rowNotes: { products: 'Commerce refused 3.' },
            })
        );

        expect(rows[1]).toMatchObject({
            status: 'warning',
            problem: { text: 'Commerce refused 3.', failed: false },
        });
    });

    // Review, 2026-11-10: work outside the data types has no row of its own.
    it('has a row per data type and nothing else, running or ended', () => {
        expect(runRows(source({ running: true, phase: 'Reading the datapack' })).map((r) => r.kind)).toEqual(['categories', 'products']);
        expect(runRows(source({ stoppedAt: 'finishing', reason: 'x' })).map((r) => r.kind)).toEqual(['categories', 'products']);
    });

    it('CONTROL: a clean run is all done, with no problem', () => {
        const rows = typeRows(
            source({ perType: states({ categories: 'success', products: 'success' }) })
        );

        expect(rows.every((row) => row.status === 'success' && row.line === 'Done')).toBe(true);
        expect(rows.some((row) => row.problem)).toBe(false);
    });
});

describe('runRows for a save (SAVE_RUN)', () => {
    const save = (over: Partial<RunSource>) => runRows(source({ dataTypes: ['categories', 'products'], running: true, ...over }), SAVE_RUN);

    // Phase 7b (owner, 2026-11-12, J3-1): the type being read says "Exporting", Commerce's word.
    it('says Exporting on the type being read, in the order given', () => {
        expect(save({ dataTypes: ['products', 'categories'], perType: states({ products: 'success', categories: 'processing' }) }).map((r) => [r.label, r.status, r.line])).toEqual([
            ['Products', 'success', 'Done'],
            ['Categories', 'checking', 'Exporting'],
        ]);
    });

    // Phase 7b: the save's own work is on its steps (`captureRows`), never on a type's row.
    it('keeps the save\'s phase off the rows, as the import does', () => {
        expect(save({ phase: 'Finding what this demo uses' }).every((r) => r.status === 'pending')).toBe(true);
    });

    it('CONTROL: an import keeps its phase off the rows: its steps say it', () => {
        expect(runRows(source({ running: true, phase: 'Reading the datapack' })).every((r) => r.status === 'pending')).toBe(true);
    });
});
