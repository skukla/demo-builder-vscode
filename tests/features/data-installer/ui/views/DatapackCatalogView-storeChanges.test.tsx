/**
 * DatapackCatalogView — "Save store changes to this pack" (datapack-engine step 05).
 *
 * Offered only in the flyout of the pack the open project holds, with Demo Builder's engine
 * chosen: that is the only pack whose store copy Demo Builder can read back. Pressing it starts
 * the save through the house progress window the VIEW hosts (as it hosts the import modal), so
 * the window is never a dialog inside the drawer.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';
import { CATALOG, DatapackCatalogView, INVENTORY_COMPLETE, mockPost, mockRequest } from './DatapackCatalogView.testUtils';

const LABEL = 'Save store changes to this pack';

/** The catalog, the detail of bodea@main, and the open project's recorded pack. */
function store(engine: 'demo-builder' | 'service', datapack: { name: string; version: string } | undefined) {
    mockRequest.mockImplementation((type: string) => {
        if (type === 'find-datapacks') {
            return Promise.resolve({ success: true, data: { items: CATALOG, count: CATALOG.length, total: CATALOG.length, engine } });
        }
        if (type === 'get-datapack-detail') {
            return Promise.resolve({ success: true, data: { detail: CATALOG[0], inventory: INVENTORY_COMPLETE } });
        }
        if (type === 'get-datapack-import-target') {
            return Promise.resolve({ success: true, data: { instance: 'inst', projectName: 'acme', datapack } });
        }
        return Promise.resolve({ success: true, data: null });
    });
}

async function openBodea(): Promise<void> {
    render(<DatapackCatalogView />);
    await settle();
    const cards = await screen.findAllByTestId('datapack-card');
    await press(cards[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveClass('open'));
    await screen.findByRole('button', { name: 'Import' });
}

beforeEach(() => {
    mockPost.mockClear();
});

describe('Save store changes to this pack', () => {
    it('is offered for the pack the project holds, and starts the save in the progress window', async () => {
        store('demo-builder', { name: 'bodea', version: 'main' });
        await openBodea();

        await press(screen.getByRole('button', { name: LABEL }));

        expect(mockPost).toHaveBeenCalledWith('save-store-changes-to-pack', {
            datapackName: 'bodea',
            version: 'main',
            // The flyout's own store, so the save reads the installed version's rows from there.
            source: 'installer',
            confirm: true,
            id: 'datapack-save',
            progress: 'modal',
        });
        expect(await screen.findByText('Saving store changes')).toBeInTheDocument();
    });

    it('is not offered for a pack the project does not hold', async () => {
        store('demo-builder', { name: 'wknd', version: 'main' });
        await openBodea();

        expect(screen.queryByRole('button', { name: LABEL })).not.toBeInTheDocument();
    });

    it('is not offered when the service engine is chosen, which keeps no record to read back', async () => {
        store('service', { name: 'bodea', version: 'main' });
        await openBodea();

        expect(screen.queryByRole('button', { name: LABEL })).not.toBeInTheDocument();
    });
});
