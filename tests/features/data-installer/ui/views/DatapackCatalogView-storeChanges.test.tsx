/**
 * DatapackCatalogView — the demo's own datapack in the library, and Save Changes from its flyout
 * (owner, 2026-11-04, `.rptc/plans/datapack-save-as/`).
 *
 * The pack the project installs from and resets to is one of the library's cards, wearing the
 * check, wherever it lives. Its flyout leads with Save Changes when the pack is the SC's own. A new
 * pack is the header's Create Datapack. A finished save reads the catalog again at once, so Close only closes.
 */

import { act, render, screen, waitFor, within } from '@testing-library/react';
import { change, press, settle } from '../../../../helpers/reactSettle';
import { mockOnMessage } from '../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';
import { CATALOG, DatapackCatalogView, INVENTORY_COMPLETE, makeSummary, mockPost, mockRequest } from './DatapackCatalogView.testUtils';
import { versionLabel } from '@/features/data-installer/packVersions';
import type { DatapackSummary } from '@/features/data-installer/types';

/** The SC's own library pack, in two versions; the demo uses the older. */
const OLDER = makeSummary('acme-1a2b3c', '20261101-090000', { displayName: 'Acme Bodea', store: 'library', mine: true });
const NEWER = makeSummary('acme-1a2b3c', '20261103-120000', { displayName: 'Acme Bodea', store: 'library', mine: true });
const MINE = [OLDER, NEWER, ...CATALOG];

type Held = { name: string; version: string; store?: 'library' | 'installer' } | undefined;

