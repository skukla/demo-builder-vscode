/**
 * The flyout's actions (owner, 2026-10-30): Import is the one button on view; everything else is
 * in the house kebab (`CardActionsMenu`): Save as file, Save store changes to this pack, Share or
 * Stop sharing, and Remove from library in its own section at the bottom. Every action keeps the
 * conditions and confirmations it had as a button: Share and Remove only on the SC's own library
 * pack, Share asks with the owner's sentence, Remove asks only when the pack was shared in a
 * project file, and a library pack offers Copy to the Data Installer with the service's engine.
 *
 * Moved here from DatapackDetailPanel.test.tsx with the actions, from buttons to menu rows.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mocks on purpose: they hoist above these imports.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { DatapackDetail } from '@/features/data-installer/types';
import { PackActions } from '@/features/data-installer/ui/components/PackActions';
import { SHARE_CONSENT } from '@/features/data-installer/shareWording';

const mockRequest = webviewClient.request as jest.Mock;

function makeDetail(overrides: Partial<DatapackDetail> = {}): DatapackDetail {
    return {
        id: { name: 'bodea', version: 'main' },
        displayName: 'Bodea',
        shared: true,
        dataTypes: ['categories', 'products'],
        art: {},
        ...overrides,
    };
}

const LIBRARY = makeDetail({ store: 'library', shared: false });
const OWN = makeDetail({ store: 'library', mine: true, shared: false });
const WARNING = "You shared this pack in a project file on 27 October. Anyone who hasn't created that project yet will get bodea instead.";

function renderActions(over: Partial<React.ComponentProps<typeof PackActions>> = {}) {
    const props = {
        detail: makeDetail(),
        onImport: jest.fn(),
        onRemoved: jest.fn(),
        installsFromLibrary: false,
        ...over,
    };
    render(<PackActions {...props} />);
    return props;
}

const menuLabels = () => screen.getAllByRole('menuitem').map((row) => row.textContent);
const row = (name: string) => screen.getByRole('menuitem', { name });

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: null });
});

describe('a Data Installer pack', () => {
    it('shows Import as the one button, and Save as File in the menu; never Share or Remove', async () => {
        const props = renderActions({ detail: makeDetail({ mine: true }) });

        expect(screen.getByRole('button', { name: 'More actions for Bodea' })).toBeInTheDocument();
        expect(menuLabels()).toEqual(['Save as File']);
        expect(screen.queryByRole('button', { name: 'Save as File' })).not.toBeInTheDocument();

        await press(screen.getByRole('button', { name: 'Import' }));
        expect(props.onImport).toHaveBeenCalledWith({ name: 'bodea', version: 'main' });
    });

    it('saves as a file from the Data Installer, and says where it went', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { path: '/tmp/bodea.zip' } });
        renderActions();

        await press(row('Save as File'));

        expect(mockRequest).toHaveBeenCalledWith('save-datapack-zip', { source: 'installer', datapackName: 'bodea', version: 'main' }, undefined);
        expect(await screen.findByText('Saved to /tmp/bodea.zip')).toBeInTheDocument();
    });
});

// Saving the store into a pack is Save Changes, given only for the demo's own pack (2026-11-04).
it('never offers Save Store Changes in the menu', () => {
    renderActions({ detail: OWN, installsFromLibrary: true });

    expect(menuLabels()).not.toContain('Save Store Changes to This Datapack');
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
});

it('leads with Save Changes when given it, Import beside it', async () => {
    const onSaveChanges = jest.fn();
    renderActions({ detail: OWN, installsFromLibrary: true, onSaveChanges });

    const [first, second] = screen.getAllByRole('button');
    expect(first).toHaveTextContent('Save Changes');
    expect(second).toHaveTextContent('Import');
    await press(first);
    expect(onSaveChanges).toHaveBeenCalledTimes(1);
});

describe('a library pack', () => {
    it('offers Copy to the Data Installer instead of Import with the service engine, and saves from the library', async () => {
        renderActions({ detail: LIBRARY });

        expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Copy to the Data Installer' })).toBeInTheDocument();
        await press(row('Save as File'));
        expect(mockRequest).toHaveBeenCalledWith('save-datapack-zip', { source: 'library', datapackName: 'bodea', version: 'main' }, undefined);
    });

    it("offers Import in place of Copy when Demo Builder's engine is chosen", async () => {
        const props = renderActions({ detail: LIBRARY, installsFromLibrary: true });

        expect(screen.queryByRole('button', { name: 'Copy to the Data Installer' })).not.toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Import' }));
        expect(props.onImport).toHaveBeenCalledWith(LIBRARY.id);
    });

    it("offers neither Share nor Remove on a colleague's library pack", () => {
        renderActions({ detail: LIBRARY });
        expect(menuLabels()).toEqual(['Save as File']);
    });

    it('lists Share on a private pack of the SC, Stop sharing on a shared one, and Remove Datapack at the bottom', () => {
        renderActions({ detail: OWN });
        expect(menuLabels()).toEqual(['Save as File', 'Share', 'Remove Datapack']);
    });

    it('lists Stop sharing on a shared pack of the SC', () => {
        renderActions({ detail: { ...OWN, shared: true } });
        expect(menuLabels()).toEqual(['Save as File', 'Stop Sharing', 'Remove Datapack']);
    });
});

describe('Share and Stop sharing keep their confirmation', () => {
    it("Share asks with the owner's sentence, and shares every version only on the second press", async () => {
        const onSharingChanged = jest.fn();
        mockRequest.mockResolvedValue({ success: true, data: { shared: true } });
        renderActions({ detail: OWN, onSharingChanged });

        await press(row('Share'));
        expect(screen.getByText(SHARE_CONSENT)).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalled();

        await press(screen.getByRole('button', { name: 'Share' }));
        expect(mockRequest).toHaveBeenCalledWith('share-library-datapack', { datapackName: 'bodea', shared: true, confirm: true }, undefined);
        await settle();
        expect(onSharingChanged).toHaveBeenCalled();
    });

    it('Stop sharing asks with no explanation; Cancel changes nothing', async () => {
        renderActions({ detail: { ...OWN, shared: true } });

        await press(row('Stop Sharing'));
        expect(screen.queryByText(SHARE_CONSENT)).not.toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Cancel' }));

        expect(mockRequest).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'Stop Sharing' })).not.toBeInTheDocument();
    });
});

describe('Remove Datapack keeps its confirmation', () => {
    it('removes on the one choice when there is nothing to warn about, then says so', async () => {
        const props = renderActions({ detail: OWN });
        mockRequest.mockResolvedValue({ success: true, data: { deleted: true } });

        await press(row('Remove Datapack'));

        expect(mockRequest).toHaveBeenCalledWith('delete-library-datapack', { datapackName: 'bodea', version: 'main', confirm: true }, undefined);
        expect(await screen.findByText('Removed.')).toBeInTheDocument();
        expect(props.onRemoved).toHaveBeenCalled();
    });

    it('shows the warning first, and removes only on the Remove press', async () => {
        renderActions({ detail: OWN, sharedInFile: WARNING });

        await press(row('Remove Datapack'));
        expect(screen.getByText(WARNING)).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalled();

        await press(screen.getByRole('button', { name: 'Remove' }));
        expect(mockRequest).toHaveBeenCalledWith('delete-library-datapack', { datapackName: 'bodea', version: 'main', confirm: true }, undefined);
    });

    it('keeps the pack when the warning is cancelled', async () => {
        renderActions({ detail: OWN, sharedInFile: WARNING });

        await press(row('Remove Datapack'));
        await press(screen.getByRole('button', { name: 'Cancel' }));

        expect(mockRequest).not.toHaveBeenCalled();
        expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    });

    it('says why when the library refuses', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Only the owner can delete this pack.' });
        renderActions({ detail: OWN });

        await press(row('Remove Datapack'));

        expect(await screen.findByText('It could not be removed: Only the owner can delete this pack.')).toBeInTheDocument();
    });
});

describe('a pack with a settings layer (datapack-engine step 09)', () => {
    const LAYER = { id: { name: 'bodea-settings', version: '2' }, mine: true, settings: [{ path: 'catalog/frontend/grid_per_page', value: '24' }] };

    it("offers to remove the SC's own layer from a pack in the Data Installer, the only place it can be reached", async () => {
        const onSharingChanged = jest.fn();
        mockRequest.mockResolvedValue({ success: true, data: { deleted: true } });
        renderActions({ settingsLayer: LAYER, onSharingChanged });

        expect(menuLabels()).toEqual(['Save as File', 'Remove Its Store Settings']);
        await press(row('Remove Its Store Settings'));

        expect(mockRequest).toHaveBeenCalledWith('delete-library-datapack', { datapackName: 'bodea-settings', version: '2', confirm: true }, undefined);
        expect(await screen.findByText('Removed.')).toBeInTheDocument();
        expect(onSharingChanged).toHaveBeenCalled();
    });

    it("offers it beside the SC's own pack's Remove, after it", () => {
        renderActions({ detail: OWN, settingsLayer: LAYER });

        expect(menuLabels().slice(-2)).toEqual(['Remove Datapack', 'Remove Its Store Settings']);
    });

    it("does not offer a colleague's layer, which only its owner can remove", () => {
        renderActions({ settingsLayer: { ...LAYER, mine: false } });

        expect(menuLabels()).toEqual(['Save as File']);
    });
});
