/**
 * The flyout's actions, one visible list (owner, 2026-11-17, matching the integration flyouts; it
 * replaced a main button and a More menu): the main action first (Install, Switch to <Name> or
 * Restore <Name>), then Save as File, Undo Last Save and Share or Stop Sharing, then behind a
 * divider, in the danger colour, Uninstall and Delete. Bare verbs; Delete is hidden on a Demo
 * Builder datapack; the flyout saves nothing (the header does). In the Datapack Library the list has
 * no main action. Each removal asks in a dialog, and the flyout waits while a row works. On a failed
 * install of the held datapack, Retry, then Fix with AI (step-04 S8).
 */

import { buttonLabels, makeDetail, menuLabels, mockRequest, resetRequests, row } from './PackActions.testUtils';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mocks on purpose: they hoist above these imports.
import type { DatapackDetail } from '@/features/data-installer/types';
import { DatapackDetailPanel } from '@/features/data-installer/ui/components/DatapackDetailPanel';
import { RETRIES_BEFORE_FIX } from '@/core/utils/fixWithAi';
import { PackActions } from '@/features/data-installer/ui/components/PackActions';
import type { HeldFailure } from '@/features/data-installer/ui/hooks/useProjectHolding';
import { SHARE_CONSENT } from '@/features/data-installer/shareWording';


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

beforeEach(resetRequests);

/** The open confirm dialog's own button: the list row of the same name stays on screen behind it. */
const confirmButton = (name: string): HTMLElement => within(screen.getByRole('dialog')).getByRole('button', { name });

