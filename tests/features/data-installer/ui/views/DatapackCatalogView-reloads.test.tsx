/**
 * DatapackCatalogView — the requests it fires AGAIN, and the two doors out.
 *
 * Everything here is a second read: the refresh button re-asking with the
 * community toggle as it stands NOW, the import modal's close re-reading which
 * pack this project holds, and the flyout's Try Again re-asking for the detail
 * of the card that is actually open. Each one is a callback holding a value that
 * changed after it was created, which is exactly what a stale dependency list
 * gets wrong — silently, because the button still works, just with yesterday's
 * argument.
 *
 * The two doors are the configuration refusal's Open Settings and the export
 * link, neither of which had a test.
 */

import { render, screen, waitFor, within } from '@testing-library/react';

import { mockPostMessage } from '../../../../helpers/webviewClientMock';
import { press, settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';

import {
    SOURCE_NOTICE_COPY,
    DatapackCatalogView,
    mockRequest,
    requestOfType,
    resolveWith,
    resolveCatalogThenDetail,
    CATALOG,
    INVENTORY_WITH_GAP,
    showSelect,
} from './DatapackCatalogView.testUtils';

/** How many times a request of this type has been sent. */
function countOf(type: string): number {
    return mockRequest.mock.calls.filter((call) => call[0] === type).length;
}

beforeEach(() => {
    mockRequest.mockReset();
    mockPostMessage.mockReset();
});

describe('refresh', () => {
    it('asks for every pack again, whatever the Show list is on', async () => {
        resolveWith(CATALOG);
        render(<DatapackCatalogView />);
        await settle();
        await screen.findAllByTestId('datapack-card');

        await press(screen.getByRole('button', { name: /refresh datapacks/i }));

        await waitFor(() =>
            expect(requestOfType('find-datapacks')).toEqual({
                type: 'find-datapacks',
                payload: { includeCommunity: true },
            }),
        );
    });
});

describe('closing the import modal re-reads what this project holds', () => {
    /** Open the flyout for the first card, then its import modal. */
    async function openImport(): Promise<void> {
        render(<DatapackCatalogView />);
        await settle();
        const cards = await screen.findAllByTestId('datapack-card');
        await press(cards[0]);
        await settle();
        await press(await screen.findByRole('button', { name: /^install$/i }));
        await settle();
        await settle();
    }

    it('asks the service again, scoped to this project’s instance', async () => {
        // The modal is what changes the answer: the handler records the pack on
        // an accepted import and clears it on a removal. Without this re-read the
        // catalog keeps the copy it took on mount — import a pack and no card
        // changes, remove one and the check stays.
        resolveCatalogThenDetail(INVENTORY_WITH_GAP);
        await openImport();
        const targetsBefore = countOf('get-datapack-import-target');
        const installedBefore = countOf('list-installed-datapacks');

        // A first install's summary commits, so its way out is Cancel (step 03, S4).
        await press(screen.getByRole('button', { name: /^cancel$/i }));

        expect(countOf('get-datapack-import-target')).toBeGreaterThan(targetsBefore);
        expect(countOf('list-installed-datapacks')).toBeGreaterThan(installedBefore);
        expect(requestOfType('list-installed-datapacks')).toEqual({
            type: 'list-installed-datapacks',
            payload: { commerceInstance: 'inst' },
        });
    });

    it('asks for no installed list when the project names no instance', async () => {
        // The list is scoped BY instance, so without one there is nothing to
        // scope to and the request would be asking about no box in particular.
        mockRequest.mockImplementation((type: string) => {
            if (type === 'find-datapacks') {
                return Promise.resolve({
                    success: true,
                    data: { items: CATALOG, count: CATALOG.length, total: CATALOG.length },
                });
            }
            if (type === 'get-datapack-detail') {
                return Promise.resolve({
                    success: true,
                    data: {
                        detail: { ...CATALOG[0], description: 'B2B office supplies' },
                        inventory: INVENTORY_WITH_GAP,
                    },
                });
            }
            if (type === 'get-datapack-import-target') {
                return Promise.resolve({ success: true, data: { projectName: 'demo-1' } });
            }
            return Promise.resolve({ success: true, data: null });
        });
        await openImport();

        await press(screen.getByRole('button', { name: /^close$/i }));

        expect(countOf('list-installed-datapacks')).toBe(0);
    });
});

describe('the flyout’s Retry', () => {
    /** Catalog loads; every detail request refuses. */
    function detailAlwaysFails(): void {
        mockRequest.mockImplementation((type: string) => {
            if (type === 'find-datapacks') {
                return Promise.resolve({
                    success: true,
                    data: { items: CATALOG, count: CATALOG.length, total: CATALOG.length },
                });
            }
            if (type === 'get-datapack-detail') {
                return Promise.resolve({ success: false, error: 'detail unavailable' });
            }
            return Promise.resolve({ success: true, data: null });
        });
    }

    it('re-asks for the card that is open, at the version it was opened on', async () => {
        // The retry closes over `selected`, which is undefined until a card is
        // pressed. Held from the first render it never becomes anything, and the
        // button does nothing at all.
        detailAlwaysFails();
        render(<DatapackCatalogView />);
        await settle();
        const cards = await screen.findAllByTestId('datapack-card');
        await press(cards[0]);
        await settle();
        const before = countOf('get-datapack-detail');

        await press(await screen.findByRole('button', { name: /retry/i }));

        expect(countOf('get-datapack-detail')).toBeGreaterThan(before);
        expect(requestOfType('get-datapack-detail')).toEqual({
            type: 'get-datapack-detail',
            payload: { datapackName: 'bodea', version: 'main', store: 'installer' },
        });
    });
});

describe('the two doors out of the catalog', () => {
    // The choice is for an SC the Data Installer answers: one with no address, or one it turns
    // away, has no such packs to choose (owner, 2026-11-03). No address shows no banner either.
    it.each([
        ['has no address', 'no-address', false],
        ['turns the Adobe account away', 'no-access', true],
    ] as const)('offers no Data Installer choice while the Data Installer %s', async (_how, missing, banner) => {
        mockRequest.mockResolvedValue({
            success: true,
            data: { items: CATALOG, count: CATALOG.length, installerMissing: missing },
        });
        render(<DatapackCatalogView />);
        await settle();
        await screen.findAllByTestId('datapack-card');

        const choices = within(showSelect());
        expect(choices.queryByRole('option', { name: 'Data Installer Datapacks', hidden: true })).not.toBeInTheDocument();
        // CONTROL: the choice beside it is there.
        expect(choices.getByRole('option', { name: 'Community Datapacks', hidden: true })).toBeInTheDocument();
        expect(Boolean(screen.queryByTestId('datapack-source-notice'))).toBe(banner);
    });

    // Only "no access" closes: it is true on every visit and the SC cannot fix it (owner, 2026-11-03).
    it('closes the "no access" banner, and tells the extension to remember it', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { items: CATALOG, count: CATALOG.length, installerMissing: 'no-access' } });
        render(<DatapackCatalogView />);
        await settle();
        await screen.findAllByTestId('datapack-card');

        await press(screen.getByRole('button', { name: SOURCE_NOTICE_COPY.dismiss }));

        expect(screen.queryByTestId('datapack-source-notice')).not.toBeInTheDocument();
        expect(mockPostMessage).toHaveBeenCalledWith('dismiss-datapack-no-access');
    });

    it('shows nothing for "no access" once dismissed, and offers no close on "didn\'t answer"', async () => {
        mockRequest.mockResolvedValue({
            success: true,
            data: { items: CATALOG, count: CATALOG.length, installerMissing: 'no-access', noAccessDismissed: true },
        });
        const { unmount } = render(<DatapackCatalogView />);
        await settle();
        await screen.findAllByTestId('datapack-card');
        expect(screen.queryByTestId('datapack-source-notice')).not.toBeInTheDocument();
        unmount();

        mockRequest.mockResolvedValue({ success: true, data: { items: CATALOG, count: CATALOG.length, installerMissing: 'no-answer' } });
        render(<DatapackCatalogView />);
        await settle();
        await screen.findAllByTestId('datapack-card');
        // CONTROL: the banner is there, with no way to close it.
        expect(screen.getByTestId('datapack-source-notice')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: SOURCE_NOTICE_COPY.dismiss })).not.toBeInTheDocument();
    });

    it('offers the Data Installer choice while it answers', async () => {
        resolveWith(CATALOG);
        render(<DatapackCatalogView />);
        await settle();
        await screen.findAllByTestId('datapack-card');

        expect(within(showSelect()).getByRole('option', { name: 'Data Installer Datapacks', hidden: true })).toBeInTheDocument();
    });

    // 2026-10-30 (owner): one Create datapack in place of "Export from this instance" and "Save
    // from this store", quiet buttons rather than links; Clear demo data last. Step-04 S1: the
    // button reads Create, and the file action Install from File in a project's Datapacks.
    it(
        'offers Create, Install from File and, last, Clear Demo Data',
        async () => {
            mockRequest.mockResolvedValue({
                success: true,
                data: { items: CATALOG, count: CATALOG.length, total: CATALOG.length },
            });
            render(<DatapackCatalogView />);
            await settle();
            await screen.findAllByTestId('datapack-card');

            const labels = ['Create', 'Install from File', 'Clear Demo Data'];
            const buttons = labels.map((name) => screen.getByRole('button', { name }));
            expect(buttons.every((button, i) => i === 0 || buttons[i - 1].compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
            expect(screen.queryByText('Export from this instance')).not.toBeInTheDocument();
            expect(screen.queryByText('Save from this store')).not.toBeInTheDocument();
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        },
    );

    // Save As with no name yet: the name first, then the picks (2026-11-03). The service's own
    // export window it opened with the service's engine was deleted on 2026-11-06 (DI-12).
    it("opens Create's name screen first, empty", async () => {
        mockRequest.mockResolvedValue({ success: true, data: { items: CATALOG, count: CATALOG.length, total: CATALOG.length } });
        render(<DatapackCatalogView />);
        await settle();
        await screen.findAllByTestId('datapack-card');

        await press(screen.getByRole('button', { name: 'Create' }));

        expect(await screen.findByRole('heading', { name: 'Create Datapack' })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: /Datapack Name/ })).toHaveValue('');
        expect(screen.getByRole('button', { name: 'Continue' })).toHaveAttribute('aria-disabled', 'true');
    });
});

describe('a response carrying no page at all', () => {
    it('is not treated as loaded — the count row stays away', async () => {
        // `hasLoadedOnce` is what tells the header a real answer has arrived. A
        // successful envelope with no page is not one, and counting zero of
        // something never received would be a number the user cannot trust.
        mockRequest.mockResolvedValue({ success: true, data: null });
        render(<DatapackCatalogView />);
        await settle();

        expect(await screen.findByText('No Datapacks Yet')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: /community/i })).not.toBeInTheDocument();
    });
});