/** The catalog, the open project's recorded pack, and the flyout's detail for whichever card opens. */
function store(datapack: Held, items: DatapackSummary[] = MINE, installerOn = false, installedAt?: string) {
    mockRequest.mockImplementation((type: string, payload?: { datapackName?: string; version?: string }) => {
        if (type === 'find-datapacks') return Promise.resolve({ success: true, data: { items, count: items.length, total: items.length, ...(installerOn ? { installerOn } : {}) } });
        if (type === 'get-datapack-import-target') return Promise.resolve({ success: true, data: { instance: 'inst', projectName: 'acme', datapack, ...(installedAt ? { installedAt } : {}) } });
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

    // Owner, 2026-11-09 (walk F99): a pack of saves is one thing; a later save is not a newer version.
    it('shows the save in use with no version picker and no newer dot, though a later save exists', async () => {
        const items = [{ ...OLDER, createdAt: '2026-11-01T09:00:00Z' }, { ...NEWER, createdAt: '2026-11-03T12:00:00Z' }];
        store({ name: 'acme-1a2b3c', version: OLDER.id.version, store: 'library' }, items);
        await renderView();

        expect(within(card('acme-1a2b3c')).getByText(`Saved ${versionLabel(OLDER.id.version)}`)).toBeInTheDocument();
        expect(within(card('acme-1a2b3c')).queryByRole('button', { name: /Version of/u })).not.toBeInTheDocument();
        expect(within(card('acme-1a2b3c')).queryByRole('button', { name: /Newer|Updated/u })).not.toBeInTheDocument();
    });
});

/** When Demo Builder's engine installed the demo's pack: what a save builds on. */
const AT = '2026-11-08T03:20:44.746Z';
const OWN: Held = { name: 'acme-1a2b3c', version: OLDER.id.version, store: 'library' };
const TEAM = makeSummary('luma', 'eds-compatible', { displayName: 'Luma', store: 'library', mine: true, team: true });
/** The open flyout: the header has its own Save Changes (owner, 2026-11-09). */
const inFlyout = () => within(screen.getByRole('dialog', { name: / details$/ }));

// Owner, 2026-11-09 (the save mockup, F83): Save Changes on the demo's pack, whoever owns it; into
// it when it is the SC's, else into a new pack of theirs, saying why.
describe('Save Changes, in the flyout', () => {
    it("leads the flyout of the demo's own pack, and saves into it with no name", async () => {
        store(OWN, MINE, false, AT);
        await renderView();
        await press(card('acme-1a2b3c'));

        await press(await inFlyout().findByRole('button', { name: 'Save Changes' }));
        expect(await screen.findByRole('heading', { name: 'Save Changes' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save As New' })).toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Save' }));

        expect(mockPost).toHaveBeenCalledWith('save-store-changes-to-pack', {
            datapackName: 'acme-1a2b3c',
            version: OLDER.id.version,
            source: 'library',
            confirm: true,
            id: 'datapack-save',
            progress: 'modal',
        });
    });

    it("is not offered when Demo Builder did not install the demo's pack: there is nothing to build on", async () => {
        store(OWN);
        await renderView();
        await press(card('acme-1a2b3c'));

        // CONTROL: the flyout is open, with Import.
        expect(await screen.findByRole('button', { name: 'Install' })).toBeInTheDocument();
        expect(inFlyout().queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    });

    // Owner, 2026-11-09: "Save Changes" on a team pack read as changing it; it is named for what it does.
    it('is offered on a team pack as Save As New Datapack, and says the new pack is yours', async () => {
        store({ name: 'luma', version: 'eds-compatible', store: 'library' }, [TEAM, ...CATALOG], false, AT);
        await renderView();
        await press(card('luma'));

        expect(inFlyout().queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
        await press(await inFlyout().findByRole('button', { name: 'Save As New Datapack' }));

        expect(await screen.findByRole('heading', { name: 'Save As New Datapack' })).toBeInTheDocument();
        expect(screen.getByText("Saves this demo's data as a new datapack.")).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: /Datapack Name/ })).toHaveValue('');
    });

    it("is offered on another SC's pack, and saves to a new pack of yours", async () => {
        store({ name: 'bodea', version: 'main' }, MINE, false, AT);
        await renderView();
        await press(card('bodea'));

        await press(await inFlyout().findByRole('button', { name: 'Save As New Datapack' }));

        expect(await screen.findByText("Saves this demo's data as a new datapack.")).toBeInTheDocument();
    });

    // Owner, 2026-11-06: Copy to the Data Installer is off until our accounts can write to it.
    it('sits beside Import while the Data Installer is on, with no Copy to it', async () => {
        store(OWN, MINE, true, AT);
        await renderView();
        await press(card('acme-1a2b3c'));

        expect(await inFlyout().findByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
        // The demo's installed pack: its main button is Restore, in place of Install (Phase 5, J4-2).
        expect(screen.getByRole('button', { name: 'Restore Acme Bodea' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Copy to the Data Installer' })).not.toBeInTheDocument();
    });

    it('reads the catalog again when the save finishes, once, without waiting for Close', async () => {
        store(OWN, MINE, false, AT);
        await renderView();
        await press(card('acme-1a2b3c'));
        await press(await inFlyout().findByRole('button', { name: 'Save Changes' }));
        await press(await screen.findByRole('button', { name: 'Save' }));
        const before = catalogReads();

        await push({ id: 'datapack-save', state: 'succeeded' });
        await push({ id: 'datapack-save', state: 'succeeded' });

        await waitFor(() => expect(catalogReads()).toBe(before + 1));
    });

    // J3-1 (owner, 2026-11-12: "3-1 is good"): a save into the SC's own datapack ends on where it went.
    it('ends on "Saved to" the datapack, thing named, no version', async () => {
        store(OWN, MINE, false, AT);
        await renderView();
        await press(card('acme-1a2b3c'));
        await press(await inFlyout().findByRole('button', { name: 'Save Changes' }));
        await press(await screen.findByRole('button', { name: 'Save' }));

        await push({ id: 'datapack-save', state: 'succeeded' });

        expect(await screen.findByRole('heading', { name: /Saved to Acme Bodea$/u })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: /Acme Bodea Saved/u })).not.toBeInTheDocument();
    });
});

// Owner, 2026-11-09 (the save mockup): the header is Create Datapack until the demo has a pack, then
// the same Save Changes as the flyout's.
describe('the header button', () => {
    it("says Create Datapack, from nothing, while the demo has no pack Demo Builder installed", async () => {
        store(OWN);
        await renderView();

        await press(screen.getByRole('button', { name: 'Create Datapack' }));

        expect(await screen.findByRole('heading', { name: 'Create Datapack' })).toBeInTheDocument();
        await change(screen.getByRole('textbox', { name: /Datapack Name/ }), 'Acme Test');
        await press(screen.getByRole('button', { name: 'Continue' }));
        expect(await screen.findByText("Select what to include from this demo's Commerce instance.")).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create' })).toHaveAttribute('aria-disabled', 'true');
    });

    it('says Save Changes once it has, and saves into your own pack as the flyout does', async () => {
        store(OWN, MINE, false, AT);
        await renderView();

        expect(screen.queryByRole('button', { name: 'Create Datapack' })).not.toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Save Changes' }));

        expect(await screen.findByText('Saves everything this demo uses as a new version of Acme Bodea.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'false');
    });

    it('says Save As New Datapack on a team pack, and saves to a new pack of yours, as the flyout does', async () => {
        store({ name: 'luma', version: 'eds-compatible', store: 'library' }, [TEAM, ...CATALOG], false, AT);
        await renderView();

        expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Save As New Datapack' }));

        expect(await screen.findByRole('heading', { name: 'Save As New Datapack' })).toBeInTheDocument();
        expect(screen.getByText("Saves this demo's data as a new datapack.")).toBeInTheDocument();
    });
});
