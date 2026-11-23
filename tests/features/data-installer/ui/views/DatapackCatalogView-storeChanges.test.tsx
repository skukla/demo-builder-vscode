/**
 * DatapackCatalogView — the demo's own datapack in the library, and saving it (owner, 2026-11-04,
 * `.rptc/complete/datapack-save-as/`).
 *
 * The pack the project installs from and resets to is one of the library's cards, wearing the
 * check, wherever it lives. Saving the demo's datapack lives in its flyout (owner, 2026-11-17, walk
 * F219, replacing step-04 S5's header Save menu): Update and Save As New on the SC's own, Save As New
 * on someone else's; the header reads Create. A finished save reads the catalog again at once, so
 * Close only closes.
 *
 * Update Acme Bodea opens "Update Acme Bodea" and Save As New "Save As New Datapack", its own form
 * (step-04 S2; decisions Phase 7b, J3-1): the windows' own suites are in `components/save/`.
 */

import { act, render, screen, waitFor, within } from '@testing-library/react';
import { change, press, settle } from '../../../../helpers/reactSettle';
import { findResult } from '../../../../helpers/resultQueries';
import { mockOnMessage } from '../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';
import { CATALOG, DatapackCatalogView, INVENTORY_COMPLETE, makeSummary, mockPost, mockRequest } from './DatapackCatalogView.testUtils';
import { PICKABLE_KINDS } from '@/features/data-installer/pickableKinds';
import { datapackDay, savedAt, versionLabel } from '@/features/data-installer/packVersions';
import type { DatapackSummary } from '@/features/data-installer/types';

/** The SC's own library pack, in two versions; the demo uses the older. */
const OLDER = makeSummary('acme-1a2b3c', '20261101-090000', { displayName: 'Acme Bodea', store: 'library', mine: true });
const NEWER = makeSummary('acme-1a2b3c', '20261103-120000', { displayName: 'Acme Bodea', store: 'library', mine: true });
const MINE = [OLDER, NEWER, ...CATALOG];

type Held = { name: string; version: string; store?: 'library' | 'installer' } | undefined;

/** The catalog, the open project's recorded pack, and the flyout's detail for whichever card opens. */
function store(datapack: Held, items: DatapackSummary[] = MINE, installerOn = false, installedAt?: string, updateBehind = false) {
    mockRequest.mockImplementation((type: string, payload?: { datapackName?: string; version?: string }) => {
        if (type === 'find-datapacks') return Promise.resolve({ success: true, data: { items, count: items.length, total: items.length, ...(installerOn ? { installerOn } : {}) } });
        if (type === 'get-datapack-import-target') return Promise.resolve({ success: true, data: { instance: 'inst', projectName: 'acme', datapack, ...(installedAt ? { installedAt } : {}), ...(updateBehind ? { updateBehind } : {}) } });
        if (type === 'get-datapack-detail') {
            const detail = items.find((item) => item.id.name === payload?.datapackName && item.id.version === payload.version) ?? items[0];
            return Promise.resolve({ success: true, data: { detail: { store: 'installer', ...detail }, inventory: INVENTORY_COMPLETE } });
        }
        if (type === 'list-datapack-export-items') return Promise.resolve({ success: true, data: { items: [], totalCount: 0, excludedCount: 0, inPackCount: 0 } });
        return Promise.resolve({ success: true, data: null });
    });
}

async function renderView(): Promise<void> {
    render(<DatapackCatalogView />);
    await settle();
    await screen.findAllByTestId('datapack-card');
}

const card = (name: string) => screen.getAllByTestId('datapack-card').find((each) => each.getAttribute('data-datapack') === name) as HTMLElement;
const catalogReads = () => mockRequest.mock.calls.filter((call) => call[0] === 'find-datapacks').length;

/** Hand a progress push to everything listening for one. */
async function push(data: { id: string; state: string }): Promise<void> {
    await act(async () => {
        for (const [type, handler] of mockOnMessage.mock.calls) if (type === 'operationProgress') handler(data);
    });
}

beforeEach(() => {
    mockPost.mockClear();
    mockOnMessage.mockClear();
});

