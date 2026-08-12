/**
 * DatapackCatalogView tests.
 *
 * The catalog is one row per `(name, version)` — 40 rows for 25 names live — so
 * the view's first job is to render one CARD per name, not per row. Curation is
 * the second: 23 of the 40 live rows are `shared`, the rest developer scratch, so
 * the view asks for shared-only and the community toggle re-asks the SERVICE
 * rather than filtering what it already has (the handler owns that filter).
 *
 * `DatapackCard` renders for real here; only the transport is mocked. That is
 * deliberate — the grouping contract is what this view is for, and a mocked card
 * would assert nothing about it.
 *
 * Strict TDD: written BEFORE the view exists.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn() },
}));

// Below the mock on purpose (see useDataInstallerRequest's suite).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DatapackCatalogView } from '@/features/data-installer/ui/views/DatapackCatalogView';
import type { DatapackSummary } from '@/features/data-installer/types';

const mockRequest = webviewClient.request as jest.Mock;

/**
 * The type and payload of the most recent request.
 *
 * `webviewClient.request(type, payload, timeoutMs)` takes a third argument the
 * view leaves undefined, so asserting on the raw call array pins an argument
 * nothing here is about.
 */
function lastRequest(): { type: unknown; payload: unknown } {
    const call = mockRequest.mock.calls[mockRequest.mock.calls.length - 1] ?? [];
    return { type: call[0], payload: call[1] };
}

function makeSummary(
    name: string,
    version: string,
    overrides: Partial<DatapackSummary> = {},
): DatapackSummary {
    return {
        id: { name, version },
        displayName: name,
        shared: true,
        dataTypes: ['products'],
        art: {},
        ...overrides,
    };
}

/** Three names across five rows — the shape the live catalog actually has. */
const CATALOG = [
    makeSummary('bodea', 'main'),
    makeSummary('bodea', 'tierpricingfix'),
    makeSummary('wknd', 'main'),
    makeSummary('wknd', 'archive_06112026'),
    makeSummary('citisignal_new', 'main', { displayName: 'CitiSignal' }),
];

function resolveWith(items: DatapackSummary[]) {
    mockRequest.mockResolvedValue({
        success: true,
        data: { items, count: items.length, total: items.length },
    });
}

