/**
 * The import window's rows, decided from what the engine says (owner, 2026-11-07): one per data
 * type in install order, where each stands while it runs, and how each ended on the same row.
 */

import type { DataTypeStatus } from '@/features/data-installer/types';
import {
    FINISHING,
    PREPARING,
    runRows,
    type RunRow,
    type RunSource,
} from '@/features/data-installer/ui/components/importRunRows';

const source = (over: Partial<RunSource>): RunSource => ({
    perType: {},
    dataTypes: ['products', 'categories'],
    ...over,
});
const states = (map: Record<string, DataTypeStatus>) => map;
/** The data types' rows, between Preparing Import and Finishing Import. */
const typeRows = (from: RunSource): RunRow[] => runRows(from).slice(1, -1);
const ends = (from: RunSource): [RunRow, RunRow] => {
    const rows = runRows(from);
    return [rows[0], rows[rows.length - 1]];
};

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
                rowNotes: { products: 'The store refused 3.' },
            })
        );

        expect(rows[1]).toMatchObject({
            status: 'warning',
            problem: { text: 'The store refused 3.', failed: false },
        });
    });

    describe('the rows at each end', () => {
        it('puts Preparing Import first and Finishing Import last', () => {
            const rows = runRows(source({ running: true }));

            expect(rows.map((row) => row.kind)).toEqual([
                PREPARING,
                'categories',
                'products',
                FINISHING,
            ]);
            expect([rows[0].label, rows[3].label]).toEqual([
                'Preparing Import',
                'Finishing Import',
            ]);
        });

        it('spins Preparing Import with the engine’s step before any type starts, Finishing waiting', () => {
            const [preparing, finishing] = ends(
                source({ running: true, phase: 'Comparing the store with the datapack' })
            );

            expect(preparing).toMatchObject({
                status: 'checking',
                line: 'Comparing the store with the datapack',
            });
            expect(finishing).toMatchObject({ status: 'pending', line: 'Waiting' });
        });

        it('says Starting before the engine names a step', () => {
            expect(ends(source({ running: true }))[0]).toMatchObject({
                status: 'checking',
                line: 'Starting',
            });
        });

        it('marks Preparing Import done once a type starts', () => {
            const [preparing, finishing] = ends(
                source({ running: true, perType: states({ categories: 'processing' }) })
            );

            expect(preparing).toMatchObject({ status: 'success', line: 'Done' });
            expect(finishing).toMatchObject({ status: 'pending', line: 'Waiting' });
        });

        it('spins Finishing Import with the engine’s step after the last type', () => {
            const [, finishing] = ends(
                source({
                    running: true,
                    perType: states({ categories: 'success', products: 'processing' }),
                    phase: 'Checking the products against the datapack',
                })
            );

            expect(finishing).toMatchObject({
                status: 'checking',
                line: 'Checking the products against the datapack',
            });
        });

        it('puts a stop before any type on Preparing Import, red, and Finishing not run', () => {
            const [preparing, finishing] = ends(
                source({
                    perType: states({ categories: 'error', products: 'error' }),
                    reason: 'The pack has no products.',
                })
            );

            expect(preparing).toMatchObject({
                status: 'error',
                problem: { text: 'The pack has no products.', failed: true },
            });
            expect(finishing).toMatchObject({ status: 'pending', line: 'Not run' });
        });

        it('calls Finishing Import not run when the job stopped on a type, and Preparing done', () => {
            const [preparing, finishing] = ends(
                source({
                    perType: states({ categories: 'success', products: 'error' }),
                    stoppedAt: 'products',
                    reason: 'Commerce did not respond.',
                })
            );

            expect(preparing).toMatchObject({ status: 'success', line: 'Done' });
            expect(finishing).toMatchObject({ status: 'pending', line: 'Not run' });
        });

        it('finishes when only the store settings failed: they fail without stopping the job', () => {
            const [, finishing] = ends(
                source({
                    dataTypes: ['products', 'store_config'],
                    perType: states({ products: 'success', store_config: 'error' }),
                    stoppedAt: 'store_config',
                    reason: 'Commerce refused one setting.',
                })
            );

            expect(finishing).toMatchObject({ status: 'success', line: 'Done' });
        });
    });

    it('CONTROL: a clean run is all done, with no problem', () => {
        const rows = typeRows(
            source({ perType: states({ categories: 'success', products: 'success' }) })
        );

        expect(rows.every((row) => row.status === 'success' && row.line === 'Done')).toBe(true);
        expect(rows.some((row) => row.problem)).toBe(false);
    });
});
