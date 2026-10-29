/**
 * DatapackCatalogView — Rename in the pack flyout (datapack-engine step 07). The view sends
 * `rename-library-datapack` with confirm (the inline field is the confirmation), then reads the
 * catalog and the pack again, so the card and the flyout both show the new name. A refusal stays
 * in the field, inline.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';
import { DatapackCatalogView, INVENTORY_COMPLETE, makeSummary, mockRequest } from './DatapackCatalogView.testUtils';

const MINE = makeSummary('acme-1a2b3c', '20261029-183005', { displayName: 'Acme Demo', store: 'library', mine: true, shared: false });

function answer(rename: { success: boolean; error?: string }) {
    mockRequest.mockImplementation((type: string) => {
        if (type === 'find-datapacks') return Promise.resolve({ success: true, data: { items: [MINE], count: 1, engine: 'demo-builder' } });
        if (type === 'get-datapack-detail') return Promise.resolve({ success: true, data: { detail: MINE, inventory: INVENTORY_COMPLETE } });
        if (type === 'rename-library-datapack') return Promise.resolve(rename);
        return Promise.resolve({ success: true, data: null });
    });
}

async function renameTo(name: string): Promise<void> {
    render(<DatapackCatalogView />);
    await settle();
    await press((await screen.findAllByTestId('datapack-card'))[0]);
    await press(await screen.findByRole('button', { name: 'Rename Acme Demo' }));
    const input = screen.getByRole('textbox', { name: 'New datapack name' });
    fireEvent.change(input, { target: { value: name } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await settle();
}

const calls = (type: string) => mockRequest.mock.calls.filter((c) => c[0] === type);

it('renames the pack with confirm, then reads the catalog and the pack again', async () => {
    answer({ success: true });
    await renameTo('Acme Q4');

    expect(calls('rename-library-datapack').map((c) => c[1])).toEqual([
        { datapackName: 'acme-1a2b3c', displayName: 'Acme Q4', confirm: true },
    ]);
    await waitFor(() => expect(calls('find-datapacks').length).toBeGreaterThan(1));
    expect(calls('get-datapack-detail').length).toBeGreaterThan(1);
});

it('keeps the field open with the reason when the library refuses', async () => {
    answer({ success: false, error: 'The datapack library has no pack of yours named acme-1a2b3c.' });
    await renameTo('Acme Q4');

    expect(await screen.findByText('The datapack library has no pack of yours named acme-1a2b3c.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'New datapack name' })).toBeInTheDocument();
});
