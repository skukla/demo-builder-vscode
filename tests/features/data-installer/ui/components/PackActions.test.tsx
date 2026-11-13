/**
 * The flyout's actions (owner, 2026-10-30; step-04 S5, decisions Phase 7): the main button (Install,
 * Switch to <Name> or Restore <Name>) and More, whose upper section is Save as File, Undo Last Save
 * and Share or Stop Sharing, and whose lower section is Uninstall and Delete. Bare verbs; Delete is
 * hidden on a Demo Builder datapack; the flyout saves nothing (the header does). In the Datapack
 * Library the bar is More alone. Each removal asks in a dialog, and the flyout waits while a row works.
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
const WARNING = "You shared this datapack in a project file on 27 October. Anyone who hasn't created that project yet will get bodea instead.";

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
    it('shows Install as the one button, and Save as File in the menu; never Share or Remove', async () => {
        const props = renderActions({ detail: makeDetail({ mine: true }) });

        expect(screen.getByRole('button', { name: 'More actions for Bodea' })).toBeInTheDocument();
        expect(menuLabels()).toEqual(['Save as File']);
        expect(screen.queryByRole('button', { name: 'Save as File' })).not.toBeInTheDocument();

        await press(screen.getByRole('button', { name: 'Install' }));
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

// Step-04 S5 (overview Phase 7): saving lives in the header only, so the flyout offers no save.
it('offers no save of any kind: the bar is the main button and More', () => {
    renderActions({ detail: OWN });

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Install', 'More▾']);
    expect(menuLabels().some((label) => /Save (Changes|As New)/u.test(label ?? ''))).toBe(false);
});

// Decisions J8-1 (owner, 2026-11-12): over another recorded datapack, the main button says it switches.
describe('the main button', () => {
    it('reads Switch to <Name> over another recorded datapack, and opens the window on it', async () => {
        const props = renderActions({ switches: true });

        await press(screen.getByRole('button', { name: 'Switch to Bodea' }));

        expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
        expect(props.onImport).toHaveBeenCalledWith({ name: 'bodea', version: 'main' });
    });

    it('reads Restore <Name> on the held one, and opens the window on Restore', async () => {
        const props = renderActions({ restores: true });

        await press(screen.getByRole('button', { name: 'Restore Bodea' }));

        expect(props.onImport).toHaveBeenCalledWith({ name: 'bodea', version: 'main' }, 'restore');
    });
});

describe('a library pack', () => {
    // Owner, 2026-11-06: Demo Builder installs a library pack where it is, so Install is always there.
    // Copy to the Data Installer is not shown even while it is on: our accounts cannot write to it yet,
    // so it would fail every time (`INSTALLER_WRITES_SHOWN`).
    it('offers Install, and no Copy to the Data Installer even while it is on', async () => {
        const props = renderActions({ detail: LIBRARY, installerOn: true });

        expect(screen.queryByRole('button', { name: 'Copy to the Data Installer' })).not.toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Install' }));
        expect(props.onImport).toHaveBeenCalledWith(LIBRARY.id);
        await press(row('Save as File'));
        expect(mockRequest).toHaveBeenCalledWith('save-datapack-zip', { source: 'library', datapackName: 'bodea', version: 'main' }, undefined);
    });

    it('offers no Copy while the Data Installer is off or has no address, and still Install', () => {
        renderActions({ detail: LIBRARY, installerOn: false });

        expect(screen.queryByRole('button', { name: 'Copy to the Data Installer' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
    });

    it("never offers Copy on a Data Installer pack: it is there already", () => {
        renderActions({ detail: makeDetail(), installerOn: true });

        expect(screen.queryByRole('button', { name: 'Copy to the Data Installer' })).not.toBeInTheDocument();
    });

    it("offers neither Share nor Delete on a colleague's library pack", () => {
        renderActions({ detail: LIBRARY });
        expect(menuLabels()).toEqual(['Save as File']);
    });

    it('lists Share on a private pack of the SC, and Delete at the bottom', () => {
        renderActions({ detail: OWN });
        expect(menuLabels()).toEqual(['Save as File', 'Share', 'Delete']);
    });

    it('lists Stop sharing on a shared pack of the SC', () => {
        renderActions({ detail: { ...OWN, shared: true } });
        expect(menuLabels()).toEqual(['Save as File', 'Stop Sharing', 'Delete']);
    });

    // Overview Phase 7: no one deletes a Demo Builder datapack from the flyout, its owner included.
    it("offers no Delete on a Demo Builder datapack, though it is the SC's own", () => {
        renderActions({ detail: { ...OWN, team: true } });
        expect(menuLabels()).toEqual(['Save as File', 'Share']);
    });

    it('offers Uninstall and no Delete on a held Demo Builder datapack', () => {
        renderActions({ detail: { ...OWN, team: true }, onRemoveData: jest.fn() });
        expect(menuLabels()).toEqual(['Save as File', 'Share', 'Uninstall']);
    });
});

// Owner, 2026-11-07: the Datapack Library touches no store, so it is given no Install. Step-04 S5
// (overview Phase 7b, one pinned bar, the same buttons in the same order): its bar is More alone.
describe('in the Datapack Library', () => {
    it('is More alone, holding Save as File, Share and Delete', async () => {
        renderActions({ detail: OWN, onImport: undefined });

        expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['More▾']);
        expect(menuLabels()).toEqual(['Save as File', 'Share', 'Delete']);
        await press(row('Save as File'));
        expect(mockRequest).toHaveBeenCalledWith('save-datapack-zip', { source: 'library', datapackName: 'bodea', version: 'main' }, undefined);
    });

    it("offers a colleague's pack only Save as File, under More", () => {
        renderActions({ detail: LIBRARY, onImport: undefined });

        expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['More▾']);
        expect(menuLabels()).toEqual(['Save as File']);
    });

    it('asks before Share', async () => {
        renderActions({ detail: OWN, onImport: undefined });

        await press(row('Share'));

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

        expect(await screen.findByText("It couldn't be shared: No.")).toBeInTheDocument();
        expect(row('Share')).toBeInTheDocument();
    });
});

describe('Delete asks in a dialog, every time', () => {
    // Overview Phase 7: the SC never sees a version, so the line names none. Only that named
    // version is deleted, as before (P4-Q6 is open).
    it('says it cannot be undone, names no version, and removes only when the dialog says so', async () => {
        const props = renderActions({ detail: OWN });
        mockRequest.mockResolvedValue({ success: true, data: { deleted: true } });

        await press(row('Delete'));
        expect(screen.getByRole('heading', { name: 'Delete Bodea?' })).toBeInTheDocument();
        expect(screen.getByText('Permanently deletes it.')).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalled();

        // Rule 20: red is for deleting.
        expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('modal-button-negative');
        await press(screen.getByRole('button', { name: 'Delete' }));
        expect(mockRequest).toHaveBeenCalledWith('delete-library-datapack', { datapackName: 'bodea', version: 'main', confirm: true }, undefined);
        await settle();
        expect(props.onRemoved).toHaveBeenCalledTimes(1);
    });

    it('adds the warning for a pack shared in a project file', async () => {
        renderActions({ detail: OWN, sharedInFile: WARNING });

        await press(row('Delete'));

        expect(screen.getByText(WARNING)).toBeInTheDocument();
        expect(screen.getByText('Permanently deletes it.')).toBeInTheDocument();
    });

    it('keeps the pack when cancelled', async () => {
        renderActions({ detail: OWN, sharedInFile: WARNING });

        await press(row('Delete'));
        await press(screen.getByRole('button', { name: 'Cancel' }));

        expect(mockRequest).not.toHaveBeenCalled();
        expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    });

    it('says why when the library refuses', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Only the owner can delete this pack.' });
        renderActions({ detail: OWN });

        await press(row('Delete'));
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
        expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
        expect(onWorking).toHaveBeenLastCalledWith(true);

        finish({ success: true, data: { path: '/tmp/bodea.zip' } });
        expect(await screen.findByText('Saved to /tmp/bodea.zip')).toBeInTheDocument();
        expect(waiting()).not.toBeInTheDocument();
        expect(onWorking).toHaveBeenLastCalledWith(false);
    });

    it('stays waiting once a pack is removed, as the flyout closes', async () => {
        const props = renderActions({ detail: OWN });
        const finish = pendingRequest();

        await press(row('Delete'));
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

// Overview Phase 7: Delete Store Configuration is removed from the flyout; Delete takes the layer with it.
it("offers no Delete Store Configuration, though the SC owns the datapack's layer", () => {
    renderActions({ detail: OWN });

    expect(menuLabels()).not.toContain('Delete Store Configuration');
    expect(menuLabels()).toEqual(['Save as File', 'Share', 'Delete']);
});

// A pack of saves: one thing on its card. The datapack keeps its two newest saves, and Undo Last Save
// goes back to the one before the newest (Phase 2, owner 2026-11-12); Delete takes it whole.
const NEWEST = '20261109-185605';
const PREVIOUS = '20261109-160124';

const SAVES: DatapackDetail = {
    id: { name: 'my-luma', version: NEWEST },
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
        undoTo: PREVIOUS,
        ...over,
    };
    render(<PackActions {...props} />);
    return props;
}

const UNDO_BODY = 'Commerce goes back to My Luma as it was before your last save. Anything you changed since is lost.';

describe('Undo Last Save', () => {
    it('is under More, after Save as File, when there is a save to go back to', () => {
        renderSaves();

        expect(menuLabels()).toEqual(['Save as File', 'Undo Last Save', 'Share', 'Delete']);
    });

    it('CONTROL: is not offered without a save to go back to', () => {
        renderSaves({ undoTo: undefined });

        expect(menuLabels()).not.toContain('Undo Last Save');
    });

    it('asks first, in blue, and sends nothing until Undo', async () => {
        renderSaves();

        await press(row('Undo Last Save'));

        expect(screen.getByRole('heading', { name: 'Undo Last Save?' })).toBeInTheDocument();
        expect(screen.getByText(UNDO_BODY)).toBeInTheDocument();
        // Rule 20: red is for deleting and removing only; Undo is the standard blue.
        expect(screen.getByRole('button', { name: 'Undo' })).toHaveClass('modal-button-primary');
        expect(screen.getByRole('button', { name: 'Undo' })).not.toHaveClass('modal-button-negative');
        expect(mockRequest.mock.calls.some(([type]) => type === 'undo-last-save')).toBe(false);
    });

    it('on Undo, starts the undo and opens the run on the save it goes back to', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { activationId: 'act-1' } });
        const props = renderSaves();

        await press(row('Undo Last Save'));
        await press(screen.getByRole('button', { name: 'Undo' }));
        await settle();

        const call = mockRequest.mock.calls.find(([type]) => type === 'undo-last-save');
        expect(call?.[1]).toEqual({ datapackName: 'my-luma', confirm: true });
        // Straight on the run: the job is already started (step 03, S4).
        expect(props.onImport).toHaveBeenCalledWith({ name: 'my-luma', version: PREVIOUS }, 'run');
    });

    it('says why when the undo is refused, and opens no run', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'There is no earlier save to go back to.' });
        const props = renderSaves();

        await press(row('Undo Last Save'));
        await press(screen.getByRole('button', { name: 'Undo' }));
        await settle();

        expect(screen.getByText(/There is no earlier save to go back to\./u)).toBeInTheDocument();
        expect(props.onImport).not.toHaveBeenCalled();
    });

    it('CONTROL: Cancel sends nothing', async () => {
        renderSaves();

        await press(row('Undo Last Save'));
        await press(screen.getByRole('button', { name: 'Cancel' }));

        expect(mockRequest.mock.calls.some(([type]) => type === 'undo-last-save')).toBe(false);
    });
});

describe('Delete on a pack of saves', () => {
    it('removes it whole, and says so', async () => {
        renderSaves();

        await press(screen.getByRole('menuitem', { name: 'Delete' }));
        expect(screen.getByText('Permanently deletes it.')).toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Delete' }));

        expect(mockRequest).toHaveBeenCalledWith(
            'delete-library-datapack',
            { datapackName: 'my-luma', everyVersion: true, confirm: true },
            undefined
        );
    });
});