describe('DatapackCatalogView', () => {
    beforeEach(() => {
        mockRequest.mockReset();
    });

    it('shows the loading display while the first request is in flight', () => {
        mockRequest.mockReturnValue(new Promise(() => undefined));

        render(<DatapackCatalogView />);

        expect(screen.getByText(/loading datapacks/i)).toBeInTheDocument();
    });

    it('asks for the curated catalog first', async () => {
        resolveWith(CATALOG);

        render(<DatapackCatalogView />);

        await waitFor(() =>
            expect(lastRequest()).toEqual({
                type: 'find-datapacks',
                payload: { includeCommunity: false },
            }),
        );
    });

    it('renders one card per NAME, not per row', async () => {
        resolveWith(CATALOG);

        render(<DatapackCatalogView />);

        await waitFor(() => expect(screen.getAllByTestId('datapack-card')).toHaveLength(3));
    });

    it('defaults each card to the pack default version', async () => {
        resolveWith(CATALOG);

        render(<DatapackCatalogView />);

        const cards = await screen.findAllByTestId('datapack-card');
        expect(within(cards[0]).getByTestId('spectrum-picker')).toHaveTextContent('main');
    });

    it('keeps a per-card version pick', async () => {
        resolveWith(CATALOG);

        render(<DatapackCatalogView />);
        const cards = await screen.findAllByTestId('datapack-card');

        fireEvent.change(within(cards[0]).getByTestId('spectrum-picker-select'), {
            target: { value: 'tierpricingfix' },
        });

        expect(within(cards[0]).getByTestId('spectrum-picker')).toHaveTextContent('tierpricingfix');
        // The sibling card is untouched — selection is per pack, not global.
        expect(within(cards[1]).getByTestId('spectrum-picker')).toHaveTextContent('main');
    });

    describe('community toggle', () => {
        it('re-asks the service instead of filtering locally', async () => {
            resolveWith(CATALOG);

            render(<DatapackCatalogView />);
            await screen.findAllByTestId('datapack-card');

            fireEvent.click(screen.getByRole('checkbox', { name: /community/i }));

            await waitFor(() =>
                expect(lastRequest()).toEqual({
                    type: 'find-datapacks',
                    payload: { includeCommunity: true },
                }),
            );
        });
    });

    describe('search', () => {
        it('filters the cards by name', async () => {
            resolveWith(CATALOG);

            render(<DatapackCatalogView />);
            await screen.findAllByTestId('datapack-card');

            fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'wknd' } });

            expect(screen.getAllByTestId('datapack-card')).toHaveLength(1);
        });

        it('matches the display name too', async () => {
            resolveWith(CATALOG);

            render(<DatapackCatalogView />);
            await screen.findAllByTestId('datapack-card');

            fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'CitiSignal' } });

            expect(screen.getAllByTestId('datapack-card')).toHaveLength(1);
        });

        it('says so when nothing matches', async () => {
            resolveWith(CATALOG);

            render(<DatapackCatalogView />);
            await screen.findAllByTestId('datapack-card');

            fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing-here' } });

            expect(screen.queryAllByTestId('datapack-card')).toHaveLength(0);
            expect(screen.getByText(/no datapacks match/i)).toBeInTheDocument();
        });
    });

    describe('detail flyout', () => {
        /** Resolve find-datapacks, then the detail request that follows. */
        function resolveCatalogThenDetail() {
            mockRequest.mockImplementation((type: string) => {
                if (type === 'find-datapacks') {
                    return Promise.resolve({
                        success: true,
                        data: { items: CATALOG, count: CATALOG.length, total: CATALOG.length },
                    });
                }
                return Promise.resolve({
                    success: true,
                    data: {
                        detail: { ...CATALOG[0], description: 'B2B office supplies' },
                        inventory: {
                            present: ['products'],
                            missing: [],
                            presentCount: 1,
                            missingCount: 0,
                            requestedCount: 1,
                        },
                    },
                });
            });
        }

        it('stays closed until a card is pressed', async () => {
            resolveWith(CATALOG);

            render(<DatapackCatalogView />);
            await screen.findAllByTestId('datapack-card');

            expect(screen.getByRole('dialog', { hidden: true })).not.toHaveClass('open');
        });

        it('asks for the detail of the pressed card, at its selected version', async () => {
            resolveCatalogThenDetail();

            render(<DatapackCatalogView />);
            const cards = await screen.findAllByTestId('datapack-card');

            fireEvent.click(cards[0]);

            await waitFor(() =>
                expect(lastRequest()).toEqual({
                    type: 'get-datapack-detail',
                    payload: { datapackName: 'bodea', version: 'main' },
                }),
            );
        });

        it('opens the flyout with the loaded detail', async () => {
            resolveCatalogThenDetail();

            render(<DatapackCatalogView />);
            const cards = await screen.findAllByTestId('datapack-card');

            fireEvent.click(cards[0]);

            await waitFor(() => expect(screen.getByRole('dialog')).toHaveClass('open'));
            expect(await screen.findByText('B2B office supplies')).toBeInTheDocument();
        });

        it('follows the version the user picked', async () => {
            resolveCatalogThenDetail();

            render(<DatapackCatalogView />);
            const cards = await screen.findAllByTestId('datapack-card');

            fireEvent.change(within(cards[0]).getByTestId('spectrum-picker-select'), {
                target: { value: 'tierpricingfix' },
            });
            fireEvent.click(cards[0]);

            await waitFor(() =>
                expect(lastRequest()).toEqual({
                    type: 'get-datapack-detail',
                    payload: { datapackName: 'bodea', version: 'tierpricingfix' },
                }),
            );
        });

        it('closes from the flyout', async () => {
            resolveCatalogThenDetail();

            render(<DatapackCatalogView />);
            const cards = await screen.findAllByTestId('datapack-card');
            fireEvent.click(cards[0]);
            await waitFor(() => expect(screen.getByRole('dialog')).toHaveClass('open'));

            fireEvent.click(screen.getByRole('button', { name: /close details/i }));

            await waitFor(() =>
                expect(screen.getByRole('dialog', { hidden: true })).not.toHaveClass('open'),
            );
        });
    });

    describe('states', () => {
        it('shows an empty state for an empty catalog, keeping the toggle reachable', async () => {
            resolveWith([]);

            render(<DatapackCatalogView />);

            expect(await screen.findByText('No datapacks found')).toBeInTheDocument();
            expect(screen.getByRole('checkbox', { name: /community/i })).toBeInTheDocument();
        });

        // A refusal from the guard RETURNS rather than throws, so this is the
        // shape that reached the old connectivity line and was read as success.
        it('offers sign-in — never Retry — for a returned AUTH_REQUIRED refusal', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                error: 'Adobe sign-in is required.',
                code: 'AUTH_REQUIRED',
            });

            render(<DatapackCatalogView />);

            expect(await screen.findByText('Adobe sign-in required')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /sign in with adobe/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
        });

        it('names the settings for an INVALID_OPERATION refusal', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                error: 'No Data Installer API URL is configured.',
                code: 'INVALID_OPERATION',
            });

            render(<DatapackCatalogView />);

            expect(
                await screen.findByText('The Data Installer is not configured'),
            ).toBeInTheDocument();
            expect(screen.getByText(/demoBuilder\.dataInstaller\.apiBaseUrl/)).toBeInTheDocument();
        });

        it('retries a transport failure', async () => {
            mockRequest.mockRejectedValueOnce(new Error('Request timeout: find-datapacks'));
            resolveWith(CATALOG);

            render(<DatapackCatalogView />);
            const retry = await screen.findByRole('button', { name: /try again/i });

            fireEvent.click(retry);

            await waitFor(() => expect(screen.getAllByTestId('datapack-card')).toHaveLength(3));
        });
    });
});
