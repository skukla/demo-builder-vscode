/**
 * runStage — what a single-project datapack run is doing now, as the centred lines say it (owner,
 * 2026-11-16: one project is the wizard's centred view, moving from step to step; several projects
 * are rows).
 */

import { runStage } from '@/core/utils/runStage';
import type { OperationRow } from '@/types/webviewPayloads';

const step = (over: Partial<OperationRow>): OperationRow => ({
    kind: 'install',
    label: 'Install Frescopa, main',
    status: 'pending',
    ...over,
});

describe('runStage', () => {
    it('names the data type being installed and its count', () => {
        const steps = [
            step({
                status: 'checking',
                types: [
                    { kind: 'categories', label: 'Categories', status: 'success' },
                    {
                        kind: 'products',
                        label: 'Products',
                        status: 'checking',
                        line: 'Installing 1,200 of 2,046',
                    },
                ],
            }),
            step({ kind: 'finishing', label: 'Verify Installation', line: 'Waiting' }),
        ];

        expect(runStage(steps)).toEqual({ label: 'Installing Products', detail: '1,200 of 2,046' });
    });

    it('says the type alone before it gives a count, and an update says Updating', () => {
        const types = [
            {
                kind: 'categories',
                label: 'Categories',
                status: 'checking' as const,
                line: 'Updating',
            },
        ];

        expect(runStage([step({ status: 'checking', types })])).toEqual({
            label: 'Updating Categories',
        });
    });

    it('keeps a phrase that names its own work, as linking options does', () => {
        const types = [
            {
                kind: 'products',
                label: 'Products',
                status: 'checking' as const,
                line: 'Linking product options 2,044 of 2,046',
            },
        ];

        expect(runStage([step({ status: 'checking', types })])).toEqual({
            label: 'Linking product options',
            detail: '2,044 of 2,046',
        });
    });

    it('moves on to the next step as one ends: an uninstall before the install, then verifying', () => {
        const uninstalling = [
            step({
                kind: 'replacing',
                label: 'Uninstall Luma',
                status: 'checking',
                line: 'Uninstalling Products, 40 of 2,046',
            }),
            step({ line: 'Waiting' }),
        ];
        const verifying = [
            step({ status: 'success' }),
            step({
                kind: 'finishing',
                label: 'Verify Installation',
                status: 'checking',
                line: 'Checking the products',
            }),
        ];

        expect(runStage(uninstalling)).toEqual({
            label: 'Uninstalling Products',
            detail: '40 of 2,046',
        });
        expect(runStage(verifying)).toEqual({ label: 'Checking the products' });
    });

    // A flat run's rows (a save's data types, Clear Demo Data's parts) often say only the verb or the
    // count, the row's name saying what.
    it('gives a line that is only a verb or a count, or no line, the row\'s name', () => {
        const row = (line?: string): OperationRow => ({ kind: 'products', label: 'Products', status: 'checking', ...(line ? { line } : {}) });

        expect(runStage([row('Exporting')])).toEqual({ label: 'Exporting Products' });
        expect(runStage([row('40 of 120')])).toEqual({ label: 'Products', detail: '40 of 120' });
        expect(runStage([row()])).toEqual({ label: 'Products' });
    });

    it('says Starting before any step is under way', () => {
        expect(runStage([step({ line: 'Waiting' })])).toEqual({ label: 'Starting' });
    });
});
