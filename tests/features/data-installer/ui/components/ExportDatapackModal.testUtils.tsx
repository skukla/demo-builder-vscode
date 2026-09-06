/**
 * Shared harness for the `ExportDatapackModal` suite family.
 *
 * THIS FILE OWNS THE MOCK WALL AND THE SUT IMPORT — `jest.mock` hoists above the
 * imports of the module it appears in, not across modules, so a spec that
 * imported the modal itself could bind to an unmocked client.
 *
 * Split from the single suite on 2026-09-05, when closing the modal's mutation
 * gaps took it past the 750-line CI limit.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';

import { change, press, settle } from '../../../../helpers/reactSettle';

// Below the wall on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ExportDatapackModal } from '@/features/data-installer/ui/components/ExportDatapackModal';

export { ExportDatapackModal };
export const mockRequest = webviewClient.request as jest.Mock;

/**
 * The export type catalog, as `list-datapack-data-types` really answers it.
 *
 * `dataTypes` is a STRING ARRAY — `getProcessorOrder` returns names. An earlier
 * fixture here used `[{dataType: '…'}]`, which matched the component's wrong
 * assumption and let an empty Data Types section ship. Caught only in the
 * Extension Dev Host.
 */
export const EXPORT_TYPES = {
    mode: 'export',
    dataTypes: ['attribute_sets', 'categories'],
};

export function withService(over: Record<string, unknown> = {}) {
    mockRequest.mockImplementation(async (type: string, payload?: Record<string, unknown>) => {
        if (type in over) return over[type];
        if (type === 'list-datapack-data-types') {
            // HONOURS the payload, exactly as the handler does. A mock that
            // answers regardless of the key let `mode` instead of
            // `operationMode` ship — the section rendered empty in the Dev Host
            // while all seven tests passed.
            return payload?.operationMode
                ? { success: true, data: EXPORT_TYPES }
                : {
                      success: false,
                      error: 'An operation mode is required (import, export, delete or validate).',
                  };
        }
        if (type === 'get-datapack-import-target') {
            return { success: true, data: { instance: 'inst-1', projectName: 'demo-1' } };
        }
        return { success: true, data: null };
    });
}

export async function renderModal() {
    const result = render(<ExportDatapackModal onClose={jest.fn()} />);
    // Mount effects fire requests; settle so their responses commit inside act()
    // rather than in the next query's wait loop (tests/helpers/reactSettle.ts).
    await settle();
    return result;
}

/**
 * The house Modal renders its action buttons as `div role="button"` with
 * `aria-disabled`, not native `<button disabled>` — so assert the attribute.
 */
export function expectExportDisabled(disabled: boolean): void {
    expect(screen.getByRole('button', { name: /^export$/i })).toHaveAttribute(
        'aria-disabled',
        String(disabled)
    );
}

/** Fill the identity the export requires, then press Export. */
export async function exportAs(name: string, version: string) {
    await change(screen.getByRole('textbox', { name: /datapack name/i }), name);
    await change(screen.getByRole('textbox', { name: /version/i }), version);
    await press(await screen.findByRole('checkbox', { name: 'Attribute sets' }));
    await press(screen.getByRole('button', { name: /^export$/i }));
}

/** The payload `start-datapack-export` was called with, or undefined. */
export function exportCall(): Record<string, unknown> | undefined {
    return mockRequest.mock.calls.find((c) => c[0] === 'start-datapack-export')?.[1];
}

/** A successful export envelope carrying `perType` verbatim. */
export function exportResult(perType: unknown[], success = true) {
    return { 'start-datapack-export': { success: true, data: { success, perType } } };
}
