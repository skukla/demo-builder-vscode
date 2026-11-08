/**
 * The import window's rows, decided from what the engine says (owner, 2026-11-07): one per data
 * type in install order, where each stands while it runs, and how each ended on the same row.
 */

import type { DataTypeStatus } from '@/features/data-installer/types';
import {
    runRows,
    type RunSource,
} from '@/features/data-installer/ui/components/importRunRows';

const source = (over: Partial<RunSource>): RunSource => ({
    perType: {},
    dataTypes: ['products', 'categories'],
    ...over,
});
const states = (map: Record<string, DataTypeStatus>) => map;

describe('runRows', () => {
    it('puts the rows in install order from the first poll, each waiting', () => {
        expect(runRows(source({})).map((row) => [row.label, row.line])).toEqual([
            ['Categories', 'Waiting'],
            ['Products', 'Waiting'],
        ]);
    });

    it('adds a type the engine installs because another needs it', () => {
        const rows = runRows(source({ perType: states({ attribute_sets: 'success' }) }));

        expect(rows.map((row) => row.kind)).toEqual(['attribute_sets', 'categories', 'products']);
    });

    it('shows the type in progress with the engine’s count', () => {
        const row = runRows(
            source({
                perType: states({ categories: 'success', products: 'processing' }),
                detail: '450 of 2,046 products',
            })
        )[1];

        expect(row).toMatchObject({ status: 'checking', line: '450 of 2,046 products' });
    });

    it('shows a type the engine is between as done: its rows are in', () => {
        const row = runRows(
            source({
                perType: states({ categories: 'success', products: 'processing' }),
                phase: 'Checking the products against the datapack',
            })
        )[1];

        expect(row).toMatchObject({ status: 'success', line: 'Done' });
    });

    it('puts the reason on the type it stopped on, red, and calls the rest not run', () => {
        const rows = runRows(
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
        const rows = runRows(
            source({
                perType: states({ categories: 'success', products: 'success' }),
                rowNotes: { products: 'The store refused 3.' },
            })
        );

        expect(rows[1]).toMatchObject({
            status: 'warning',
            problem: { text: 'The store refused 3.', failed: false },
        });
    });

    it('CONTROL: a clean run is all done, with no problem', () => {
        const rows = runRows(
            source({ perType: states({ categories: 'success', products: 'success' }) })
        );

        expect(rows.every((row) => row.status === 'success' && row.line === 'Done')).toBe(true);
        expect(rows.some((row) => row.problem)).toBe(false);
    });
});
