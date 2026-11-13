/**
 * DatapackCatalogView tests.
 *
 * The catalog is one row per `(name, version)` — 40 rows for 25 names live — so
 * the view's first job is to render one CARD per name, not per row. Curation is
 * the second: 23 of the 40 live rows are `shared`, the rest developer scratch, so
 * the view asks once for every pack and the Show list filters what it holds, with no second request
 * rather than filtering what it already has (the handler owns that filter).
 *
 * `DatapackCard` renders for real here; only the transport is mocked. That is
 * deliberate — the grouping contract is what this view is for, and a mocked card
 * would assert nothing about it.
 *
 * Strict TDD: written BEFORE the view exists.
 */

import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import { change, press, settle } from '../../../../helpers/reactSettle';
import { webviewClientHandlers } from '../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';

import {
    DatapackCatalogView,
    mockRequest,
    requestOfType,
    lastRequest,
    resolveWith,
    resolveCatalogThenDetail,
    makeSummary,
    CATALOG,
    INVENTORY_COMPLETE,
    INVENTORY_WITH_GAP,
    SOURCE_NOTICE_COPY,
    showSelect,
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
                payload: { includeCommunity: true },
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

    // Owner, 2026-11-05: the Show list replaced two switches, each of which asked again and showed
    // its wait on Refresh. The rules themselves are `catalogShow.test.ts`.
    describe('the Show list', () => {
        it('says a choice with nothing in it is empty, and what to do', async () => {
            resolveWith([makeSummary('mine', 'main', { store: 'library', mine: true })]);
            render(<DatapackCatalogView />);
            await settle();
            await screen.findAllByTestId('datapack-card');

            fireEvent.change(showSelect(), { target: { value: 'team' } });

            expect(await screen.findByText('No Demo Builder Datapacks')).toBeInTheDocument();
            expect(screen.getByText('Try All Datapacks')).toBeInTheDocument();
        });

        it('reads the catalog again when a setting it depends on changes, with no Refresh', async () => {
            resolveWith(CATALOG);
            render(<DatapackCatalogView />);
            await settle();
            const asked = () => mockRequest.mock.calls.filter((call) => call[0] === 'find-datapacks').length;
            const before = asked();

            act(() => webviewClientHandlers.get('datapack-list-changed')?.(undefined));
            await settle();

            expect(asked()).toBe(before + 1);
        });

        // F66: a pack changed elsewhere may be the one this project holds.
        it('reads which pack the project holds again when the packs change, and the library never does', async () => {
            resolveWith(CATALOG);
            const { unmount } = render(<DatapackCatalogView />);
            await settle();
            const targets = () => mockRequest.mock.calls.filter((call) => call[0] === 'get-datapack-import-target').length;
            const before = targets();

            act(() => webviewClientHandlers.get('datapack-list-changed')?.(undefined));
            await settle();
            expect(targets()).toBe(before + 1);
            unmount();

            mockRequest.mockClear();
            render(<DatapackCatalogView library />);
            await settle();
            act(() => webviewClientHandlers.get('datapack-list-changed')?.(undefined));
            await settle();
            expect(targets()).toBe(0);
        });

        it('keeps the filter box on an empty view, so choosing one moves nothing', async () => {
            resolveWith([makeSummary('mine', 'main', { store: 'library', mine: true })]);
            render(<DatapackCatalogView />);
            await settle();
            await screen.findAllByTestId('datapack-card');

            fireEvent.change(showSelect(), { target: { value: 'team' } });

            await screen.findByText('No Demo Builder Datapacks');
            expect(screen.getByRole('searchbox', { name: 'Filter datapacks' })).toBeInTheDocument();
        });

        const PACKS = [
            makeSummary('mine', 'main', { store: 'library', mine: true }),
            makeSummary('colleague', 'main', { store: 'library' }),
            makeSummary('curated', 'main', { shared: true }),
        ];
        const cardNames = () => screen.getAllByTestId('datapack-card').map((card) => card.textContent);

        it('opens on Recommended, leaving Community out, and switches with no second request', async () => {
            resolveWith(PACKS);
            render(<DatapackCatalogView />);
            await settle();
            await screen.findAllByTestId('datapack-card');
            expect(cardNames()).toHaveLength(2);
            const asked = mockRequest.mock.calls.filter((call) => call[0] === 'find-datapacks').length;

            fireEvent.change(showSelect(), { target: { value: 'yours' } });

            await waitFor(() => expect(cardNames()).toHaveLength(1));
            expect(mockRequest.mock.calls.filter((call) => call[0] === 'find-datapacks')).toHaveLength(asked);
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
                    payload: { datapackName: 'bodea', version: 'main', store: 'installer', why: 'the version its card showed' },
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
                    payload: { datapackName: 'bodea', version: 'tierpricingfix', store: 'installer', why: 'the version its card showed' },
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
            await press(await screen.findByRole('button', { name: /^install$/i }));
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
            await screen.findByRole('button', { name: /^install$/i });

            expect(screen.queryByText('Commerce instance')).not.toBeInTheDocument();
        });

        it('opens when the flyout raises Install', async () => {
            await openImport();

            expect(
                await screen.findByText('Install', { selector: '.modal-button' })
            ).toBeInTheDocument();
        });

        // The types installed are what the service HOLDS, from the detail
        // inventory — never what the pack declares. A first install sends the
        // whole pack (step 03, S4): there are no checkboxes to offer them on.
        it('installs only the data types the service stores', async () => {
            await openImport();
            await press(await screen.findByText('Install', { selector: '.modal-button' }));

            const start = mockRequest.mock.calls.find((c) => c[0] === 'start-datapack-import');
            expect(start?.[1]).toMatchObject({ dataTypes: ['products'] });
        });

        it('closes without closing the flyout behind it', async () => {
            await openImport();
            await screen.findByText('Install', { selector: '.modal-button' });

            // A first install's summary commits, so its way out is Cancel (step 03, S4).
            await press(screen.getByRole('button', { name: /^cancel$/i }));

            expect(screen.queryByText('Commerce instance')).not.toBeInTheDocument();
            // The flyout is still open — the modal was a sibling, not a child.
            expect(screen.getByRole('dialog', { hidden: true })).toHaveClass('open');
        });
    });

    describe('states', () => {
        it('shows an empty state for an empty catalog, keeping the Show list reachable', async () => {
            resolveWith([]);

            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();

            expect(await screen.findByText('No Datapacks Yet')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /show/i })).toBeInTheDocument();
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

            expect(await screen.findByText('Adobe Sign-In Required')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /sign in with adobe/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
        });

        // The list fails only when Demo Builder's own store fails, so the Data Installer's
        // settings are not the advice: the title says datapacks, not the Data Installer.
        it('names datapacks, not the Data Installer\'s settings, when nothing could be listed', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                error: 'Could not list the datapack store.',
                code: 'INVALID_OPERATION',
            });

            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();

            expect(await screen.findByText("Datapacks Aren't Available")).toBeInTheDocument();
            expect(screen.queryByText(/demoBuilder\.dataInstaller\.apiBaseUrl/)).not.toBeInTheDocument();
        });

        it('retries a transport failure', async () => {
            mockRequest.mockRejectedValueOnce(new Error('Request timeout: find-datapacks'));
            resolveWith(CATALOG);

            render(<DatapackCatalogView />);
            // Mount effects fire requests; settle so their responses commit inside
            // act() rather than in the next query's wait loop.
            await settle();
            const retry = await screen.findByRole('button', { name: /retry/i });

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

describe('DatapackCatalogView — Demo Builder\'s datapacks beside the Data Installer\'s', () => {
    beforeEach(() => {
        mockRequest.mockReset();
    });

    it('shows a library pack on its own card even when the Data Installer has one of the same name', async () => {
        resolveWith([
            makeSummary('bodea', 'main', { shared: true }),
            makeSummary('bodea', 'v1', { store: 'library', shared: false, mine: true }),
        ]);

        render(<DatapackCatalogView />);
        await settle();

        await waitFor(() => expect(screen.getAllByTestId('datapack-card')).toHaveLength(2));
        expect(screen.getAllByTestId('datapack-card')[0]).toHaveTextContent('Mine');
    });

    // The banner says what IS on screen, then why the rest is not (owner, 2026-11-03).
    it.each([
        ['did not answer', 'no-answer', SOURCE_NOTICE_COPY.noAnswer],
        ['turned the Adobe account away', 'no-access', SOURCE_NOTICE_COPY.noAccess],
    ] as const)('still shows Demo Builder\'s datapacks when the Data Installer %s, and says which', async (_how, missing, line) => {
        mockRequest.mockResolvedValue({
            success: true,
            data: {
                items: [makeSummary('bodea', 'v1', { store: 'library', mine: true })],
                count: 1,
                installerMissing: missing,
            },
        });

        render(<DatapackCatalogView />);
        await settle();

        await waitFor(() => expect(screen.getAllByTestId('datapack-card')).toHaveLength(1));
        const notice = screen.getByTestId('datapack-source-notice');
        expect(notice).toHaveTextContent(SOURCE_NOTICE_COPY.ownOnly);
        expect(notice).toHaveTextContent(line);
        expect(notice).toHaveClass('inline-notice--info');
    });

    it('still shows the Data Installer\'s datapacks when Demo Builder\'s cannot be listed, and says so', async () => {
        mockRequest.mockResolvedValue({
            success: true,
            data: { items: [makeSummary('bodea', 'main')], count: 1, storeMissing: true },
        });

        render(<DatapackCatalogView />);
        await settle();

        await waitFor(() => expect(screen.getAllByTestId('datapack-card')).toHaveLength(1));
        const notice = screen.getByTestId('datapack-source-notice');
        expect(notice).toHaveTextContent(SOURCE_NOTICE_COPY.storeMissing);
        expect(notice).not.toHaveClass('inline-notice--info');
    });
});

