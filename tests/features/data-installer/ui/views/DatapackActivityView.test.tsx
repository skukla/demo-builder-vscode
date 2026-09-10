/**
 * DatapackActivityView tests — the service's own request log.
 *
 * Paged by "Load 50 more", NOT by a pagination component: the repo has none, one
 * consumer does not justify inventing one, and the log is a feed — nobody asks
 * for page 7 of it. The button ACCUMULATES; a naive re-fetch that replaced the
 * list would lose everything above it.
 *
 * `scenario` is rendered verbatim and never narrowed to a union. The documented
 * enum (`SINGLE_DB`, `ENTIRE_DB`, …) does not match live data, which returns
 * `DATAPACK_ALL_ITEMS` and `DATAPACK_SPECIFIC_ITEMS` — so any mapping table would
 * silently blank the real values.
 *
 * Strict TDD: written BEFORE the view exists.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
    activityCallCount,
    lastActivityRequest,
    makeEntry,
    mockRequest,
    resolveSequence,
    resolveWith,
} from './DatapackActivityView.testUtils';

// Below the mock on purpose (see useDataInstallerRequest's suite).
import { DatapackActivityView } from '@/features/data-installer/ui/views/DatapackActivityView';

describe('DatapackActivityView', () => {
    beforeEach(() => {
        // Real timers for this suite. The view now makes TWO chained requests —
        // the project target, then the scoped log — and under the global fake
        // timers `waitFor` cannot advance between them, so every assertion sees
        // the loading gate. tests/setup/react.ts anticipates suites switching.
        jest.useRealTimers();
        mockRequest.mockReset();
    });

    it('asks for the first page on mount', async () => {
        resolveWith([makeEntry()]);

        render(<DatapackActivityView />);

        await waitFor(() =>
            expect(lastActivityRequest()).toEqual({
                type: 'get-datapack-activity',
                payload: { limit: 50, skip: 0, commerceInstance: 'TENANT123' },
            })
        );
    });

    it('shows the loading display first', () => {
        mockRequest.mockReturnValue(new Promise(() => undefined));

        render(<DatapackActivityView />);

        expect(screen.getByText(/loading activity/i)).toBeInTheDocument();
    });

    it('renders a row per log entry', async () => {
        resolveWith([makeEntry(), makeEntry({ id: { name: 'wknd', version: 'main' } })]);

        render(<DatapackActivityView />);

        await waitFor(() => expect(screen.getAllByTestId('activity-row')).toHaveLength(2));
    });

    it('shows the pack, mode, instance and scenario verbatim', async () => {
        resolveWith([makeEntry()]);

        render(<DatapackActivityView />);
        const rows = await screen.findAllByTestId('activity-row');

        expect(rows[0]).toHaveTextContent('bodea');
        expect(rows[0]).toHaveTextContent('main');
        expect(rows[0]).toHaveTextContent('import');
        expect(rows[0]).toHaveTextContent('aBcDeFgHiJkLmNoPqRsTu');
        // Verbatim — the documented enum does not match what the service sends.
        expect(rows[0]).toHaveTextContent('DATAPACK_SPECIFIC_ITEMS');
    });

    describe('mode filter', () => {
        it('re-asks the service rather than filtering the page in hand', async () => {
            resolveWith([makeEntry()], 1);

            render(<DatapackActivityView />);
            await screen.findAllByTestId('activity-row');

            fireEvent.change(screen.getByTestId('spectrum-picker-select'), {
                target: { value: 'export' },
            });

            await waitFor(() =>
                expect(lastActivityRequest()).toEqual({
                    type: 'get-datapack-activity',
                    payload: {
                        limit: 50,
                        skip: 0,
                        commerceInstance: 'TENANT123',
                        operationMode: 'export',
                    },
                })
            );
        });

        it('sends no mode when the filter is cleared to all', async () => {
            resolveWith([makeEntry()], 1);

            render(<DatapackActivityView />);
            await screen.findAllByTestId('activity-row');

            fireEvent.change(screen.getByTestId('spectrum-picker-select'), {
                target: { value: 'export' },
            });
            // Activity calls only: the project-target lookup is a request too.
            await waitFor(() => expect(activityCallCount()).toBe(2));

            fireEvent.change(screen.getByTestId('spectrum-picker-select'), {
                target: { value: 'all' },
            });

            await waitFor(() =>
                expect(lastActivityRequest()).toEqual({
                    type: 'get-datapack-activity',
                    payload: { limit: 50, skip: 0, commerceInstance: 'TENANT123' },
                })
            );
        });
    });

    describe('load more', () => {
        it('offers more while the service holds more than is shown', async () => {
            resolveWith([makeEntry()], 120);

            render(<DatapackActivityView />);

            expect(
                await screen.findByRole('button', { name: /load 50 more/i })
            ).toBeInTheDocument();
        });

        it('does not offer more once everything is shown', async () => {
            resolveWith([makeEntry()], 1);

            render(<DatapackActivityView />);
            await screen.findAllByTestId('activity-row');

            expect(screen.queryByRole('button', { name: /load 50 more/i })).not.toBeInTheDocument();
        });

        it('asks for the next page by skip', async () => {
            resolveWith([makeEntry()], 120);

            render(<DatapackActivityView />);
            fireEvent.click(await screen.findByRole('button', { name: /load 50 more/i }));

            await waitFor(() =>
                expect(lastActivityRequest()).toEqual({
                    type: 'get-datapack-activity',
                    payload: { limit: 50, skip: 1, commerceInstance: 'TENANT123' },
                })
            );
        });

        // The accumulation pin. Replacing the list instead of appending loses
        // every row above the fold, which reads as the log emptying itself.
        it('APPENDS the next page rather than replacing what is shown', async () => {
            resolveSequence([
                { items: [makeEntry()], total: 120 },
                { items: [makeEntry({ id: { name: 'wknd', version: 'main' } })], total: 120 },
            ]);

            render(<DatapackActivityView />);
            fireEvent.click(await screen.findByRole('button', { name: /load 50 more/i }));

            await waitFor(() => expect(screen.getAllByTestId('activity-row')).toHaveLength(2));
        });

        // Changing the filter is a NEW query, so the accumulator must not carry
        // the old mode's rows into it.
        it('resets the accumulator when the filter changes', async () => {
            resolveSequence([
                { items: [makeEntry(), makeEntry()], total: 120 },
                { items: [makeEntry({ mode: 'export' })], total: 1 },
            ]);

            render(<DatapackActivityView />);
            await waitFor(() => expect(screen.getAllByTestId('activity-row')).toHaveLength(2));

            fireEvent.change(screen.getByTestId('spectrum-picker-select'), {
                target: { value: 'export' },
            });

            await waitFor(() => expect(screen.getAllByTestId('activity-row')).toHaveLength(1));
        });
    });

    describe('states', () => {
        it('shows an empty state for an empty log', async () => {
            resolveWith([]);

            render(<DatapackActivityView />);

            expect(await screen.findByText('No activity yet')).toBeInTheDocument();
        });

        it('offers sign-in — never Retry — for a returned AUTH_REQUIRED refusal', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                error: 'Adobe sign-in is required.',
                code: 'AUTH_REQUIRED',
            });

            render(<DatapackActivityView />);

            expect(await screen.findByText('Adobe sign-in required')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
        });
    });
});

/**
 * Scoping — the whole reason this view is worth keeping.
 *
 * Unscoped, this is the SERVICE's log: every run against every instance anyone
 * has ever used. The docs record 121 `bodea` runs across 10 distinct instances
 * in a single 1,000-row sample. That is a fine diagnostic for the service and a
 * useless one for "did MY import work".
 *
 * Nothing new was needed to fix it. `logs` has accepted `commerce_instance` all
 * along, the client and handler pass it through, and the panel already resolves
 * the project's instance for its banner — the view simply never sent it.
 *
 * It matters more now than when this view was written: the build installs a pack
 * and reset removes one, and neither goes through the import modal. This is the
 * only place those runs surface afterwards.
 */
