/**
 * ExportDatapackModal — capture a pack FROM the connected instance.
 *
 * The inverse of the import modal, and the differences are the whole design:
 *
 * - **The user NAMES the target.** An import writes into a Commerce instance; an
 *   export writes into a catalog 23 curated entries share. So name and version
 *   are typed, required, and never guessed.
 * - **`giftcards` cannot be exported.** It has an import processor and no export
 *   counterpart, so it is absent from the export type list rather than offered
 *   and silently skipped.
 * - **A failure carries its REASON.** The service returns an all-zero summary
 *   and no explanation unless `verbose` is sent; the client always sends it, and
 *   this modal renders what comes back. Anything less reproduces the silence
 *   that cost a day of investigation.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { change, press, settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';

// Below the mock on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ExportDatapackModal } from '@/features/data-installer/ui/components/ExportDatapackModal';

const mockRequest = webviewClient.request as jest.Mock;

/**
 * The export type catalog, as `list-datapack-data-types` really answers it.
 *
 * `dataTypes` is a STRING ARRAY — `getProcessorOrder` returns names. An earlier
 * fixture here used `[{dataType: '…'}]`, which matched the component's wrong
 * assumption and let an empty Data Types section ship. Caught only in the
 * Extension Dev Host.
 */
const EXPORT_TYPES = {
    mode: 'export',
    dataTypes: ['attribute_sets', 'categories'],
};

function withService(over: Record<string, unknown> = {}) {
    mockRequest.mockImplementation(async (type: string, payload?: Record<string, unknown>) => {
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
        if (type in over) return over[type];
        return { success: true, data: null };
    });
}

