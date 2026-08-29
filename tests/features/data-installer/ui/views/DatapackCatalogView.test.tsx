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

import { change, press, settle } from '../../../../helpers/reactSettle';
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
/**
 * The most recent request OF A GIVEN TYPE.
 *
 * `lastRequest()` was sufficient while the view fired one request; it now also
 * asks `get-datapack-import-target` for the project's recorded sample-data
 * choice, so "the last call" is no longer "the catalog call". Assertions about
 * the catalog request must name it.
 */
function requestOfType(type: string): { type: unknown; payload: unknown } | undefined {
    const call = [...mockRequest.mock.calls].reverse().find((c) => c[0] === type);
    return call ? { type: call[0], payload: call[1] } : undefined;
}

function lastRequest(): { type: unknown; payload: unknown } {
    const call = mockRequest.mock.calls[mockRequest.mock.calls.length - 1] ?? [];
    return { type: call[0], payload: call[1] };
}

function makeSummary(
    name: string,
    version: string,
    overrides: Partial<DatapackSummary> = {}
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

/**
 * Catalog + detail, the one definition.
 *
 * This existed TWICE under this exact name — once in the `detail flyout`
 * describe and once in `the import modal` — with different inventories and,
 * worse, different fallback semantics. One answered every unrecognised request
 * with the DETAIL payload; the other answered `data: null`. The catch-all was a
 * real fixture bug: the import modal reads `get-datapack-import-status`, so it
 * received a detail payload where it expected a job record and rendered its
 * result view instead of its form. That went unnoticed because the request was
 * still in flight when the tests asserted; settling made the modal deterministic
 * and the wrong answer visible.
 *
 * One name, two behaviours, is exactly the trap the fixture consolidation work
 * exists to close (ADR-016 § Fixtures and fakes, rule 4).
 *
 * @param inventory - what the service HOLDS for this datapack. The only thing
 *   the two copies legitimately varied, so it is the only parameter.
 */
function resolveCatalogThenDetail(inventory: {
    present: string[];
    missing: string[];
    presentCount: number;
    missingCount: number;
    requestedCount: number;
}) {
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
                    inventory,
                },
            });
        }
        // Serves two consumers that share this request: the view's own
        // projectContext (DatapackCatalogView.tsx:102) and the import modal's
        // target (ImportDatapackModal.tsx:149) — same shape, same request.
        // Without an instance the modal renders "This project has no Commerce
        // instance" rather than the type list.
        if (type === 'get-datapack-import-target') {
            return Promise.resolve({
                success: true,
                data: { instance: 'inst', projectName: 'demo-1' },
            });
        }
        // Everything else is genuinely unasked. `null` is what "no record" looks
        // like — never a stand-in payload, which is what caused the bug above.
        return Promise.resolve({ success: true, data: null });
    });
}

/** What the flyout specs used: nothing missing. */
const INVENTORY_COMPLETE = {
    present: ['products'],
    missing: [],
    presentCount: 1,
    missingCount: 0,
    requestedCount: 1,
};

