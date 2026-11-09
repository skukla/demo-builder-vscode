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
        expect(card('acme-1a2b3c')).toHaveAccessibleName(`Acme Bodea, version ${OLDER.id.version}`);
        // CONTROL: a pack the demo does not use wears none.
        expect(within(card('wknd')).queryByTestId('datapack-card-project-check')).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: "This Demo's Datapack" })).not.toBeInTheDocument();
    });

    // Owner, 2026-11-07: the dot's words, on hover, in the version list's own word for a change.
    it('marks a later save on the card: a newer version is in the list', async () => {
        const items = [{ ...OLDER, createdAt: '2026-11-01T09:00:00Z' }, { ...NEWER, createdAt: '2026-11-03T12:00:00Z' }];
        store({ name: 'acme-1a2b3c', version: OLDER.id.version, store: 'library' }, items);
        await renderView();

        expect(within(card('acme-1a2b3c')).getByRole('button', { name: 'Newer version available' })).toBeInTheDocument();
    });
});

describe('Save Changes, in the flyout', () => {
    it("leads the flyout of the demo's own pack, and saves into it with no name", async () => {
        store({ name: 'acme-1a2b3c', version: OLDER.id.version, store: 'library' });
        await renderView();
        await press(card('acme-1a2b3c'));

        await press(await screen.findByRole('button', { name: 'Save Changes' }));
        expect(await screen.findByRole('heading', { name: 'Save Acme Bodea' })).toBeInTheDocument();
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

    it("is not offered on a pack that is not the SC's", async () => {
        store({ name: 'bodea', version: 'main' });
        await renderView();
        await press(card('bodea'));

        // CONTROL: the flyout is open, with Import.
        expect(await screen.findByRole('button', { name: 'Import' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    });

    // Owner, 2026-11-08 (F80): every demo is made from a team pack, so not even its owner saves into it.
    it('is not offered on a team pack, even to its owner', async () => {
        const TEAM = makeSummary('luma', 'eds-compatible', { displayName: 'Luma', store: 'library', mine: true, team: true });
        store({ name: 'luma', version: 'eds-compatible', store: 'library' }, [TEAM, ...CATALOG]);
        await renderView();
        await press(card('luma'));

        // CONTROL: the flyout is open, with Import.
        expect(await screen.findByRole('button', { name: 'Import' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    });

    // Owner, 2026-11-06: Copy to the Data Installer is off until our accounts can write to it.
    it('sits beside Import while the Data Installer is on, with no Copy to it', async () => {
        store({ name: 'acme-1a2b3c', version: OLDER.id.version, store: 'library' }, MINE, true);
        await renderView();
        await press(card('acme-1a2b3c'));

        expect(await screen.findByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Copy to the Data Installer' })).not.toBeInTheDocument();
    });

    it('reads the catalog again when the save finishes, once, without waiting for Close', async () => {
        store({ name: 'acme-1a2b3c', version: OLDER.id.version, store: 'library' });
        await renderView();
        await press(card('acme-1a2b3c'));
        await press(await screen.findByRole('button', { name: 'Save Changes' }));
        await press(await screen.findByRole('button', { name: 'Save' }));
        const before = catalogReads();

        await push({ id: 'datapack-save', state: 'succeeded' });
        await push({ id: 'datapack-save', state: 'succeeded' });

        await waitFor(() => expect(catalogReads()).toBe(before + 1));
    });
});

// Owner, 2026-11-08 (F79): the save under Create Datapack starts from the demo's own pack, so the
// screen does too: it says so, and Create needs no pick.
describe('Create Datapack, on a demo holding a pack Demo Builder installed', () => {
    async function toPicks(): Promise<void> {
        await press(screen.getByRole('button', { name: 'Create Datapack' }));
        await change(screen.getByRole('textbox', { name: /Datapack Name/ }), 'Acme Test');
        await press(screen.getByRole('button', { name: 'Continue' }));
    }

    it('starts from that pack: says so, and offers Create with nothing selected', async () => {
        store({ name: 'acme-1a2b3c', version: OLDER.id.version, store: 'library' }, MINE, false, '2026-11-08T03:20:44.746Z');
        await renderView();

        await toPicks();

        expect(await screen.findByText(/Includes what Acme Bodea put in Commerce/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create' })).toHaveAttribute('aria-disabled', 'false');
    });

    it('starts from nothing when Demo Builder did not install it', async () => {
        store({ name: 'acme-1a2b3c', version: OLDER.id.version, store: 'library' });
        await renderView();

        await toPicks();

        expect(screen.queryByText(/Includes what/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create' })).toHaveAttribute('aria-disabled', 'true');
    });
});