describe("the demo's datapack in the library", () => {
    it('wears the check on its own card, opening on the version the demo uses, with no section above the grid', async () => {
        store({ name: 'acme-1a2b3c', version: OLDER.id.version, store: 'library' });
        await renderView();

        expect(within(card('acme-1a2b3c')).getByTestId('datapack-card-project-check')).toBeInTheDocument();
        // A save is named by when it was saved, never its id (walk F99).
        expect(card('acme-1a2b3c')).toHaveAccessibleName(`Acme Bodea, Saved ${versionLabel(OLDER.id.version)}`);
        // CONTROL: a pack the demo does not use wears none.
        expect(within(card('wknd')).queryByTestId('datapack-card-project-check')).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: "This Demo's Datapack" })).not.toBeInTheDocument();
    });

    // Owner, 2026-11-09 (walk F99): a pack of saves is one thing, so no version picker. Step-07 U1
    // (J9-1): a later save is what Update installs, so the amber dot says "Newer version available".
    it('shows the save in use with no version picker, and the amber dot while a later save exists', async () => {
        const items = [{ ...OLDER, createdAt: '2026-11-01T09:00:00Z' }, { ...NEWER, createdAt: '2026-11-03T12:00:00Z' }];
        store({ name: 'acme-1a2b3c', version: OLDER.id.version, store: 'library' }, items, false, AT);
        await renderView();

        // The card says the day alone (F279); its accessible name keeps the time.
        const savedOn = savedAt(OLDER.id.version);
        expect(within(card('acme-1a2b3c')).getByText(`Saved ${savedOn ? datapackDay(savedOn) : ''}`)).toBeInTheDocument();
        expect(within(card('acme-1a2b3c')).queryByRole('button', { name: /Version of/u })).not.toBeInTheDocument();
        expect(within(card('acme-1a2b3c')).getByRole('button', { name: 'Newer version available' })).toBeInTheDocument();
    });

    it('CONTROL: no dot when the save in use is the newest', async () => {
        store({ name: 'acme-1a2b3c', version: NEWER.id.version, store: 'library' }, MINE, false, AT);
        await renderView();
        expect(within(card('acme-1a2b3c')).queryByRole('button', { name: 'Newer version available' })).not.toBeInTheDocument();
    });

    // J9-1: a Demo Builder datapack updated in the library lights the dot too (J4-1 left it dark).
    it('lights the dot on a Demo Builder datapack with a newer version', async () => {
        const team = (version: string) => makeSummary('luma', version, { displayName: 'Luma', store: 'library', team: true });
        store({ name: 'luma', version: '20261101-090000', store: 'library' }, [team('20261101-090000'), team('20261110-091500'), ...CATALOG], false, AT);
        await renderView();
        expect(within(card('luma')).getByRole('button', { name: 'Newer version available' })).toBeInTheDocument();
    });

    it('keeps the dot while an update left data types on the older version', async () => {
        store({ name: 'acme-1a2b3c', version: NEWER.id.version, store: 'library' }, MINE, false, AT, true);
        await renderView();
        expect(within(card('acme-1a2b3c')).getByRole('button', { name: 'Newer version available' })).toBeInTheDocument();
    });

    it('CONTROL: no dot without an install record, though a later save exists', async () => {
        store({ name: 'acme-1a2b3c', version: OLDER.id.version, store: 'library' });
        await renderView();
        expect(within(card('acme-1a2b3c')).getByTestId('datapack-card-project-check')).toBeInTheDocument();
        expect(within(card('acme-1a2b3c')).queryByRole('button', { name: 'Newer version available' })).not.toBeInTheDocument();
    });
});

/** When Demo Builder's engine installed the demo's pack: what a save builds on. */
const AT = '2026-11-08T03:20:44.746Z';
const OWN: Held = { name: 'acme-1a2b3c', version: OLDER.id.version, store: 'library' };
const TEAM = makeSummary('luma', 'eds-compatible', { displayName: 'Luma', store: 'library', mine: true, team: true });
/** The open flyout: the header has its own save button (owner, 2026-11-09). */
const inFlyout = () => within(screen.getByRole('dialog', { name: / details$/ }));
/** Press a row of the datapack's flyout: where its saves are (walk F219). */
async function fromFlyout(packName: string, row: string): Promise<void> {
    await press(card(packName));
    await press(await inFlyout().findByRole('button', { name: row }));
}
/** The open save window, by its title. */
async function inWindow(title: string | RegExp): Promise<ReturnType<typeof within>> {
    return within((await screen.findByRole('heading', { name: title })).closest('[role="dialog"]') as HTMLElement);
}

