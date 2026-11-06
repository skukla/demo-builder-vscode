/**
 * An export's result: the title says how it went, and the lines what each type did.
 *
 * Moved here from the Create Datapack window's suite, which drove the Data Installer service's own
 * export, deleted on 2026-11-06 (DI-12). An ACO pack's outcome has the same shape and lands here.
 * A bare "export failed" is the silence that cost a day to diagnose, so the reason line is the point.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press } from '../../../../helpers/reactSettle';

// Below the mock import on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import {
    ExportDatapackResult,
    exportResult,
} from '@/features/data-installer/ui/components/ExportDatapackResult';

const mockRequest = webviewClient.request as jest.Mock;
const CAPTURED = { dataType: 'attribute_sets', success: true, exported: 8, excluded: 0 };
const REFUSED = {
    dataType: 'categories',
    success: false,
    exported: 0,
    excluded: 0,
    reason: 'the target was unreachable',
};
const PACK = { name: 'aco_acme', version: 'v1' };

function renderResult(
    perType: Array<typeof CAPTURED | typeof REFUSED>,
    success = true,
    savable: typeof PACK | null = null
) {
    render(
        <ExportDatapackResult
            result={exportResult({ success, perType })}
            savable={savable}
            source="library"
        />
    );
}

beforeEach(() => mockRequest.mockReset());

describe('the title', () => {
    // "3 of 3" and "1 of 3" have to be able to differ, or the headline is decoration.
    it('counts the types that captured, not the types that were tried', () => {
        expect(exportResult({ success: true, perType: [CAPTURED, REFUSED] }).title).toBe(
            'Exported 1 of 2 Data Types'
        );
    });

    // The summary can claim success while every row failed. The count reads the ROWS.
    it('reads zero when the summary says success and no row did', () => {
        expect(
            exportResult({ success: true, perType: [{ ...CAPTURED, success: false }, REFUSED] })
                .title
        ).toBe('Exported 0 of 2 Data Types');
    });

    it('survives a success that carries no per-type breakdown', () => {
        expect(exportResult({ success: true } as Parameters<typeof exportResult>[0])).toMatchObject(
            { title: 'Exported 0 of 0 Data Types', details: [] }
        );
    });

    it.each([
        ['every type went in', [CAPTURED], true, 'success'],
        ['some types did not', [CAPTURED, REFUSED], true, 'warning'],
        ['the export did not complete', [REFUSED], false, 'error'],
    ])('gives %s its status', (_when, rows, success, variant) => {
        expect(exportResult({ success, perType: rows }).variant).toBe(variant);
    });

    it('titles an export that could not run, with why as its message', () => {
        expect(exportResult(null, 'Open a project first.')).toEqual({
            variant: 'error',
            title: 'Export Failed',
            message: 'Open a project first.',
        });
    });
});

describe('the per-type lines', () => {
    it('writes large counts with separators', () => {
        renderResult([{ ...CAPTURED, exported: 1284, excluded: 1012 }]);

        expect(
            screen.getByText('Attribute Sets: 1,284 exported (1,012 left out)')
        ).toBeInTheDocument();
    });

    it('says which type failed and why', () => {
        renderResult([CAPTURED, REFUSED]);

        expect(
            screen.getByText('Categories failed: the target was unreachable')
        ).toBeInTheDocument();
    });

    // The control, and the reason the count is guarded: "0 left out" on every clean row is noise
    // that reads as a problem.
    it('says nothing about exclusions when there were none', () => {
        renderResult([CAPTURED]);

        expect(screen.getByText(/8 exported$/)).toBeInTheDocument();
        expect(screen.queryByText(/left out/)).not.toBeInTheDocument();
    });
});

describe('Save as File', () => {
    it('is offered once something was captured, from the store it went into', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { path: '/tmp/aco.zip' } });
        renderResult([CAPTURED], true, PACK);

        await press(screen.getByRole('button', { name: 'Save as File' }));

        expect(mockRequest.mock.calls.find((c) => c[0] === 'save-datapack-zip')?.[1]).toEqual({
            source: 'library',
            datapackName: 'aco_acme',
            version: 'v1',
        });
    });

    it('is not offered when nothing was captured', () => {
        renderResult([REFUSED], false, null);

        expect(screen.queryByRole('button', { name: 'Save as File' })).not.toBeInTheDocument();
    });
});
