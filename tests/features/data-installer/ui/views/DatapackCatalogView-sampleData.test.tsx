/**
 * DatapackCatalogView — the project's recorded sample-data choice.
 *
 * Split from DatapackCatalogView.test.tsx on 2026-08-30, which had reached 778
 * lines against CI's 750-line limit. This is that file's second top-level
 * describe, moved verbatim; the shared preamble lives in the testUtils both
 * halves import.
 */

import { render, screen, waitFor } from '@testing-library/react';

import { press, settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';

import {
    DatapackCatalogView,
    mockRequest,
    CATALOG,
} from './DatapackCatalogView.testUtils';

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