// Walk F219 (owner, 2026-11-17): saving the demo's datapack lives in its flyout, under its main action.
// The save itself is the mockup's (owner, 2026-11-09, F83): into the demo's pack when it is the SC's,
// else into a new pack of theirs.
describe('saving the demo\'s datapack', () => {
    it("offers Update and Save As New in the flyout of the demo's own pack, under Restore, and no Copy", async () => {
        store({ ...OWN, version: NEWER.id.version }, MINE, true, AT);
        await renderView();
        await press(card('acme-1a2b3c'));

        // The demo's installed pack: its main action is Restore, in place of Install (Phase 5, J4-2).
        // Save as File keeps a copy as a file; it saves nothing into a datapack.
        expect(await inFlyout().findByRole('button', { name: 'Restore Acme Bodea' })).toBeInTheDocument();
        // The saves sit right under the main action, Update first.
        const order = ['Restore Acme Bodea', 'Update Acme Bodea', 'Save As New', 'Save as File'].map((name) => inFlyout().getByRole('button', { name }));
        const all = inFlyout().getAllByRole('button');
        const at = order.map((button) => all.indexOf(button));
        expect(at).toEqual([at[0], at[0] + 1, at[0] + 2, at[0] + 3]);
        // Owner, 2026-11-06: Copy to the Data Installer is off until our accounts can write to it.
        expect(screen.queryByRole('button', { name: 'Copy to the Data Installer' })).not.toBeInTheDocument();
    });

    // J9-1: with a newer version waiting, Install Newer Version is the main action, and Restore is nowhere.
    it("makes Install Newer Version the main action while a newer version waits, with no Restore anywhere", async () => {
        store(OWN, MINE, false, AT);
        await renderView();
        await press(card('acme-1a2b3c'));

        expect(await inFlyout().findByRole('button', { name: 'Install Newer Version' })).toBeInTheDocument();
        expect(inFlyout().queryByRole('button', { name: /Restore/u })).not.toBeInTheDocument();
        expect(inFlyout().getByRole('button', { name: 'Uninstall' })).not.toHaveClass('is-danger');
    });

    it("offers Save As New alone in the flyout of a team pack the demo uses", async () => {
        store({ name: 'luma', version: 'eds-compatible', store: 'library' }, [TEAM, ...CATALOG], false, AT);
        await renderView();
        await press(card('luma'));

        expect(await inFlyout().findByRole('button', { name: 'Restore Luma' })).toBeInTheDocument();
        expect(inFlyout().getByRole('button', { name: 'Save As New' })).toBeInTheDocument();
        expect(inFlyout().queryByRole('button', { name: /^Update/u })).not.toBeInTheDocument();
    });

    it("offers no save on another datapack's flyout, only on the one the demo holds", async () => {
        store(OWN, MINE, false, AT);
        await renderView();
        await press(card('bodea'));

        expect(await inFlyout().findByRole('button', { name: /^(Install|Switch to)/u })).toBeInTheDocument();
        expect(inFlyout().queryByRole('button', { name: /^(Update|Save As New)/u })).not.toBeInTheDocument();
    });

    it("saves into the SC's own pack from its flyout, with no name", async () => {
        store(OWN, MINE, false, AT);
        await renderView();

        await fromFlyout('acme-1a2b3c', 'Update Acme Bodea');
        const saveWindow = await inWindow('Update Acme Bodea');
        // Review Records, Cancel and Save: Save As New is the header's (J3-1).
        expect(saveWindow.queryByRole('button', { name: 'Save As New' })).not.toBeInTheDocument();
        await press(saveWindow.getByRole('button', { name: 'Save' }));

        expect(mockPost).toHaveBeenCalledWith('save-store-changes-to-pack', {
            datapackName: 'acme-1a2b3c',
            version: OLDER.id.version,
            source: 'library',
            confirm: true,
            id: 'datapack-save',
            progress: 'modal',
        });
    });

    it("saves another SC's pack to a new pack of yours under the name typed, from its flyout", async () => {
        store({ name: 'bodea', version: 'main' }, MINE, false, AT);
        await renderView();

        await fromFlyout('bodea', 'Save As New');
        await change(await screen.findByRole('textbox', { name: /Datapack Name/ }), 'Luma Holiday');
        await press((await inWindow('Save As New Datapack')).getByRole('button', { name: 'Save' }));

        expect(mockPost).toHaveBeenCalledWith('save-store-changes-to-pack', {
            datapackName: 'bodea',
            version: 'main',
            source: 'installer',
            saveAs: { displayName: 'Luma Holiday' },
            confirm: true,
            id: 'datapack-save',
            progress: 'modal',
        });
    });

    // J3-1: a save as a new datapack ends on its name, "Saved as Luma Holiday".
    it('ends a save as a new datapack on "Saved as" its name', async () => {
        store({ name: 'bodea', version: 'main' }, MINE, false, AT);
        await renderView();
        await fromFlyout('bodea', 'Save As New');
        await change(await screen.findByRole('textbox', { name: /Datapack Name/ }), 'Luma Holiday');
        await press((await inWindow('Save As New Datapack')).getByRole('button', { name: 'Save' }));

        await push({ id: 'datapack-save', state: 'succeeded' });

        expect(await findResult('Luma Holiday', 'Saved')).toBeInTheDocument();
    });

    it('reads the catalog again when the save finishes, once, without waiting for Close', async () => {
        store(OWN, MINE, false, AT);
        await renderView();
        await fromFlyout('acme-1a2b3c', 'Update Acme Bodea');
        await press((await inWindow('Update Acme Bodea')).getByRole('button', { name: 'Save' }));
        const before = catalogReads();

        await push({ id: 'datapack-save', state: 'succeeded' });
        await push({ id: 'datapack-save', state: 'succeeded' });

        await waitFor(() => expect(catalogReads()).toBe(before + 1));
    });

    // J3-1 (owner, 2026-11-12: "3-1 is good"): a save into the SC's own datapack ends on where it went.
    it('ends on the datapack Updated, thing named, no version', async () => {
        store(OWN, MINE, false, AT);
        await renderView();
        await fromFlyout('acme-1a2b3c', 'Update Acme Bodea');
        await press((await inWindow('Update Acme Bodea')).getByRole('button', { name: 'Save' }));

        await push({ id: 'datapack-save', state: 'succeeded' });

        expect(await findResult('Acme Bodea', 'Updated')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: /Acme Bodea Saved/u })).not.toBeInTheDocument();
    });
});

