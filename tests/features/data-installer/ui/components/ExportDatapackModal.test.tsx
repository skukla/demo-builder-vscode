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

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn() },
}));

// Below the mock on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ExportDatapackModal } from '@/features/data-installer/ui/components/ExportDatapackModal';

const mockRequest = webviewClient.request as jest.Mock;

/** The export type catalog, as `list-datapack-data-types` answers it. */
const EXPORT_TYPES = {
    mode: 'export',
    dataTypes: [{ dataType: 'attribute_sets' }, { dataType: 'categories' }],
};

function withService(over: Record<string, unknown> = {}) {
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'list-datapack-data-types') return { success: true, data: EXPORT_TYPES };
        if (type === 'get-datapack-import-target') {
            return { success: true, data: { instance: 'inst-1', projectName: 'demo-1' } };
        }
        if (type in over) return over[type];
        return { success: true, data: null };
    });
}

function renderModal() {
    return render(<ExportDatapackModal onClose={jest.fn()} />);
}

/**
 * The house Modal renders its action buttons as `div role="button"` with
 * `aria-disabled`, not native `<button disabled>` — so assert the attribute.
 */
function expectExportDisabled(disabled: boolean): void {
    expect(screen.getByRole('button', { name: /^export$/i })).toHaveAttribute(
        'aria-disabled',
        String(disabled),
    );
}

/** Fill the identity the export requires, then press Export. */
async function exportAs(name: string, version: string) {
    fireEvent.change(screen.getByRole('textbox', { name: /datapack name/i }), { target: { value: name } });
    fireEvent.change(screen.getByRole('textbox', { name: /version/i }), { target: { value: version } });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'attribute_sets' }));
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));
}

beforeEach(() => {
    mockRequest.mockReset();
    withService();
});

describe('ExportDatapackModal', () => {
    it('offers the EXPORT type list, which is not the import one', async () => {
        renderModal();

        await waitFor(() =>
            expect(screen.getByRole('checkbox', { name: 'attribute_sets' })).toBeInTheDocument(),
        );
        const call = mockRequest.mock.calls.find((c) => c[0] === 'list-datapack-data-types');
        expect(call?.[1]).toMatchObject({ mode: 'export' });
    });

    /** Naming the target is the user's job — nothing here guesses it. */
    it('cannot export until a name, a version and a type are given', async () => {
        renderModal();
        await screen.findByRole('checkbox', { name: 'attribute_sets' });

        expectExportDisabled(true);

        fireEvent.change(screen.getByRole('textbox', { name: /datapack name/i }), { target: { value: 'captured' } });
        expectExportDisabled(true);

        fireEvent.change(screen.getByRole('textbox', { name: /version/i }), { target: { value: 'v1' } });
        expectExportDisabled(true);

        fireEvent.click(screen.getByRole('checkbox', { name: 'attribute_sets' }));
        expectExportDisabled(false);
    });

    it('sends the typed identity and the chosen types', async () => {
        renderModal();
        await screen.findByRole('checkbox', { name: 'attribute_sets' });

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
        renderModal();
        await screen.findByRole('checkbox', { name: 'attribute_sets' });

        await exportAs('captured-pack', 'v1');

        expect(await screen.findByText(/attribute_sets/)).toBeInTheDocument();
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
        renderModal();
        await screen.findByRole('checkbox', { name: 'attribute_sets' });

        await exportAs('captured-pack', 'v1');

        expect(await screen.findByText(/MongoDB connection URI required/)).toBeInTheDocument();
    });

    it('surfaces a refusal that never reached the service', async () => {
        withService({
            'start-datapack-export': { success: false, error: 'Open a project before exporting.' },
        });
        renderModal();
        await screen.findByRole('checkbox', { name: 'attribute_sets' });

        await exportAs('captured-pack', 'v1');

        expect(await screen.findByText(/open a project before exporting/i)).toBeInTheDocument();
    });

    it('offers Back from a result rather than stranding the user', async () => {
        withService({
            'start-datapack-export': {
                success: true,
                data: { success: true, perType: [{ dataType: 'attribute_sets', success: true, exported: 8, excluded: 0 }] },
            },
        });
        renderModal();
        await screen.findByRole('checkbox', { name: 'attribute_sets' });

        await exportAs('captured-pack', 'v1');

        const back = await screen.findByRole('button', { name: /back/i });
        fireEvent.click(back);

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /^export$/i })).toBeInTheDocument(),
        );
    });
});
