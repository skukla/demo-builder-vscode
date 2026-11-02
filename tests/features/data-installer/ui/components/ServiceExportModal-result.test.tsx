/**
 * ServiceExportModal — the result view.
 *
 * The service reports a failed export as an all-zero summary with no
 * explanation unless `verbose` is asked for. The client asks, so the
 * explanation exists and this view is where it lands — a bare "export failed"
 * is the silence that cost a day to diagnose.
 *
 * Mocks and helpers live in `ServiceExportModal.testUtils.tsx`.
 */

import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press } from '../../../../helpers/reactSettle';

import {
    exportAs,
    exportResult,
    mockRequest,
    renderModal,
    withService,
} from './ServiceExportModal.testUtils';
import { exportResult as exportResultContent } from '@/features/data-installer/ui/components/ExportDatapackResult';

const CAPTURED = { dataType: 'attribute_sets', success: true, exported: 8, excluded: 0 };
const REFUSED = {
    dataType: 'categories',
    success: false,
    exported: 0,
    excluded: 0,
    reason: 'the target was unreachable',
};

async function runExport(over: Record<string, unknown>) {
    withService(over);
    await renderModal();
    await screen.findByRole('checkbox', { name: 'Attribute sets' });
    await exportAs('captured-pack', 'v1');
}

beforeEach(() => {
    mockRequest.mockReset();
    withService();
});

describe('ServiceExportModal — the headline count', () => {
    // "3 of 3" and "1 of 3" have to be able to differ, or the headline is
    // decoration. Only the rows that SUCCEEDED are counted.
    it('counts the types that captured, not the types that were tried', async () => {
        await runExport(exportResult([CAPTURED, REFUSED]));

        expect(await screen.findByText(/Exported 1 of 2 data types/)).toBeInTheDocument();
    });

    // The summary can claim success while every row failed. The count reads the
    // ROWS, so it says zero rather than agreeing with the summary.
    it('reads zero when the summary says success and no row did', async () => {
        await runExport(exportResult([{ ...CAPTURED, success: false }, REFUSED]));

        expect(await screen.findByText(/Exported 0 of 2 data types/)).toBeInTheDocument();
    });

    // A success carrying no perType at all — the count is over an empty list, and
    // the detail lines have to be genuinely absent rather than a placeholder row.
    it('survives a success that carries no per-type breakdown', async () => {
        withService({ 'start-datapack-export': { success: true, data: { success: true } } });
        await renderModal();
        await screen.findByRole('checkbox', { name: 'Attribute sets' });
        await exportAs('captured-pack', 'v1');

        expect(await screen.findByText(/Exported 0 of 0 data types/)).toBeInTheDocument();
        expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
    });
});

describe('ServiceExportModal — the outcome is the title', () => {
    it('titles the result, with the status icon before it, in place of the form title', async () => {
        await runExport(exportResult([CAPTURED]));

        const heading = await screen.findByRole('heading', { name: /Exported 1 of 1 data types/ });
        expect(heading.querySelector('.text-green-600')).not.toBeNull();
        expect(screen.queryByRole('heading', { name: 'Export a datapack' })).not.toBeInTheDocument();
    });

    it.each([
        ['every type went in', [CAPTURED], true, 'success'],
        ['some types did not', [CAPTURED, REFUSED], true, 'warning'],
        ['the export did not complete', [REFUSED], false, 'error'],
    ])('gives %s its status', (_when, rows, success, variant) => {
        expect(exportResultContent({ success, perType: rows }).variant).toBe(variant);
    });

    it('titles an export that could not run, with why in the body', async () => {
        withService({ 'start-datapack-export': { success: false, error: 'Open a project first.' } });
        await renderModal();
        await screen.findByRole('checkbox', { name: 'Attribute sets' });
        await exportAs('captured-pack', 'v1');

        expect(await screen.findByRole('heading', { name: 'The export could not run' })).toBeInTheDocument();
        expect(screen.getByText('Open a project first.')).toBeInTheDocument();
    });

    it('goes Back to the form, with the form title', async () => {
        await runExport(exportResult([CAPTURED]));
        await press(await screen.findByRole('button', { name: 'Back' }));

        expect(screen.getByRole('heading', { name: 'Export a datapack' })).toBeInTheDocument();
    });
});

describe('ServiceExportModal — the per-type lines', () => {
    it('writes large counts with separators', async () => {
        await runExport(exportResult([{ ...CAPTURED, exported: 1284, excluded: 1012 }]));

        expect(await screen.findByText('Attribute sets: 1,284 exported (1,012 left out)')).toBeInTheDocument();
    });

    it('says which type failed and why', async () => {
        await runExport(exportResult([CAPTURED, REFUSED]));

        expect(await screen.findByText('Categories failed: the target was unreachable')).toBeInTheDocument();
    });

    it('names what the service excluded, when it excluded anything', async () => {
        await runExport(exportResult([{ ...CAPTURED, exported: 8, excluded: 3 }]));

        expect(
            await screen.findByText(/8 exported \(3 left out\)/)
        ).toBeInTheDocument();
    });

    // The control, and the reason the count is guarded: "0 excluded by the
    // service" on every clean row is noise that reads as a problem.
    it('says nothing about exclusions when there were none', async () => {
        await runExport(exportResult([CAPTURED]));

        expect(await screen.findByText(/8 exported$/)).toBeInTheDocument();
        expect(screen.queryByText(/left out/)).not.toBeInTheDocument();
    });
});