/** What the modal specs used: one type the service does not hold. */
const INVENTORY_WITH_GAP = {
    present: ['products'],
    missing: ['giftcards'],
    presentCount: 1,
    missingCount: 1,
    requestedCount: 2,
};

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
describe('the project’s recorded sample data', () => {
    function withRecordedChoice(datapack: unknown) {
        mockRequest.mockImplementation((type: string) => {
            if (type === 'find-datapacks') {
                return Promise.resolve({
                    success: true,
                    data: { items: CATALOG, count: CATALOG.length, total: CATALOG.length },
                });
            }
            if (type === 'get-datapack-import-target') {
                return Promise.resolve({
                    success: true,
                    data: { instance: 'inst-1', projectName: 'demo-1', datapack },
                });
            }
            return Promise.resolve({ success: true, data: null });
        });
    }

    /**
     * The check follows the INSTANCE, not just the project's one recorded pack.
     *
     * The service keeps an installed list; scoped to this project's Commerce
     * instance it answers "what is on the box this project writes to". Neither
     * source is ground truth — nothing here has that, since only Commerce knows
     * what it holds — so the two are unioned and the check means "believed
     * installed".
     *
     * `bodea` here is NOT the project's recorded pack; the service reports it.
     * Before this the card could only be marked from `project.datapack`, so a
     * second pack on the same instance was invisible.
     */
    it('marks a pack the service reports installed on this instance', async () => {
        mockRequest.mockImplementation((type: string) => {
            if (type === 'find-datapacks') {
                return Promise.resolve({
                    success: true,
                    data: { items: CATALOG, count: CATALOG.length, total: CATALOG.length },
                });
            }
            if (type === 'get-datapack-import-target') {
                // No `datapack` — the project records nothing.
                return Promise.resolve({
                    success: true,
                    data: { instance: 'inst-1', projectName: 'demo-1' },
                });
            }
            if (type === 'list-installed-datapacks') {
                return Promise.resolve({
                    success: true,
                    data: {
                        items: [
                            {
                                commerceInstance: 'inst-1',
                                id: { name: 'bodea', version: 'main' },
                                dataTypes: ['products'],
                                art: {},
                            },
                        ],
                        count: 1,
                        total: 1,
                    },
                });
            }
            return Promise.resolve({ success: true, data: null });
        });
        render(<DatapackCatalogView />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        const check = await screen.findByTestId('datapack-card-project-check');

        expect(check.closest('[data-datapack]')).toHaveAttribute('data-datapack', 'bodea');
    });

    /**
     * CONTROL — the installed list is SCOPED to this project's instance.
     *
     * Without the scope this would be the global cross-instance list an earlier
     * Installed view showed, which was removed precisely because it spoke for
     * boxes the user was not looking at.
     */
    it('CONTROL — asks only about this project’s instance', async () => {
        withRecordedChoice({ name: 'bodea', version: 'main' });
        render(<DatapackCatalogView />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        await waitFor(() =>
            expect(
                mockRequest.mock.calls.find((c) => c[0] === 'list-installed-datapacks')
            ).toBeDefined()
        );
        const call = mockRequest.mock.calls.find((c) => c[0] === 'list-installed-datapacks');
        expect(call?.[1]).toEqual({ commerceInstance: 'inst-1' });
    });

    /** The check lands on the project's pack, and on no other card. */
    it('marks the pack this project was created for', async () => {
        withRecordedChoice({ name: 'bodea', version: 'main' });
        render(<DatapackCatalogView />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        const check = await screen.findByTestId('datapack-card-project-check');

        expect(check.closest('[data-datapack]')).toHaveAttribute('data-datapack', 'bodea');
    });

    /**
     * CONTROL. Exactly one card is marked — the assertion above would pass just
     * as well if every card wore a check, which is the mistake a grid invites.
     */
    it('CONTROL — marks only that one card', async () => {
        withRecordedChoice({ name: 'bodea', version: 'main' });
        render(<DatapackCatalogView />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        await screen.findByTestId('datapack-card-project-check');

        expect(screen.getAllByTestId('datapack-card-project-check')).toHaveLength(1);
        expect(screen.getAllByTestId('datapack-card').length).toBeGreaterThan(1);
    });

    /**
     * The check follows what the user just did, not what was true on mount.
     *
     * The handler writes `project.datapack` when the service accepts an import
     * and clears it when it accepts a removal — so the modal the user just closed
     * decides which card is marked. The catalog read that once at mount and never
     * again: importing a pack changed no card, and removing one left the check
     * standing, until the whole panel was reopened.
     *
     * Asserted on the RE-READ rather than on the rendered check, because the mock
     * would have to change its answer mid-test to show the check appearing — and
     * the re-read is the thing that was missing.
     */
    it('re-reads which pack the project holds when the import modal closes', async () => {
        // Needs the DETAIL too: the flyout's Import affordance is gated on it,
        // and `withRecordedChoice` answers only the catalog and the target.
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
                        inventory: {
                            present: ['products'],
                            missing: [],
                            presentCount: 1,
                            missingCount: 0,
                            requestedCount: 1,
                        },
                    },
                });
            }
            if (type === 'get-datapack-import-target') {
                return Promise.resolve({
                    success: true,
                    data: { instance: 'inst-1', projectName: 'demo-1' },
                });
            }
            return Promise.resolve({ success: true, data: null });
        });
        render(<DatapackCatalogView />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        const cards = await screen.findAllByTestId('datapack-card');
        await press(cards[0]);
        await press(await screen.findByRole('button', { name: /^import/i }));
        await screen.findByRole('button', { name: /start import/i });

        const before = mockRequest.mock.calls.filter(
            (c) => c[0] === 'get-datapack-import-target'
        ).length;
        await press(screen.getByRole('button', { name: /^close$/i }));

        await waitFor(() =>
            expect(
                mockRequest.mock.calls.filter((c) => c[0] === 'get-datapack-import-target').length
            ).toBeGreaterThan(before)
        );
    });

    it('marks nothing when the project recorded no choice', async () => {
        withRecordedChoice(undefined);
        render(<DatapackCatalogView />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
        expect(screen.queryByTestId('datapack-card-project-check')).not.toBeInTheDocument();
    });

    /** The banner is gone, not merely unrendered in this state. */
    it('no longer shows a "set up for" banner', async () => {
        withRecordedChoice({ name: 'bodea', version: 'main' });
        render(<DatapackCatalogView />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        await screen.findByTestId('datapack-card-project-check');

        expect(screen.queryByText(/set up for/i)).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /review and install/i })
        ).not.toBeInTheDocument();
    });
});