describe('DatapackActivityView — scoped to the project', () => {
    // Its own beforeEach: this is a SEPARATE top-level describe, so the one
    // above does not reach it. Without the reset, mock calls accumulated across
    // tests and "no activity was requested" read as false from a previous test's
    // call.
    beforeEach(() => {
        jest.useRealTimers();
        mockRequest.mockReset();
    });

    it('asks for the project target before the log', async () => {
        resolveWith([makeEntry()]);

        render(<DatapackActivityView />);

        await waitFor(() =>
            expect(mockRequest.mock.calls.some((c) => c[0] === 'get-datapack-import-target')).toBe(
                true
            )
        );
    });

    it('scopes the log to the project instance', async () => {
        resolveWith([makeEntry()]);

        render(<DatapackActivityView />);

        await waitFor(() =>
            expect(lastActivityRequest().payload).toMatchObject({
                commerceInstance: 'TENANT123',
            })
        );
    });

    it('keeps the scope when the mode filter changes', async () => {
        resolveWith([makeEntry()]);
        render(<DatapackActivityView />);
        await waitFor(() => expect(lastActivityRequest().payload).toBeDefined());

        fireEvent.change(screen.getByTestId('spectrum-picker-select'), {
            target: { value: 'import' },
        });

        await waitFor(() =>
            expect(lastActivityRequest().payload).toMatchObject({
                commerceInstance: 'TENANT123',
                operationMode: 'import',
            })
        );
    });

    /**
     * Without an instance there is nothing to scope TO, and falling back to the
     * global log would hand back exactly the surface this change removes.
     */
    it('asks for no log at all when no project is open', async () => {
        resolveWith([makeEntry()], 1, null);

        render(<DatapackActivityView />);

        await waitFor(() =>
            expect(mockRequest.mock.calls.some((c) => c[0] === 'get-datapack-import-target')).toBe(
                true
            )
        );
        expect(mockRequest.mock.calls.some((c) => c[0] === 'get-datapack-activity')).toBe(false);
    });

    it('says why it is empty when no project is open', async () => {
        resolveWith([], 0, null);

        render(<DatapackActivityView />);

        expect(await screen.findByText(/open a project/i)).toBeInTheDocument();
    });
});
