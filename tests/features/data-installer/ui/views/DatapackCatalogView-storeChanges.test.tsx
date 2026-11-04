/**
 * DatapackCatalogView — the demo's datapack, pinned above the catalog, and Save / Save As from it
 * (`ProjectPackSection`, owner 2026-11-03, `.rptc/plans/datapack-save-as/`).
 *
 * Save appears only for a pack that is the SC's own; Save As always, with Demo Builder's engine,
 * which is the one that can read the store back. Each opens the pick screens, whose last button
 * starts the save through the house progress window the VIEW hosts, so neither is a dialog inside
 * the drawer.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';
import { CATALOG, DatapackCatalogView, makeSummary, mockPost, mockRequest } from './DatapackCatalogView.testUtils';

/** Bodea as the SC's own library pack, in place of the team's. */
const MINE = [makeSummary('bodea', 'main', { displayName: 'Acme Bodea', store: 'library', mine: true }), ...CATALOG.slice(2)];

/** The catalog, and the open project's recorded pack; the pick screens answer with nothing to pick. */
function store(engine: 'demo-builder' | 'service', datapack: { name: string; version: string; store?: 'library' | 'installer' } | undefined, items = CATALOG) {
    mockRequest.mockImplementation((type: string) => {
        if (type === 'find-datapacks') return Promise.resolve({ success: true, data: { items, count: items.length, total: items.length, engine } });
        if (type === 'get-datapack-import-target') return Promise.resolve({ success: true, data: { instance: 'inst', projectName: 'acme', datapack } });
        if (type === 'list-datapack-export-items') return Promise.resolve({ success: true, data: { items: [], totalCount: 0, excludedCount: 0, inPackCount: 0 } });
        return Promise.resolve({ success: true, data: null });
    });
}

async function renderView(): Promise<void> {
    render(<DatapackCatalogView />);
    await settle();
    await screen.findAllByTestId('datapack-card');
}

const section = () => screen.queryByRole('region', { name: "This Demo's Datapack" });

beforeEach(() => {
    mockPost.mockClear();
});

describe("the demo's datapack", () => {
    it("pins the pack the project uses above the catalog, offering Save As only when it is not the SC's", async () => {
        store('demo-builder', { name: 'bodea', version: 'main' });
        await renderView();

        expect(section()).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save As' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Save Bodea/ })).not.toBeInTheDocument();
    });

    it('Save As asks the new name, starting from the pack\'s, then saves under it', async () => {
        store('demo-builder', { name: 'bodea', version: 'main' });
        await renderView();

        await press(screen.getByRole('button', { name: 'Save As' }));
        expect(await screen.findByRole('heading', { name: 'Save As New Datapack' })).toBeInTheDocument();
        const name = screen.getByRole('textbox', { name: /Datapack Name/ });
        expect(name).toHaveValue('bodea Copy');
        fireEvent.change(name, { target: { value: 'My Bodea' } });
        await press(screen.getByRole('button', { name: 'Continue' }));
        await settle();
        await press(screen.getByRole('button', { name: 'Create' }));

        expect(mockPost).toHaveBeenCalledWith('save-store-changes-to-pack', {
            datapackName: 'bodea',
            version: 'main',
            source: 'installer',
            saveAs: { displayName: 'My Bodea' },
            confirm: true,
            id: 'datapack-save',
            progress: 'modal',
        });
        expect(await screen.findByText('Creating My Bodea')).toBeInTheDocument();
    });

    it("offers Save, named for the pack, when it is the SC's own, and saves into it with no name", async () => {
        store('demo-builder', { name: 'bodea', version: 'main', store: 'library' }, MINE);
        await renderView();

        await press(screen.getByRole('button', { name: 'Save Acme Bodea' }));
        expect(await screen.findByRole('heading', { name: 'Save Acme Bodea' })).toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Save' }));

        expect(mockPost).toHaveBeenCalledWith('save-store-changes-to-pack', {
            datapackName: 'bodea',
            version: 'main',
            source: 'library',
            confirm: true,
            id: 'datapack-save',
            progress: 'modal',
        });
        expect(await screen.findByText('Saving Acme Bodea')).toBeInTheDocument();
    });

    it('offers Create Datapack on a demo with no pack yet', async () => {
        store('demo-builder', undefined);
        await renderView();

        expect(section()).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create Datapack' })).toBeInTheDocument();
    });

    it('offers no save with the service engine, which keeps no record to read back', async () => {
        store('service', { name: 'bodea', version: 'main' });
        await renderView();

        // CONTROL: the demo's pack is still shown.
        expect(section()).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save As' })).not.toBeInTheDocument();
    });
});
