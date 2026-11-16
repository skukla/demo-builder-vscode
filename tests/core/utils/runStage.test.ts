/**
 * runStage — what a run on one project is doing now, as the centred lines say it (owner, 2026-11-16:
 * "one main message, and each data type a second line"): line 1 the step's job, line 2 the part under
 * way and how far.
 */

import { gerundJob, rowsLines, runStage, type StepJob } from '@/core/utils/runStage';
import type { OperationRow } from '@/types/webviewPayloads';

const step = (over: Partial<OperationRow>): OperationRow => ({ kind: 'install', label: 'Install Frescopa, main', status: 'pending', ...over });

/** The datapack window's jobs, by step. */
const JOBS: StepJob = (s) =>
    ({ install: 'Installing in Commerce', uninstall: 'Uninstalling from Commerce', replacing: 'Uninstalling from Commerce', finishing: 'Verifying Installation' } as Record<string, string>)[s.kind];

describe('runStage', () => {
    it('says the job on line 1 and the data type under way with its count on line 2', () => {
        const steps = [
            step({
                status: 'checking',
                types: [
                    { kind: 'categories', label: 'Categories', status: 'success' },
                    { kind: 'products', label: 'Products', status: 'checking', line: 'Installing 1,200 of 2,046' },
                ],
            }),
            step({ kind: 'finishing', label: 'Verify Installation', line: 'Waiting' }),
        ];

        expect(runStage(steps, JOBS)).toEqual({ label: 'Installing in Commerce', detail: 'Products, 1,200 of 2,046' });
    });

    it('names the type alone before it has a count', () => {
        const types = [{ kind: 'categories', label: 'Categories', status: 'checking' as const, line: 'Installing' }];

        expect(runStage([step({ status: 'checking', types })], JOBS)).toEqual({ label: 'Installing in Commerce', detail: 'Categories' });
    });

    it('keeps a phrase of the type\'s own after its name, as linking options does', () => {
        const types = [{ kind: 'products', label: 'Products', status: 'checking' as const, line: 'Linking product options 2,044 of 2,046' }];

        expect(runStage([step({ status: 'checking', types })], JOBS)).toEqual({
            label: 'Installing in Commerce',
            detail: 'Products: linking product options, 2,044 of 2,046',
        });
    });

    it('drops from line 2 the verb line 1 already says: an uninstall\'s type and count', () => {
        const steps = [step({ kind: 'uninstall', label: 'Uninstall Frescopa', status: 'checking', line: 'Uninstalling Products, 12 of 25' })];

        expect(runStage(steps, JOBS)).toEqual({ label: 'Uninstalling from Commerce', detail: 'Products, 12 of 25' });
    });

    it('keeps a step line that says something else, under the same line 1', () => {
        const preparing = [step({ kind: 'uninstall', label: 'Uninstall Frescopa', status: 'checking', line: 'Preparing to uninstall' })];
        const verifying = [step({ status: 'success' }), step({ kind: 'finishing', label: 'Verify Installation', status: 'checking', line: 'Checking the products' })];

        expect(runStage(preparing, JOBS)).toEqual({ label: 'Uninstalling from Commerce', detail: 'Preparing to uninstall' });
        expect(runStage(verifying, JOBS)).toEqual({ label: 'Verifying Installation', detail: 'Checking the products' });
    });

    it('uses the step\'s own label when the host names no job, and its line on line 2', () => {
        const row: OperationRow = { kind: 'products', label: 'Products', status: 'checking', line: '40 of 120' };

        expect(runStage([row])).toEqual({ label: 'Products', detail: '40 of 120' });
    });

    it('keeps the verb when no name follows it: a save says where it is saving', () => {
        const steps = [step({ kind: 'save', label: 'Save Your Changes', status: 'checking', line: 'Saving to the library' })];

        expect(runStage(steps, () => 'Saving Your Changes')).toEqual({ label: 'Saving Your Changes', detail: 'Saving to the library' });
    });

    it('says Starting before any step is under way', () => {
        expect(runStage([step({ line: 'Waiting' })], JOBS)).toEqual({ label: 'Starting' });
    });
});

// Owner walk, 2026-11-16: a datapack save read "Reading from Commerce / Reading your selection", then
// "Starting", then "Saving to My Datapacks" with nothing under it. The shared progress window's lines
// come from the steps' own verbs.
describe('rowsLines, the shared progress window', () => {
    const exporting = (types: OperationRow[], line = '0 of 1 data type'): OperationRow => ({ kind: 'export', label: 'Export from Commerce', status: 'checking', line, types });
    const save = (over: Partial<OperationRow> = {}): OperationRow => ({ kind: 'save', label: 'Save Release Save Test', status: 'pending', line: 'Waiting', ...over });

    it('says the export as its job, and the data type under way with its count on line 2', () => {
        const rows = [exporting([{ kind: 'categories', label: 'Categories', status: 'checking', line: '1 of 1' }]), save()];

        expect(rowsLines(rows, 'Reading from Commerce')).toEqual({ label: 'Exporting from Commerce', detail: 'Categories, 1 of 1' });
    });

    it('puts a step line that already says its job first, and what it acts on under it', () => {
        const rows = [{ ...exporting([]), status: 'success' as const, line: 'Exported' }, save({ status: 'checking', line: 'Saving to My Datapacks' })];

        expect(rowsLines(rows, 'Saving the datapack')).toEqual({ label: 'Saving to My Datapacks', detail: 'Release Save Test' });
    });

    it('takes the run\'s stage for a step whose label has no verb it knows, and when no step is under way', () => {
        const unknown: OperationRow = { kind: 'products', label: 'Products', status: 'checking', line: '40 of 120' };

        expect(rowsLines([unknown], 'Clearing demo data')).toEqual({ label: 'Clearing demo data', detail: '40 of 120' });
        expect(rowsLines([save()], 'Saving the datapack')).toEqual({ label: 'Saving the datapack' });
    });

    it('says a step\'s job from its verb: Export, Save, Uninstall', () => {
        expect(gerundJob('Export from Commerce')).toBe('Exporting from Commerce');
        expect(gerundJob('Uninstall My Luma')).toBe('Uninstalling My Luma');
        expect(gerundJob('Products')).toBeUndefined();
    });
});
