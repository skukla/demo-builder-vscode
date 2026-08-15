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

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn() },
}));

// Below the mock on purpose (see useDataInstallerRequest's suite).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DatapackActivityView } from '@/features/data-installer/ui/views/DatapackActivityView';
import type { ActivityEntry } from '@/features/data-installer/types';

const mockRequest = webviewClient.request as jest.Mock;

function lastRequest(): { type: unknown; payload: unknown } {
    const call = mockRequest.mock.calls[mockRequest.mock.calls.length - 1] ?? [];
    return { type: call[0], payload: call[1] };
}

function makeEntry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
    return {
        id: { name: 'bodea', version: 'main' },
        dataTypes: ['categories', 'products'],
        commerceInstance: 'aBcDeFgHiJkLmNoPqRsTu',
        mode: 'import',
        scenario: 'DATAPACK_SPECIFIC_ITEMS',
        at: '2026-08-06T18:12:13.115Z',
        ...overrides,
    };
}

/** `total` drives whether more can be loaded, so it is explicit. */
function resolveWith(items: ActivityEntry[], total = items.length) {
    mockRequest.mockResolvedValue({
        success: true,
        data: { items, count: items.length, total },
    });
}

describe('DatapackActivityView', () => {
    beforeEach(() => {
        mockRequest.mockReset();
    });

    it('asks for the first page on mount', async () => {
        resolveWith([makeEntry()]);

        render(<DatapackActivityView />);

        await waitFor(() =>
            expect(lastRequest()).toEqual({
                type: 'get-datapack-activity',
                payload: { limit: 50, skip: 0 },
            }),
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
                expect(lastRequest()).toEqual({
                    type: 'get-datapack-activity',
                    payload: { limit: 50, skip: 0, operationMode: 'export' },
                }),
            );
        });

        it('sends no mode when the filter is cleared to all', async () => {
            resolveWith([makeEntry()], 1);

            render(<DatapackActivityView />);
            await screen.findAllByTestId('activity-row');

            fireEvent.change(screen.getByTestId('spectrum-picker-select'), {
                target: { value: 'export' },
            });
            await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2));

            fireEvent.change(screen.getByTestId('spectrum-picker-select'), {
                target: { value: 'all' },
            });

            await waitFor(() =>
                expect(lastRequest()).toEqual({
                    type: 'get-datapack-activity',
                    payload: { limit: 50, skip: 0 },
                }),
            );
        });
    });

    describe('load more', () => {
        it('offers more while the service holds more than is shown', async () => {
            resolveWith([makeEntry()], 120);

            render(<DatapackActivityView />);

            expect(await screen.findByRole('button', { name: /load 50 more/i })).toBeInTheDocument();
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
                expect(lastRequest()).toEqual({
                    type: 'get-datapack-activity',
                    payload: { limit: 50, skip: 1 },
                }),
            );
        });

        // The accumulation pin. Replacing the list instead of appending loses
        // every row above the fold, which reads as the log emptying itself.
        it('APPENDS the next page rather than replacing what is shown', async () => {
            mockRequest.mockResolvedValueOnce({
                success: true,
                data: { items: [makeEntry()], count: 1, total: 120 },
            });
            mockRequest.mockResolvedValueOnce({
                success: true,
                data: {
                    items: [makeEntry({ id: { name: 'wknd', version: 'main' } })],
                    count: 1,
                    total: 120,
                },
            });

            render(<DatapackActivityView />);
            fireEvent.click(await screen.findByRole('button', { name: /load 50 more/i }));

            await waitFor(() => expect(screen.getAllByTestId('activity-row')).toHaveLength(2));
        });

        // Changing the filter is a NEW query, so the accumulator must not carry
        // the old mode's rows into it.
        it('resets the accumulator when the filter changes', async () => {
            mockRequest.mockResolvedValueOnce({
                success: true,
                data: { items: [makeEntry(), makeEntry()], count: 2, total: 120 },
            });
            mockRequest.mockResolvedValueOnce({
                success: true,
                data: { items: [makeEntry({ mode: 'export' })], count: 1, total: 1 },
            });

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
