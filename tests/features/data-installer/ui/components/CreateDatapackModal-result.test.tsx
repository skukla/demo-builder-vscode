/**
 * The export's result, after the screens.
 *
 * The service reports a failed export as an all-zero summary with no explanation unless `verbose` is
 * asked for. The client asks, so the explanation exists and this view is where it lands: a bare
 * "export failed" is the silence that cost a day to diagnose.
 */

import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press } from '../../../../helpers/reactSettle';
import { button, exportAnswer, exportAs, mockRequest, renderExport, withService } from './CreateDatapackModal.testUtils';
import { exportResult as exportResultContent } from '@/features/data-installer/ui/components/ExportDatapackResult';

const CAPTURED = { dataType: 'attribute_sets', success: true, exported: 8, excluded: 0 };
const REFUSED = { dataType: 'categories', success: false, exported: 0, excluded: 0, reason: 'the target was unreachable' };

async function runExport(over: Record<string, unknown>) {
    withService(over);
    await renderExport();
    await exportAs('captured-pack', 'v1');
}

beforeEach(() => {
    mockRequest.mockReset();
    withService();
});

describe('the headline count', () => {
    // "3 of 3" and "1 of 3" have to be able to differ, or the headline is decoration.
    it('counts the types that captured, not the types that were tried', async () => {
        await runExport(exportAnswer([CAPTURED, REFUSED]));

        expect(screen.getByRole('heading', { name: /Exported 1 of 2 Data Types/ })).toBeInTheDocument();
    });

    // The summary can claim success while every row failed. The count reads the ROWS.
    it('reads zero when the summary says success and no row did', async () => {
        await runExport(exportAnswer([{ ...CAPTURED, success: false }, REFUSED]));

        expect(screen.getByRole('heading', { name: /Exported 0 of 2 Data Types/ })).toBeInTheDocument();
    });

    it('survives a success that carries no per-type breakdown', async () => {
        await runExport({ 'start-datapack-export': { success: true, data: { success: true } } });

        expect(screen.getByRole('heading', { name: /Exported 0 of 0 Data Types/ })).toBeInTheDocument();
        expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
    });
});

describe('the outcome is the title', () => {
    it('titles the result, with the status icon before it, in place of the form title', async () => {
        await runExport(exportAnswer([CAPTURED]));

        const heading = screen.getByRole('heading', { name: /Exported 1 of 1 Data Types/ });
        expect(heading.querySelector('.text-positive')).not.toBeNull();
        expect(screen.queryByRole('heading', { name: 'Create Datapack' })).not.toBeInTheDocument();
    });

    it.each([
        ['every type went in', [CAPTURED], true, 'success'],
        ['some types did not', [CAPTURED, REFUSED], true, 'warning'],
        ['the export did not complete', [REFUSED], false, 'error'],
    ])('gives %s its status', (_when, rows, success, variant) => {
        expect(exportResultContent({ success, perType: rows }).variant).toBe(variant);
    });

    it('titles an export that could not run, with why in the body', async () => {
        await runExport({ 'start-datapack-export': { success: false, error: 'Open a project first.' } });

        expect(screen.getByRole('heading', { name: 'Export Failed' })).toBeInTheDocument();
        expect(screen.getByText('Open a project first.')).toBeInTheDocument();
    });

    it('goes Back to the name, under the form title, with Export on again', async () => {
        await runExport(exportAnswer([CAPTURED]));

        await press(button('Back'));

        expect(screen.getByRole('heading', { name: 'Create Datapack' })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: /datapack name/i })).toHaveValue('captured-pack');
        expect(button('Export')).toHaveAttribute('aria-disabled', 'false');
    });

    it('offers Save as File once something was captured, from where the service wrote it', async () => {
        await runExport(exportAnswer([CAPTURED]));

        await press(button('Save as File'));

        expect(mockRequest.mock.calls.find((c) => c[0] === 'save-datapack-zip')?.[1]).toEqual({
            source: 'installer',
            datapackName: 'captured-pack',
            version: 'v1',
        });
    });

    it('offers no Save as File when nothing was captured', async () => {
        await runExport(exportAnswer([REFUSED], false));

        expect(screen.queryByRole('button', { name: 'Save as File' })).not.toBeInTheDocument();
    });
});

describe('the per-type lines', () => {
    it('writes large counts with separators', async () => {
        await runExport(exportAnswer([{ ...CAPTURED, exported: 1284, excluded: 1012 }]));

        expect(screen.getByText('Attribute Sets: 1,284 exported (1,012 left out)')).toBeInTheDocument();
    });

    it('says which type failed and why', async () => {
        await runExport(exportAnswer([CAPTURED, REFUSED]));

        expect(screen.getByText('Categories failed: the target was unreachable')).toBeInTheDocument();
    });

    /** The failure this whole feature was built through. */
    it('shows the per-type REASON when the service refuses to store', async () => {
        await runExport(exportAnswer([{ ...REFUSED, dataType: 'attribute_sets', reason: 'Failed to store exported data: MongoDB connection URI required.' }], false));

        expect(screen.getByText(/MongoDB connection URI required/)).toBeInTheDocument();
    });

    // The control, and the reason the count is guarded: "0 left out" on every clean row is noise
    // that reads as a problem.
    it('says nothing about exclusions when there were none', async () => {
        await runExport(exportAnswer([CAPTURED]));

        expect(screen.getByText(/8 exported$/)).toBeInTheDocument();
        expect(screen.queryByText(/left out/)).not.toBeInTheDocument();
    });
});