describe('a Data Installer pack', () => {
    it('lists Install first, then Save as File; never Share or Remove, and no More menu', async () => {
        const props = renderActions({ detail: makeDetail({ mine: true }) });

        expect(menuLabels()).toEqual(['Install', 'Save as File']);
        expect(screen.queryByRole('button', { name: /^More/u })).not.toBeInTheDocument();

        await press(row('Install'));
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
it('offers no save of any kind: the list is Install, then the rest', () => {
    renderActions({ detail: OWN });

    expect(buttonLabels()).toEqual(['Install', 'Save as File', 'Share', 'Delete']);
    expect(menuLabels().some((label) => /Save (Changes|As New)/u.test(label))).toBe(false);
});

// Decisions J8-1 (owner, 2026-11-12): over another recorded datapack, the main action says it switches.
describe('the main action, first in the list', () => {
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
        expect(menuLabels()).toEqual(['Install', 'Save as File']);
    });

    it('lists Share on a private pack of the SC, and Delete at the bottom, in red behind a divider', () => {
        renderActions({ detail: OWN });
        expect(menuLabels()).toEqual(['Install', 'Save as File', 'Share', 'Delete']);
        expect(row('Delete')).toHaveClass('is-danger');
        expect(row('Share')).not.toHaveClass('is-danger');
        expect(document.querySelector('.integration-panel-actions-divider')).toBeInTheDocument();
    });

    it('lists Stop sharing on a shared pack of the SC', () => {
        renderActions({ detail: { ...OWN, shared: true } });
        expect(menuLabels()).toEqual(['Install', 'Save as File', 'Stop Sharing', 'Delete']);
    });

    // Overview Phase 7: no one deletes a Demo Builder datapack from the flyout, its owner included.
    it("offers no Delete on a Demo Builder datapack, though it is the SC's own", () => {
        renderActions({ detail: { ...OWN, team: true } });
        expect(menuLabels()).toEqual(['Install', 'Save as File', 'Share']);
    });

    // Owner, 2026-11-17: a red Uninstall beside a red Delete said both were for good. Uninstall is
    // undone by installing again, so it sits behind the divider in the normal colour.
    it('offers Uninstall last, behind the divider, not in red, and no Delete on a held Demo Builder datapack', () => {
        renderActions({ detail: { ...OWN, team: true }, onRemoveData: jest.fn() });
        expect(menuLabels()).toEqual(['Install', 'Save as File', 'Share', 'Uninstall']);
        expect(row('Uninstall')).not.toHaveClass('is-danger');
        expect(document.querySelector('.integration-panel-actions-divider')).not.toBeNull();
    });
});

// Owner, 2026-11-07: the Datapack Library touches no store, so it is given no Install: its list has
// no main action.
describe('in the Datapack Library', () => {
    it('lists Save as File, Share and Delete, with no main action', async () => {
        renderActions({ detail: OWN, onImport: undefined });

        expect(buttonLabels()).toEqual(['Save as File', 'Share', 'Delete']);
        expect(menuLabels()).toEqual(['Save as File', 'Share', 'Delete']);
        await press(row('Save as File'));
        expect(mockRequest).toHaveBeenCalledWith('save-datapack-zip', { source: 'library', datapackName: 'bodea', version: 'main' }, undefined);
    });

    it("offers a colleague's pack only Save as File", () => {
        renderActions({ detail: LIBRARY, onImport: undefined });

        expect(buttonLabels()).toEqual(['Save as File']);
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

        await press(confirmButton('Share'));
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
        await press(confirmButton('Share'));

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
        expect(screen.getByText(/will be deleted from your library\. This can't be undone\./)).toBeInTheDocument();
        // Only the check so far, which writes nothing: no confirm.
        expect(mockRequest.mock.calls).toEqual([['delete-library-datapack', { datapackName: 'bodea', version: 'main' }]]);

        // Rule 20: red is for deleting.
        expect(confirmButton('Delete')).toHaveClass('modal-button-negative');
        await press(confirmButton('Delete'));
        expect(mockRequest).toHaveBeenCalledWith('delete-library-datapack', { datapackName: 'bodea', version: 'main', confirm: true }, undefined);
        await settle();
        expect(props.onRemoved).toHaveBeenCalledTimes(1);
    });

    it('adds the warning for a pack shared in a project file', async () => {
        renderActions({ detail: OWN, sharedInFile: WARNING });

        await press(row('Delete'));

        expect(screen.getByText(WARNING)).toBeInTheDocument();
        expect(screen.getByText(/will be deleted from your library\. This can't be undone\./)).toBeInTheDocument();
    });

    it('keeps the pack when cancelled', async () => {
        renderActions({ detail: OWN, sharedInFile: WARNING });

        await press(row('Delete'));
        await press(screen.getByRole('button', { name: 'Cancel' }));

        // The check alone went out, which writes nothing.
        expect(mockRequest.mock.calls.every(([, payload]) => (payload as { confirm?: boolean }).confirm !== true)).toBe(true);
        expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    });

    // Owner, 2026-11-20: it asked "will be deleted" and then said a demo used it. The check comes first.
    it('says the open demo uses it, in place of the question, with Uninstall beside Close', async () => {
        const onRemoveData = jest.fn();
        mockRequest.mockResolvedValue({
            success: false,
            error: 'Scratch 1028 uses this datapack. Uninstall it there first.',
            data: { inUse: { users: ['Scratch 1028'], open: true } },
        });
        renderActions({ detail: OWN, onRemoveData });

        await press(row('Delete'));

        expect(screen.queryByRole('heading', { name: 'Delete Bodea?' })).toBeNull();
        expect(screen.getByText('In Use')).toHaveClass('result-outcome');
        expect(screen.getByText('Scratch 1028 uses it. Uninstall it here first.')).toBeInTheDocument();
        await press(within(screen.getByRole('dialog')).getByRole('button', { name: 'Uninstall' }));
        expect(onRemoveData).toHaveBeenCalledTimes(1);
    });

    it('names the other demos that use it, with Close alone', async () => {
        mockRequest.mockResolvedValue({
            success: false,
            error: 'x',
            data: { inUse: { users: ['Scratch 1028 C', 'Kukla Luma'], open: false } },
        });
        renderActions({ detail: OWN, onRemoveData: jest.fn() });

        await press(row('Delete'));

        expect(screen.getByText('Scratch 1028 C and Kukla Luma use it. Uninstall it there first.')).toBeInTheDocument();
        expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Uninstall' })).toBeNull();
    });

    it('says why when the library refuses', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Only the owner can delete this pack.' });
        renderActions({ detail: OWN });

        await press(row('Delete'));
        await press(confirmButton('Delete'));

        expect(await screen.findByText('It could not be deleted: Only the owner can delete this pack.')).toBeInTheDocument();
    });
});

// The dialog design rules: a flyout waits with its title and a medium spinner, nothing else. A row
// has no button to spin (owner, 2026-11-05).
describe('while a row works, the flyout waits', () => {
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

        // The check before the question answers at once (nothing uses it); the delete itself waits.
        await press(row('Delete'));
        const finish = pendingRequest();
        await press(confirmButton('Delete'));
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
    expect(menuLabels()).toEqual(['Install', 'Save as File', 'Share', 'Delete']);
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
    it('is in the list, after Save as File, when there is a save to go back to', () => {
        renderSaves();

        expect(menuLabels()).toEqual(['Install', 'Save as File', 'Undo Last Save', 'Share', 'Delete']);
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

        await press(row('Delete'));
        expect(screen.getByText(/will be deleted from your library\. This can't be undone\./)).toBeInTheDocument();
        await press(confirmButton('Delete'));

        expect(mockRequest).toHaveBeenCalledWith(
            'delete-library-datapack',
            { datapackName: 'my-luma', everyVersion: true, confirm: true },
            undefined
        );
    });
});

// Step-04 S8 (decisions J6-2, J6-3): on a failed install of the held datapack the main action is
// Retry, which starts the install and opens the job window on its run (Undo's pattern), and once
// retries have not helped (`RETRIES_BEFORE_FIX`) it is Fix with AI, built from the project's record.
const FAILED_DETAIL: DatapackDetail = {
    id: { name: 'my-luma', version: '20261112-120000' },
    displayName: 'My Luma',
    shared: false,
    dataTypes: ['categories', 'products'],
    art: {},
    store: 'library',
    mine: true,
};

const FAILED: HeldFailure = {
    reason: "Commerce didn't answer in time",
    retries: 0,
    commerceInstance: 'https://store.example.test',
    scope: { websiteCode: 'base', storeCode: 'default' },
};

function renderFailed(failed: HeldFailure = FAILED) {
    const props = {
        detail: FAILED_DETAIL,
        onImport: jest.fn(),
        onRemoved: jest.fn(),
        installerOn: false,
        failed,
        importable: ['categories', 'products'],
    };
    render(<PackActions {...props} />);
    return props;
}

const sent = (type: string) => mockRequest.mock.calls.filter(([t]) => t === type).map(([, body]) => body);

describe('a failed install: Retry', () => {
    it('is the first row in place of Install or Restore', () => {
        renderFailed();

        expect(menuLabels()).toEqual(['Retry', 'Save as File', 'Share', 'Delete']);
    });

    it('starts the install of the whole pack to the project’s target, then opens the window on its run', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { activationId: 'act-1' } });
        const props = renderFailed();

        await press(screen.getByRole('button', { name: 'Retry' }));
        await settle();

        expect(sent('start-datapack-import')).toEqual([
            {
                datapackName: 'my-luma',
                version: '20261112-120000',
                source: 'library',
                commerceInstance: 'https://store.example.test',
                dataTypes: ['categories', 'products'],
                websiteCode: 'base',
                storeCode: 'default',
            },
        ]);
        expect(props.onImport).toHaveBeenCalledWith(FAILED_DETAIL.id, 'run');
    });

    it('says why when the install could not start, and opens no run', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'A Commerce instance is required: it is where the data will be written.' });
        const props = renderFailed();

        await press(screen.getByRole('button', { name: 'Retry' }));
        await settle();

        expect(screen.getByText(/A Commerce instance is required/u)).toBeInTheDocument();
        expect(props.onImport).not.toHaveBeenCalled();
    });

    it(`CONTROL: is still Retry after ${RETRIES_BEFORE_FIX - 1} retry`, () => {
        renderFailed({ ...FAILED, retries: RETRIES_BEFORE_FIX - 1 });

        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
});

describe('a failed install: Fix with AI', () => {
    it('takes Retry’s place once retries have not helped, and asks from the failed install', async () => {
        const props = renderFailed({ ...FAILED, retries: RETRIES_BEFORE_FIX });

        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Fix with AI' }));

        expect(sent('fix-datapack-import-with-ai')).toEqual([{ from: 'install-failed' }]);
        expect(sent('start-datapack-import')).toStrictEqual([]);
        expect(props.onImport).not.toHaveBeenCalled();
    });

    // Step-07 P5 (S8): nothing to fix is said under the list, as a problem line.
    it('says so under the list when there is nothing to fix', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'This datapack has no failed install to fix.' });
        renderFailed({ ...FAILED, retries: RETRIES_BEFORE_FIX });

        await press(screen.getByRole('button', { name: 'Fix with AI' }));
        await settle();

        expect(screen.getByText('This datapack has no failed install to fix.')).toHaveClass('dialog-problem');
    });
});
