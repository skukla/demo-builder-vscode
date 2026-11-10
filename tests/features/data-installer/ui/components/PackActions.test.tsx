/**
 * The flyout's actions (owner, 2026-10-30): Import is the one button on view; everything else is
 * in the house kebab (`CardActionsMenu`): Save as file, Share or Stop sharing, and Delete Datapack
 * in its own section at the bottom. Share and Delete show only on the SC's own library pack,
 * each asks in a dialog, the flyout waits while a row works, and a library pack offers Copy to the
 * Data Installer with the service's engine.
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
import { DatapackDetailPanel } from '@/features/data-installer/ui/components/DatapackDetailPanel';
import { PackActions } from '@/features/data-installer/ui/components/PackActions';
import { SHARE_CONSENT } from '@/features/data-installer/shareWording';
import { versionLabel } from '@/features/data-installer/packVersions';

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
        installerOn: false,
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
    renderActions({ detail: OWN });

    expect(menuLabels()).not.toContain('Save Store Changes to This Datapack');
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
});

it('leads with Save Changes when given it, Import beside it', async () => {
    const onSaveChanges = jest.fn();
    renderActions({ detail: OWN, onSaveChanges });

    const [first, second] = screen.getAllByRole('button');
    expect(first).toHaveTextContent('Save Changes');
    expect(second).toHaveTextContent('Import');
    await press(first);
    expect(onSaveChanges).toHaveBeenCalledTimes(1);
});

describe('a library pack', () => {
    // Owner, 2026-11-06: Demo Builder installs a library pack where it is, so Import is always there.
    // Copy to the Data Installer is not shown even while it is on: our accounts cannot write to it yet,
    // so it would fail every time (`INSTALLER_WRITES_SHOWN`).
    it('offers Import, and no Copy to the Data Installer even while it is on', async () => {
        const props = renderActions({ detail: LIBRARY, installerOn: true });

        expect(screen.queryByRole('button', { name: 'Copy to the Data Installer' })).not.toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Import' }));
        expect(props.onImport).toHaveBeenCalledWith(LIBRARY.id);
        await press(row('Save as File'));
        expect(mockRequest).toHaveBeenCalledWith('save-datapack-zip', { source: 'library', datapackName: 'bodea', version: 'main' }, undefined);
    });

    it('offers no Copy while the Data Installer is off or has no address, and still Import', () => {
        renderActions({ detail: LIBRARY, installerOn: false });

        expect(screen.queryByRole('button', { name: 'Copy to the Data Installer' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    });

    it("never offers Copy on a Data Installer pack: it is there already", () => {
        renderActions({ detail: makeDetail(), installerOn: true });

        expect(screen.queryByRole('button', { name: 'Copy to the Data Installer' })).not.toBeInTheDocument();
    });

    it("offers neither Share nor Delete on a colleague's library pack", () => {
        renderActions({ detail: LIBRARY });
        expect(menuLabels()).toEqual(['Save as File']);
    });

    it('lists Share on a private pack of the SC, Stop sharing on a shared one, and Delete Datapack at the bottom', () => {
        renderActions({ detail: OWN });
        expect(menuLabels()).toEqual(['Save as File', 'Share', 'Delete Datapack']);
    });

    it('lists Stop sharing on a shared pack of the SC', () => {
        renderActions({ detail: { ...OWN, shared: true } });
        expect(menuLabels()).toEqual(['Save as File', 'Stop Sharing', 'Delete Datapack']);
    });
});

// Owner, 2026-11-07: the Datapack Library touches no store, so it is given no Import.
describe('in the Datapack Library', () => {
    it('offers no Import or Save Changes; Save as File and Share are the buttons, More only removes', async () => {
        renderActions({ detail: OWN, onImport: undefined });

        expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
        expect(menuLabels()).toEqual(['Delete Datapack']);
        await press(screen.getByRole('button', { name: 'Save as File' }));
        expect(mockRequest).toHaveBeenCalledWith('save-datapack-zip', { source: 'library', datapackName: 'bodea', version: 'main' }, undefined);
    });

    it("offers a colleague's pack only Save as File, with no More", () => {
        renderActions({ detail: LIBRARY, onImport: undefined });

        expect(screen.getByRole('button', { name: 'Save as File' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
        expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    });

    it('asks before Share, as the menu row does', async () => {
        renderActions({ detail: OWN, onImport: undefined });

        await press(screen.getByRole('button', { name: 'Share' }));

        expect(screen.getByText(SHARE_CONSENT)).toBeInTheDocument();
    });
});

describe('Share and Stop sharing ask in a dialog', () => {
    it("Share asks with the owner's sentence, and shares every version only when the dialog says so", async () => {
        const onSharingChanged = jest.fn();
        mockRequest.mockResolvedValue({ success: true, data: { shared: true } });
        renderActions({ detail: OWN, onSharingChanged });

        await press(row('Share'));
        expect(screen.getByRole('heading', { name: 'Share Bodea?' })).toBeInTheDocument();
        expect(screen.getByText(SHARE_CONSENT)).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalled();

        await press(screen.getByRole('button', { name: 'Share' }));
        expect(mockRequest).toHaveBeenCalledWith('share-library-datapack', { datapackName: 'bodea', shared: true, confirm: true }, undefined);
        await settle();
        expect(onSharingChanged).toHaveBeenCalled();
    });

    it('Stop sharing says what changes; Cancel changes nothing', async () => {
        renderActions({ detail: { ...OWN, shared: true } });

        await press(row('Stop Sharing'));
        expect(screen.getByRole('heading', { name: 'Stop Sharing Bodea?' })).toBeInTheDocument();
        expect(screen.getByText('Other people can no longer see or install it.')).toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Cancel' }));

        expect(mockRequest).not.toHaveBeenCalled();
        expect(screen.queryByRole('heading', { name: 'Stop Sharing Bodea?' })).not.toBeInTheDocument();
    });

    it('says why when the library refuses, with the actions back', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'No.' });
        renderActions({ detail: OWN });

        await press(row('Share'));
        await press(screen.getByRole('button', { name: 'Share' }));

        expect(await screen.findByText('It could not be changed: No.')).toBeInTheDocument();
        expect(row('Share')).toBeInTheDocument();
    });
});

describe('Delete Datapack asks in a dialog, every time', () => {
    it('names the version, says it cannot be undone, and removes only when the dialog says so', async () => {
        const props = renderActions({ detail: OWN });
        mockRequest.mockResolvedValue({ success: true, data: { deleted: true } });

        await press(row('Delete Datapack'));
        expect(screen.getByRole('heading', { name: 'Delete Bodea?' })).toBeInTheDocument();
        expect(screen.getByText("Permanently deletes version main.")).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalled();

        await press(screen.getByRole('button', { name: 'Delete' }));
        expect(mockRequest).toHaveBeenCalledWith('delete-library-datapack', { datapackName: 'bodea', version: 'main', confirm: true }, undefined);
        await settle();
        expect(props.onRemoved).toHaveBeenCalledTimes(1);
    });

    it('adds the warning for a pack shared in a project file', async () => {
        renderActions({ detail: OWN, sharedInFile: WARNING });

        await press(row('Delete Datapack'));

        expect(screen.getByText(WARNING)).toBeInTheDocument();
        expect(screen.getByText("Permanently deletes version main.")).toBeInTheDocument();
    });

    it('keeps the pack when cancelled', async () => {
        renderActions({ detail: OWN, sharedInFile: WARNING });

        await press(row('Delete Datapack'));
        await press(screen.getByRole('button', { name: 'Cancel' }));

        expect(mockRequest).not.toHaveBeenCalled();
        expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    });

    it('says why when the library refuses', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Only the owner can delete this pack.' });
        renderActions({ detail: OWN });

        await press(row('Delete Datapack'));
        await press(screen.getByRole('button', { name: 'Delete' }));

        expect(await screen.findByText('It could not be deleted: Only the owner can delete this pack.')).toBeInTheDocument();
    });
});

// The dialog design rules: a flyout waits with its title and a medium spinner, nothing else. The menu
// a row was chosen from has closed, so it has no button to spin (owner, 2026-11-05).
describe('while a menu row works, the flyout waits', () => {
    const waiting = () => document.querySelector('.datapack-panel-loading');
    const pendingRequest = (): ((value: unknown) => void) => {
        let finish: (value: unknown) => void = () => undefined;
        mockRequest.mockReturnValue(new Promise((resolve) => (finish = resolve)));
        return (value) => finish(value);
    };

    it('tells the flyout, and shows only the spinner, through a Save as File', async () => {
        const onWorking = jest.fn();
        renderActions({ onWorking });
        const finish = pendingRequest();

        await press(row('Save as File'));

        expect(waiting()).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
        expect(onWorking).toHaveBeenLastCalledWith(true);

        finish({ success: true, data: { path: '/tmp/bodea.zip' } });
        expect(await screen.findByText('Saved to /tmp/bodea.zip')).toBeInTheDocument();
        expect(waiting()).not.toBeInTheDocument();
        expect(onWorking).toHaveBeenLastCalledWith(false);
    });

    it('stays waiting once a pack is removed, as the flyout closes', async () => {
        const props = renderActions({ detail: OWN });
        const finish = pendingRequest();

        await press(row('Delete Datapack'));
        await press(screen.getByRole('button', { name: 'Delete' }));
        expect(waiting()).toBeInTheDocument();

        finish({ success: true, data: { deleted: true } });
        await settle();

        expect(props.onRemoved).toHaveBeenCalledTimes(1);
        expect(waiting()).toBeInTheDocument();
    });

    it("takes the flyout's rows away during the wait, and gives them back", async () => {
        render(
            <DatapackDetailPanel
                selected={{ name: 'bodea', version: 'main' }}
                detail={makeDetail({ owner: 'CoreTech' })}
                inventory={{ present: ['products'], missing: [], presentCount: 1, missingCount: 0, requestedCount: 1 }}
                loading={false}
                failure={null}
                onClose={jest.fn()}
                onRetry={jest.fn()}
                onImport={jest.fn()}
                onRemoved={jest.fn()}
                installerOn={false}
            />,
        );
        expect(screen.getByText('CoreTech')).toBeInTheDocument();
        const finish = pendingRequest();

        await press(row('Save as File'));

        expect(screen.queryByText('CoreTech')).not.toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Bodea details' })).toHaveTextContent('Bodea');
        expect(waiting()).toBeInTheDocument();

        finish({ success: true, data: { path: '/tmp/bodea.zip' } });
        expect(await screen.findByText('CoreTech')).toBeInTheDocument();
    });

    it('lets the flyout go when it is closed during the wait', async () => {
        const onWorking = jest.fn();
        const { unmount } = render(
            <PackActions detail={makeDetail()} onImport={jest.fn()} onRemoved={jest.fn()} installerOn={false} onWorking={onWorking} />,
        );
        pendingRequest();
        await press(row('Save as File'));
        expect(onWorking).toHaveBeenLastCalledWith(true);

        unmount();

        expect(onWorking).toHaveBeenLastCalledWith(false);
    });
});

describe('a pack with a settings layer (datapack-engine step 09)', () => {
    const LAYER = { id: { name: 'bodea-settings', version: '2' }, mine: true, settings: [{ path: 'catalog/frontend/grid_per_page', value: '24' }] };

    it("offers to remove the SC's own layer from a pack in the Data Installer, the only place it can be reached", async () => {
        const onSharingChanged = jest.fn();
        mockRequest.mockResolvedValue({ success: true, data: { deleted: true } });
        renderActions({ settingsLayer: LAYER, onSharingChanged });

        expect(menuLabels()).toEqual(['Save as File', 'Delete Store Settings']);
        await press(row('Delete Store Settings'));
        expect(screen.getByRole('heading', { name: "Delete Bodea's Store Settings?" })).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalled();
        await press(screen.getByRole('button', { name: 'Delete' }));

        expect(mockRequest).toHaveBeenCalledWith('delete-library-datapack', { datapackName: 'bodea-settings', version: '2', confirm: true }, undefined);
        expect(await screen.findByText('Deleted.')).toBeInTheDocument();
        expect(onSharingChanged).toHaveBeenCalled();
    });

    it("offers it beside the SC's own pack's Remove, after it", () => {
        renderActions({ detail: OWN, settingsLayer: LAYER });

        expect(menuLabels().slice(-2)).toEqual(['Delete Datapack', 'Delete Store Settings']);
    });

    it("does not offer a colleague's layer, which only its owner can remove", () => {
        renderActions({ settingsLayer: { ...LAYER, mine: false } });

        expect(menuLabels()).toEqual(['Save as File']);
    });
});

// A pack of saves (owner, 2026-11-09, walk F99): its earlier saves are its Version History, under
// More; Restore Version opens the import of the one chosen; Delete Datapack takes it whole.
const NEWEST = '20261109-185605';
const IN_USE = '20261109-160124';
const OLDEST = '20261109-141504';
const HISTORY = [NEWEST, IN_USE, OLDEST];

const SAVES: DatapackDetail = {
    id: { name: 'my-luma', version: IN_USE },
    displayName: 'My Luma',
    shared: false,
    dataTypes: ['products'],
    art: {},
    store: 'library',
    mine: true,
};

function renderSaves(over: Partial<React.ComponentProps<typeof PackActions>> = {}) {
    const props = {
        detail: SAVES,
        onImport: jest.fn(),
        onRemoved: jest.fn(),
        installerOn: false,
        history: HISTORY,
        inUse: IN_USE,
        ...over,
    };
    render(<PackActions {...props} />);
    return props;
}



describe('Version History', () => {
    it('is under More on a pack with more than one save', () => {
        renderSaves();

        expect(menuLabels()).toEqual([
            'Save as File',
            'Version History',
            'Share',
            'Delete Datapack',
        ]);
    });

    it('lists the saves by when each was saved, marks the one in use, and restores the one chosen', async () => {
        const props = renderSaves();

        await press(screen.getByRole('menuitem', { name: 'Version History' }));

        expect(screen.getByRole('heading', { name: 'Version History' })).toBeInTheDocument();
        expect(
            screen.getAllByRole('radio').map((radio) => radio.closest('label')?.textContent)
        ).toEqual([versionLabel(NEWEST), `${versionLabel(IN_USE)} (in use)`, versionLabel(OLDEST)]);
        expect(screen.queryByText(/20261109/u)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Restore Version' })).toHaveAttribute('aria-disabled', 'true');

        await press(screen.getByRole('radio', { name: versionLabel(OLDEST) }));
        await press(screen.getByRole('button', { name: 'Restore Version' }));

        expect(props.onImport).toHaveBeenCalledWith({ name: 'my-luma', version: OLDEST });
        expect(screen.queryByRole('heading', { name: 'Version History' })).not.toBeInTheDocument();
    });

    it('CONTROL: restoring the save already in use is not offered', async () => {
        renderSaves();
        await press(screen.getByRole('menuitem', { name: 'Version History' }));

        await press(screen.getByRole('radio', { name: /in use/u }));

        expect(screen.getByRole('button', { name: 'Restore Version' })).toHaveAttribute('aria-disabled', 'true');
    });

    it('CONTROL: a pack with one save, or a named version, has no Version History', () => {
        renderSaves({ history: [IN_USE] });
        expect(menuLabels()).not.toContain('Version History');
    });
});

describe('Delete Datapack on a pack of saves', () => {
    it('removes it whole, its version history with it, and says so', async () => {
        renderSaves();

        await press(screen.getByRole('menuitem', { name: 'Delete Datapack' }));
        expect(
            screen.getByText("Permanently deletes it and its version history.")
        ).toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Delete' }));

        expect(mockRequest).toHaveBeenCalledWith(
            'delete-library-datapack',
            { datapackName: 'my-luma', everyVersion: true, confirm: true },
            undefined
        );
    });
});
