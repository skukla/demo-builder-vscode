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

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import { change, press, settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';

import {
    DatapackCatalogView,
    mockRequest,
    requestOfType,
    lastRequest,
    resolveWith,
    resolveCatalogThenDetail,
    CATALOG,
    INVENTORY_COMPLETE,
    INVENTORY_WITH_GAP,
} from './DatapackCatalogView.testUtils';

describe('DatapackCatalogView', () => {
    beforeEach(() => {
        mockRequest.mockReset();
    });

    it('shows the loading display while the first request is in flight', async () => {
        mockRequest.mockReturnValue(new Promise(() => undefined));

        render(<DatapackCatalogView />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        expect(screen.getByText(/loading datapacks/i)).toBeInTheDocument();
    });

    it('asks for the curated catalog first', async () => {
        resolveWith(CATALOG);

        render(<DatapackCatalogView />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        await waitFor(() =>
            expect(requestOfType('find-datapacks')).toEqual({
                type: 'find-datapacks',
                payload: { includeCommunity: false },
            })
        );
    });

    it('renders one card per NAME, not per row', async () => {
        resolveWith(CATALOG);

        render(<DatapackCatalogView />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        await waitFor(() => expect(screen.getAllByTestId('datapack-card')).toHaveLength(3));
    });

    it('defaults each card to the pack default version', async () => {
        resolveWith(CATALOG);

        render(<DatapackCatalogView />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        const cards = await screen.findAllByTestId('datapack-card');
        expect(within(cards[0]).getByTestId('spectrum-picker')).toHaveTextContent('main');
    });

    it('keeps a per-card version pick', async () => {
        resolveWith(CATALOG);

        render(<DatapackCatalogView />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();
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
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            await screen.findAllByTestId('datapack-card');

            await press(screen.getByRole('checkbox', { name: /community/i }));

            await waitFor(() =>
                expect(lastRequest()).toEqual({
                    type: 'find-datapacks',
                    payload: { includeCommunity: true },
                })
            );
        });
    });

    describe('search', () => {
        it('filters the cards by name', async () => {
            resolveWith(CATALOG);

            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            await screen.findAllByTestId('datapack-card');

            await change(screen.getByRole('searchbox'), 'wknd');

            expect(screen.getAllByTestId('datapack-card')).toHaveLength(1);
        });

        it('matches the display name too', async () => {
            resolveWith(CATALOG);

            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            await screen.findAllByTestId('datapack-card');

            await change(screen.getByRole('searchbox'), 'CitiSignal');

            expect(screen.getAllByTestId('datapack-card')).toHaveLength(1);
        });

        it('says so when nothing matches', async () => {
            resolveWith(CATALOG);

            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            await screen.findAllByTestId('datapack-card');

            await change(screen.getByRole('searchbox'), 'nothing-here');

            expect(screen.queryAllByTestId('datapack-card')).toHaveLength(0);
            expect(screen.getByText(/no datapacks match/i)).toBeInTheDocument();
        });
    });

    describe('detail flyout', () => {
        /** Resolve find-datapacks, then the detail request that follows. */
        it('stays closed until a card is pressed', async () => {
            resolveWith(CATALOG);

            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            await screen.findAllByTestId('datapack-card');

            expect(screen.getByRole('dialog', { hidden: true })).not.toHaveClass('open');
        });

        it('asks for the detail of the pressed card, at its selected version', async () => {
            resolveCatalogThenDetail(INVENTORY_COMPLETE);

            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            const cards = await screen.findAllByTestId('datapack-card');

            await press(cards[0]);

            await waitFor(() =>
                expect(lastRequest()).toEqual({
                    type: 'get-datapack-detail',
                    payload: { datapackName: 'bodea', version: 'main' },
                })
            );
        });

        it('opens the flyout with the loaded detail', async () => {
            resolveCatalogThenDetail(INVENTORY_COMPLETE);

            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            const cards = await screen.findAllByTestId('datapack-card');

            await press(cards[0]);

            await waitFor(() => expect(screen.getByRole('dialog')).toHaveClass('open'));
            expect(await screen.findByText('B2B office supplies')).toBeInTheDocument();
        });

        it('follows the version the user picked', async () => {
            resolveCatalogThenDetail(INVENTORY_COMPLETE);

            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            const cards = await screen.findAllByTestId('datapack-card');

            fireEvent.change(within(cards[0]).getByTestId('spectrum-picker-select'), {
                target: { value: 'tierpricingfix' },
            });
            await press(cards[0]);

            await waitFor(() =>
                expect(lastRequest()).toEqual({
                    type: 'get-datapack-detail',
                    payload: { datapackName: 'bodea', version: 'tierpricingfix' },
                })
            );
        });

        it('closes from the flyout', async () => {
            resolveCatalogThenDetail(INVENTORY_COMPLETE);

            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            const cards = await screen.findAllByTestId('datapack-card');
            await press(cards[0]);
            await waitFor(() => expect(screen.getByRole('dialog')).toHaveClass('open'));

            await press(screen.getByRole('button', { name: /close details/i }));

            await waitFor(() =>
                expect(screen.getByRole('dialog', { hidden: true })).not.toHaveClass('open')
            );
        });
    });

    /**
     * The import modal is mounted by the VIEW, not by the flyout.
     *
     * It used to be a child of the Drawer, which made it a dialog nested inside a
     * drawer — a shape no other surface here uses. `IntegrationsScreen` mounts its
     * flow modal at screen level, a sibling of the list, and keeps its detail
     * flyout view-only. This follows that.
     */
    describe('the import modal', () => {
        /** Open the flyout for the first card, then press its Import affordance. */
        async function openImport() {
            resolveCatalogThenDetail(INVENTORY_WITH_GAP);
            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            const cards = await screen.findAllByTestId('datapack-card');
            await press(cards[0]);
            // Opening a card fetches its detail, and the modal's checkbox list is
            // built from that detail's inventory. One settle round is not the same
            // as the findBy wait loop this replaced — the loop happened to give
            // the detail time to arrive. Settle explicitly instead of relying on
            // the timing of a query.
            await settle();
            await press(await screen.findByRole('button', { name: /^import/i }));
            // The modal is its own component with its own mount requests (its
            // import target and job status). Opening it is one interaction, but
            // its requests are only ISSUED once it has mounted — which the
            // press's own settle is what causes. So the responses need a further
            // round of their own.
            await settle();
            await settle();
        }

        it('is closed until Import is pressed', async () => {
            resolveCatalogThenDetail(INVENTORY_WITH_GAP);
            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            const cards = await screen.findAllByTestId('datapack-card');

            await press(cards[0]);
            await screen.findByRole('button', { name: /^import/i });

            expect(screen.queryByText('Commerce instance')).not.toBeInTheDocument();
        });

        it('opens when the flyout raises Import', async () => {
            await openImport();

            expect(
                await screen.findByRole('button', { name: /start import/i })
            ).toBeInTheDocument();
        });

        // The types on offer are what the service HOLDS, from the detail
        // inventory — never what the pack declares.
        it('offers only the data types the service stores', async () => {
            await openImport();
            await screen.findByRole('button', { name: /start import/i });

            screen.debug(undefined, 8000);
            expect(screen.getByRole('checkbox', { name: 'Products' })).toBeInTheDocument();
            expect(screen.queryByRole('checkbox', { name: 'Giftcards' })).not.toBeInTheDocument();
        });

        it('closes without closing the flyout behind it', async () => {
            await openImport();
            await screen.findByRole('button', { name: /start import/i });

            await press(screen.getByRole('button', { name: /^close$/i }));

            expect(screen.queryByText('Commerce instance')).not.toBeInTheDocument();
            // The flyout is still open — the modal was a sibling, not a child.
            expect(screen.getByRole('dialog', { hidden: true })).toHaveClass('open');
        });
    });

    describe('states', () => {
        it('shows an empty state for an empty catalog, keeping the toggle reachable', async () => {
            resolveWith([]);

            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();

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
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();

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
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();

            expect(
                await screen.findByText('The Data Installer is not configured')
            ).toBeInTheDocument();
            expect(screen.getByText(/demoBuilder\.dataInstaller\.apiBaseUrl/)).toBeInTheDocument();
        });

        it('retries a transport failure', async () => {
            mockRequest.mockRejectedValueOnce(new Error('Request timeout: find-datapacks'));
            resolveWith(CATALOG);

            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            const retry = await screen.findByRole('button', { name: /try again/i });

            await press(retry);

            await waitFor(() => expect(screen.getAllByTestId('datapack-card')).toHaveLength(3));
        });
    });
});

/**
 * The Stage 4 loop's visible end.
 *
 * The wizard records which pack a project was created to hold but never imports
 * it — an import needs a reachable instance and runs for minutes. So the panel
 * has to close the loop rather than making the user remember a name and find it
 * again among 25 of them.
 *
 * It closed it with a full-width bar above the grid ("<project> is set up for
 * <pack>" + a Review link). That bar is gone: the CARD carries the state now,
 * with the shared `SelectionCheck` and the accent border that every other
 * "this is the one" surface in the app uses. These assert the check rather than
 * prose, which is also what makes them survive the next wording change.
 */