// The header's save button, one state (step-04 S1; decisions Phase 7 and 7b): Create with no datapack,
// Save ▾ on the SC's own, Save As New on someone else's, Create with no install record (step-07 P3).
describe('the header button', () => {
    // Create is two windows (step-04 S3; J3-2): the picks, everything ticked, then the name; the run
    // ends on "Acme Test" over "Created" (P4-Q1; walk F222: the thing is the title).
    it('reads Create while the demo has no datapack, and creates from the picks under the name typed', async () => {
        store(undefined);
        const answering = mockRequest.getMockImplementation();
        mockRequest.mockImplementation((type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return answering?.(type, payload);
            // One item of every kind, so every kind ticked whole has something to hand on.
            const kind = payload?.dataType ?? '';
            const items = [{ id: `${kind}-1`, displayName: `${kind} 1`, key: `${kind}-1` }];
            return Promise.resolve({ success: true, data: { items, totalCount: items.length, excludedCount: 0, inPackCount: 0 } });
        });
        await renderView();

        await press(screen.getByRole('button', { name: 'Create' }));
        const picks = await inWindow('Create Datapack');
        expect(picks.getByRole('checkbox', { name: 'Select All Data' })).toBeChecked();
        const lists = () => mockRequest.mock.calls.filter((call) => call[0] === 'list-datapack-export-items').length;
        const opened = lists();
        await press(picks.getByRole('button', { name: 'Next' }));
        expect(lists()).toBe(opened);
        await change(await screen.findByRole('textbox', { name: /Datapack Name/ }), 'Acme Test');
        await press((await inWindow('Create Datapack')).getByRole('button', { name: 'Create' }));

        // Every kind ticked whole goes as a kind: the save lists it, nothing is read on Next (step-07 E2).
        expect(mockPost).toHaveBeenCalledWith('save-store-changes-to-pack', {
            wholeKinds: PICKABLE_KINDS,
            saveAs: { displayName: 'Acme Test' },
            confirm: true,
            id: 'datapack-save',
            progress: 'modal',
        });
        await push({ id: 'datapack-save', state: 'succeeded' });
        expect(await findResult('Acme Test', 'Created')).toBeInTheDocument();
    });

    // Step-07 P3 (owner, 2026-11-14, rule 6): Create where Save would be, and no line saying why.
    it("reads Create, with no line, when Demo Builder did not install the demo's datapack", async () => {
        store(OWN);
        await renderView();

        expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^(Save|Save As New)$/u })).not.toBeInTheDocument();
        expect(screen.queryByText(/install record/iu)).not.toBeInTheDocument();
    });

    // Walk F219: the header reads Create whatever the demo holds; its saves are in the flyout.
    it("reads Create on the SC's own datapack, with no Save menu", async () => {
        store(OWN, MINE, false, AT);
        await renderView();

        expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^(Save|Save As New)$/u })).not.toBeInTheDocument();
    });

    it("makes a new datapack from the SC's own with its flyout's Save As New, the name empty", async () => {
        store(OWN, MINE, false, AT);
        await renderView();

        await fromFlyout('acme-1a2b3c', 'Save As New');

        expect(await screen.findByRole('heading', { name: 'Save As New Datapack' })).toBeInTheDocument();
        // From the SC's own datapack the name starts empty (J3-1).
        expect(screen.getByRole('textbox', { name: /Datapack Name/ })).toHaveValue('');
    });

    it("saves a team datapack to a new datapack of yours with its flyout's Save As New", async () => {
        store({ name: 'luma', version: 'eds-compatible', store: 'library' }, [TEAM, ...CATALOG], false, AT);
        await renderView();

        await fromFlyout('luma', 'Save As New');

        expect(await screen.findByRole('heading', { name: 'Save As New Datapack' })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: /Datapack Name/ })).toHaveValue('My Luma');
    });
});
