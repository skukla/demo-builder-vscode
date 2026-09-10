/**
 * ExportDatapackModal — the result view.
 *
 * The service reports a failed export as an all-zero summary with no
 * explanation unless `verbose` is asked for. The client asks, so the
 * explanation exists and this view is where it lands — a bare "export failed"
 * is the silence that cost a day to diagnose.
 *
 * Mocks and helpers live in `ExportDatapackModal.testUtils.tsx`.
 */

import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
    exportAs,
    exportResult,
    mockRequest,
    renderModal,
    withService,
} from './ExportDatapackModal.testUtils';

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

describe('ExportDatapackModal — the headline count', () => {
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

describe('ExportDatapackModal — the per-type lines', () => {
    it('names what the service excluded, when it excluded anything', async () => {
        await runExport(exportResult([{ ...CAPTURED, exported: 8, excluded: 3 }]));

        expect(
            await screen.findByText(/8 exported \(3 excluded by the service\)/)
        ).toBeInTheDocument();
    });

    // The control, and the reason the count is guarded: "0 excluded by the
    // service" on every clean row is noise that reads as a problem.
    it('says nothing about exclusions when there were none', async () => {
        await runExport(exportResult([CAPTURED]));

        expect(await screen.findByText(/8 exported$/)).toBeInTheDocument();
        expect(screen.queryByText(/excluded by the service/)).not.toBeInTheDocument();
    });
});
