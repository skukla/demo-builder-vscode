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

import { render, screen, waitFor } from '@testing-library/react';

import { mockPostMessage } from '../../../../helpers/webviewClientMock';
import { press, settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';

import {
    DatapackCatalogView,
    mockRequest,
    requestOfType,
    resolveWith,
    resolveCatalogThenDetail,
    CATALOG,
    INVENTORY_WITH_GAP,
} from './DatapackCatalogView.testUtils';

/** How many times a request of this type has been sent. */
function countOf(type: string): number {
    return mockRequest.mock.calls.filter((call) => call[0] === type).length;
}

beforeEach(() => {
    mockRequest.mockReset();
    mockPostMessage.mockReset();
});

describe('refresh re-asks with the toggle as it stands now', () => {
    it('carries the community setting the user has actually chosen', async () => {
        // Curation is a SERVER-side filter, so the payload is the whole request.
        // A refresh built when the toggle was off goes on asking for the curated
        // list forever, and the button reads as broken with no error anywhere.
        resolveWith(CATALOG);
        render(<DatapackCatalogView />);
        await settle();
        await screen.findAllByTestId('datapack-card');

        await press(screen.getByRole('checkbox', { name: /community/i }));
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
        await press(await screen.findByRole('button', { name: /^import/i }));
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

        await press(screen.getByRole('button', { name: /^close$/i }));

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

describe('the flyout’s Try Again', () => {
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

        await press(await screen.findByRole('button', { name: /try again/i }));

        expect(countOf('get-datapack-detail')).toBeGreaterThan(before);
        expect(requestOfType('get-datapack-detail')).toEqual({
            type: 'get-datapack-detail',
            payload: { datapackName: 'bodea', version: 'main' },
        });
    });
});

describe('the two doors out of the catalog', () => {
    it('offers Open Settings on a configuration refusal, and opens them', async () => {
        // The refusal names two settings by key. Without the action the user is
        // told what is wrong and left to find Settings themselves.
        mockRequest.mockResolvedValue({
            success: false,
            error: 'The Data Installer is not configured.',
            code: 'INVALID_OPERATION',
        });
        render(<DatapackCatalogView />);
        await settle();

        await press(await screen.findByRole('button', { name: /open settings/i }));

        expect(mockPostMessage).toHaveBeenCalledWith('open-data-installer-settings');
    });

    it('opens the export modal from the header link, and closes it again', async () => {
        resolveWith(CATALOG);
        render(<DatapackCatalogView />);
        await settle();
        await screen.findAllByTestId('datapack-card');

        await press(screen.getByText('Export from this instance'));
        expect(await screen.findByText('Export a datapack')).toBeInTheDocument();

        await press(screen.getByRole('button', { name: /^close$/i }));

        expect(screen.queryByText('Export a datapack')).not.toBeInTheDocument();
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

        expect(await screen.findByText('No datapacks found')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: /community/i })).not.toBeInTheDocument();
    });
});