async function renderModal() {
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
function expectExportDisabled(disabled: boolean): void {
    expect(screen.getByRole('button', { name: /^export$/i })).toHaveAttribute(
        'aria-disabled',
        String(disabled)
    );
}

/** Fill the identity the export requires, then press Export. */
async function exportAs(name: string, version: string) {
    await change(screen.getByRole('textbox', { name: /datapack name/i }), name);
    await change(screen.getByRole('textbox', { name: /version/i }), version);
    await press(await screen.findByRole('checkbox', { name: 'Attribute sets' }));
    await press(screen.getByRole('button', { name: /^export$/i }));
}

beforeEach(() => {
    mockRequest.mockReset();
    withService();
});

describe('ExportDatapackModal', () => {
    it('offers the EXPORT type list, which is not the import one', async () => {
        await renderModal();

        await waitFor(() =>
            expect(screen.getByRole('checkbox', { name: 'Attribute sets' })).toBeInTheDocument()
        );
        const call = mockRequest.mock.calls.find((c) => c[0] === 'list-datapack-data-types');
        // `operationMode` is the handler's key; `mode` is refused.
        expect(call?.[1]).toMatchObject({ operationMode: 'export' });
    });

    /** Naming the target is the user's job — nothing here guesses it. */
    it('cannot export until a name, a version and a type are given', async () => {
        await renderModal();
        await screen.findByRole('checkbox', { name: 'Attribute sets' });

        expectExportDisabled(true);

        fireEvent.change(screen.getByRole('textbox', { name: /datapack name/i }), {
            target: { value: 'captured' },
        });
        expectExportDisabled(true);

        fireEvent.change(screen.getByRole('textbox', { name: /version/i }), {
            target: { value: 'v1' },
        });
        expectExportDisabled(true);

        fireEvent.click(screen.getByRole('checkbox', { name: 'Attribute sets' }));
        expectExportDisabled(false);
    });

    it('sends the typed identity and the chosen types', async () => {
        await renderModal();
        await screen.findByRole('checkbox', { name: 'Attribute sets' });

        await exportAs('captured-pack', 'v1');

        await waitFor(() => {
            const call = mockRequest.mock.calls.find((c) => c[0] === 'start-datapack-export');
            expect(call?.[1]).toMatchObject({
                datapackName: 'captured-pack',
                version: 'v1',
                dataTypes: ['attribute_sets'],
            });
        });
    });

    it('reports what each type captured', async () => {
        withService({
            'start-datapack-export': {
                success: true,
                data: {
                    success: true,
                    perType: [
                        { dataType: 'attribute_sets', success: true, exported: 8, excluded: 1 },
                    ],
                },
            },
        });
        await renderModal();
        await screen.findByRole('checkbox', { name: 'Attribute sets' });

        await exportAs('captured-pack', 'v1');

        expect(await screen.findByText(/Attribute sets/)).toBeInTheDocument();
        expect(await screen.findByText(/8/)).toBeInTheDocument();
    });

    /**
     * The failure this whole feature was built through. The reason must reach
     * the user — a bare "export failed" is what the service already says, and it
     * is what made this take a day to diagnose.
     */
    it('shows the per-type REASON when the service refuses to store', async () => {
        withService({
            'start-datapack-export': {
                success: true,
                data: {
                    success: false,
                    perType: [
                        {
                            dataType: 'attribute_sets',
                            success: false,
                            exported: 0,
                            excluded: 0,
                            reason: 'Failed to store exported data: MongoDB connection URI required.',
                        },
                    ],
                },
            },
        });
        await renderModal();
        await screen.findByRole('checkbox', { name: 'Attribute sets' });

        await exportAs('captured-pack', 'v1');

        expect(await screen.findByText(/MongoDB connection URI required/)).toBeInTheDocument();
    });

    it('surfaces a refusal that never reached the service', async () => {
        withService({
            'start-datapack-export': { success: false, error: 'Open a project before exporting.' },
        });
        await renderModal();
        await screen.findByRole('checkbox', { name: 'Attribute sets' });

        await exportAs('captured-pack', 'v1');

        expect(await screen.findByText(/open a project before exporting/i)).toBeInTheDocument();
    });

    it('offers Back from a result rather than stranding the user', async () => {
        withService({
            'start-datapack-export': {
                success: true,
                data: {
                    success: true,
                    perType: [
                        { dataType: 'attribute_sets', success: true, exported: 8, excluded: 0 },
                    ],
                },
            },
        });
        await renderModal();
        await screen.findByRole('checkbox', { name: 'Attribute sets' });

        await exportAs('captured-pack', 'v1');

        const back = await screen.findByRole('button', { name: /back/i });
        fireEvent.click(back);

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /^export$/i })).toBeInTheDocument()
        );
    });

    /**
     * The bug these pin, and why it is a divergence rather than a number.
     *
     * The export modal was built with its OWN copy of the type-list styles:
     * `.datapack-export-type-grid`, tracks of `minmax(420px, 1fr)`, sized back
     * when a type was a raw underscore code held on one unbroken line. The wide
     * modal's content box is about 685px, so auto-fill fits floor(685/420) = 1
     * track — eighteen exportable types stacked in a single scrolling column.
     *
     * The import list had already been fixed for exactly this (260px tracks, two
     * columns, a Select all beside the label) and the export copy could inherit
     * none of it, because nothing linked the two. So the fix is one shared grid,
     * and these are the tests that they cannot drift apart again.
     */
    describe('type list, shared with the import modal', () => {
        it('lays the types out in the shared grid, not a private copy', async () => {
            const { container } = await renderModal();
            await screen.findByRole('checkbox', { name: 'Attribute sets' });

            expect(container.querySelector('.datapack-type-grid')).toBeInTheDocument();
            expect(container.querySelector('.datapack-export-type-grid')).toBeNull();
        });

        it('offers Select all, the way the import list does', async () => {
            await renderModal();
            await screen.findByRole('checkbox', { name: 'Attribute sets' });

            fireEvent.click(screen.getByRole('button', { name: /select all/i }));

            expect(screen.getByRole('checkbox', { name: 'Attribute sets' })).toBeChecked();
            expect(screen.getByRole('checkbox', { name: 'Categories' })).toBeChecked();
        });

        it('turns into Clear all once everything is selected', async () => {
            await renderModal();
            await screen.findByRole('checkbox', { name: 'Attribute sets' });

            fireEvent.click(screen.getByRole('button', { name: /select all/i }));
            fireEvent.click(screen.getByRole('button', { name: /clear all/i }));

            expect(screen.getByRole('checkbox', { name: 'Attribute sets' })).not.toBeChecked();
            expect(screen.getByRole('checkbox', { name: 'Categories' })).not.toBeChecked();
        });

        /** Selecting all must send CODES — the labels are presentation only. */
        it('sends the codes it selected, never the names it showed', async () => {
            await renderModal();
            await screen.findByRole('checkbox', { name: 'Attribute sets' });

            fireEvent.click(screen.getByRole('button', { name: /select all/i }));
            fireEvent.change(screen.getByRole('textbox', { name: /datapack name/i }), {
                target: { value: 'captured-pack' },
            });
            fireEvent.change(screen.getByRole('textbox', { name: /version/i }), {
                target: { value: 'v1' },
            });
            fireEvent.click(screen.getByRole('button', { name: /^export$/i }));

            await waitFor(() => {
                const call = mockRequest.mock.calls.find((c) => c[0] === 'start-datapack-export');
                expect(call?.[1]).toMatchObject({
                    dataTypes: ['attribute_sets', 'categories'],
                });
            });
        });

        /** No list yet, nothing to act on — a bulk toggle over zero types is noise. */
        it('withholds Select all while the types are still loading', async () => {
            // Deliberately NOT `renderModal()`: that settles, and settling loads
            // the types — which is the exact state this test exists to rule out.
            // Bare render, assert the in-flight view, then settle at the end so
            // the response still commits inside act().
            render(<ExportDatapackModal onClose={jest.fn()} />);

            expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();

            await settle();
        });
    });

    /**
     * The section must never sit empty and unexplained — that is the silence
     * this whole feature was built through.
     */
    it('says why when the type list cannot be loaded', async () => {
        mockRequest.mockImplementation(async (type: string) =>
            type === 'list-datapack-data-types'
                ? { success: false, error: 'An operation mode is required.' }
                : { success: true, data: null }
        );
        render(<ExportDatapackModal onClose={jest.fn()} />);

        expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
});
