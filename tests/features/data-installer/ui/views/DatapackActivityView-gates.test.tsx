/**
 * WHICH FRAME SHOWS THE CHROME, and what happens when a page fails.
 *
 * The view has two loading treatments and they are not interchangeable. The
 * full-block gate takes the whole viewport and removes the filter with it; the
 * inline one sits under a filter that stays on screen. Getting the condition
 * wrong is invisible to a test that only asks "is 'Loading activity' somewhere on
 * screen" — both treatments render that text. So these tests ask about the
 * FILTER, which is the thing the two states disagree about.
 *
 * The rule, in the order the frames arrive:
 *   1. before the project target answers — full block, no chrome
 *   2. while the first page loads          — full block, no chrome
 *   3. once content has loaded once        — chrome stays, the body waits inline
 *
 * The failure half is here for the same reason: a page that fails after rows are
 * on screen retries from skip 0, and the accumulator has to REPLACE on that
 * retry. Appending would double every row the user had already seen.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
    ENTRY_AT,
    activityCallCount,
    makeEntry,
    mockRequest,
    resolveWith,
} from './DatapackActivityView.testUtils';

// Below the mock on purpose (see useDataInstallerRequest's suite).
import { DatapackActivityView } from '@/features/data-installer/ui/views/DatapackActivityView';

/** The filter control, which only the chrome renders. */
function filter(): HTMLElement | null {
    return screen.queryByTestId('spectrum-picker-select');
}

/** Target answered; the log answers `pages` in order, then hangs forever. */
function answerThenHang(pages: Array<{ items: ReturnType<typeof makeEntry>[]; total: number }>) {
    let next = 0;
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'get-datapack-import-target') {
            return { success: true, data: { instance: 'TENANT123', projectName: 'demo-1' } };
        }
        const page = pages[next++];
        if (!page) {
            return new Promise(() => undefined);
        }
        return {
            success: true,
            data: { items: page.items, count: page.items.length, total: page.total },
        };
    });
}

describe('DatapackActivityView — which loading treatment', () => {
    beforeEach(() => {
        jest.useRealTimers();
        mockRequest.mockReset();
    });

    it('shows no filter before the project target has answered', () => {
        mockRequest.mockReturnValue(new Promise(() => undefined));

        render(<DatapackActivityView />);

        expect(screen.getByText(/loading activity/i)).toBeInTheDocument();
        expect(filter()).not.toBeInTheDocument();
    });

    it('shows no filter while the FIRST page is still loading', async () => {
        answerThenHang([]);

        render(<DatapackActivityView />);
        await waitFor(() => expect(activityCallCount()).toBe(1));

        expect(filter()).not.toBeInTheDocument();
    });

    it('keeps the filter and the rows while the NEXT page loads', async () => {
        answerThenHang([{ items: [makeEntry()], total: 120 }]);

        render(<DatapackActivityView />);
        fireEvent.click(await screen.findByRole('button', { name: /load 50 more/i }));

        // The whole point of the inline treatment: what is already on screen stays.
        expect(screen.getAllByTestId('activity-row')).toHaveLength(1);
        expect(filter()).toBeInTheDocument();
    });

    it('says it is loading, not that the log is empty, while a new filter is in flight', async () => {
        answerThenHang([{ items: [makeEntry()], total: 1 }]);

        render(<DatapackActivityView />);
        await screen.findAllByTestId('activity-row');

        fireEvent.change(screen.getByTestId('spectrum-picker-select'), {
            target: { value: 'export' },
        });

        // The filter change empties the accumulator, so a body that reads only
        // "no rows" states there is no activity before the answer arrives.
        expect(screen.queryByText('No activity yet')).not.toBeInTheDocument();
        expect(screen.getByText(/loading activity/i)).toBeInTheDocument();
    });
});

describe('DatapackActivityView — a page that fails', () => {
    beforeEach(() => {
        jest.useRealTimers();
        mockRequest.mockReset();
    });

    /** Target answered; the log fails on `failOn` (1-based) and succeeds otherwise. */
    function failNthPage(failOn: number, pages: Array<{ items: unknown[]; total: number }>) {
        let next = 0;
        mockRequest.mockImplementation(async (type: string) => {
            if (type === 'get-datapack-import-target') {
                return { success: true, data: { instance: 'TENANT123', projectName: 'demo-1' } };
            }
            next += 1;
            if (next === failOn) {
                return { success: false, error: 'The service did not answer.' };
            }
            const page = pages[Math.min(next - 1, pages.length - 1)];
            return {
                success: true,
                data: { items: page.items, count: page.items.length, total: page.total },
            };
        });
    }

    it('offers a retry, and uses it to re-ask', async () => {
        failNthPage(1, [{ items: [makeEntry()], total: 1 }]);

        render(<DatapackActivityView />);
        expect(await screen.findByText('Could not reach the Data Installer')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /try again/i }));

        await waitFor(() => expect(activityCallCount()).toBe(2));
    });

    it('REPLACES the rows on that retry rather than doubling them', async () => {
        // Page 1 lands, "load more" fails, and the retry starts again from skip 0.
        // Appending there shows every row the user has already seen a second time.
        failNthPage(2, [
            { items: [makeEntry(), makeEntry({ id: { name: 'wknd', version: 'main' } })], total: 120 },
            { items: [], total: 0 },
            { items: [makeEntry({ id: { name: 'citisignal', version: 'main' } })], total: 1 },
        ]);

        render(<DatapackActivityView />);
        fireEvent.click(await screen.findByRole('button', { name: /load 50 more/i }));
        await screen.findByText('Could not reach the Data Installer');

        fireEvent.click(screen.getByRole('button', { name: /try again/i }));

        await waitFor(() => expect(screen.getAllByTestId('activity-row')).toHaveLength(1));
    });

    it('retries the TARGET lookup when that is what failed', async () => {
        mockRequest.mockImplementation(async (type: string) => {
            if (type === 'get-datapack-import-target') {
                return { success: false, error: 'The service did not answer.' };
            }
            return { success: true, data: { items: [], count: 0, total: 0 } };
        });

        render(<DatapackActivityView />);
        await screen.findByText('Could not reach the Data Installer');

        fireEvent.click(screen.getByRole('button', { name: /try again/i }));

        await waitFor(() =>
            expect(
                mockRequest.mock.calls.filter((c) => c[0] === 'get-datapack-import-target')
            ).toHaveLength(2)
        );
    });
});

describe('DatapackActivityView — the run time', () => {
    beforeEach(() => {
        jest.useRealTimers();
        mockRequest.mockReset();
    });

    it('shows a local date and time, not the raw timestamp', async () => {
        resolveWith([makeEntry()]);

        render(<DatapackActivityView />);
        const rows = await screen.findAllByTestId('activity-row');

        // textContent, not toHaveTextContent: the locale string carries spacing
        // the matcher normalises away, and that is the part being asserted.
        expect(rows[0].textContent).toContain(new Date(ENTRY_AT).toLocaleString());
        expect(rows[0].textContent).not.toContain(ENTRY_AT);
    });
});
