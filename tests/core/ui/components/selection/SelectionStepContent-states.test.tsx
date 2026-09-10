/**
 * The four states SelectionStepContent chooses between.
 *
 * WHY THIS SUITE EXISTS. This component decides, in order: show a loading
 * display, show an error with recovery actions, show an empty state, or hand off
 * to `SearchableList`. None of that was tested here — its only suite covered
 * disabled items. The coverage lived instead inside the two Adobe picker suites,
 * which reach it through a MOCKED `useSelectionStep`, so they were asserting what
 * their own fake had been told to return. Written out twice, in the wrong place,
 * proving less than it looked like.
 *
 * What is INSIDE the loaded list — the search field, the item counts, the refresh
 * button, the no-results line — belongs to `SearchableList` and is covered by its
 * 27 tests. Selecting a row is covered there too. Deliberately not repeated here.
 *
 * The harness lives in `.testUtils` and owns the component import, so this file
 * never reaches for the subject directly (webview-test-authoring §3).
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCode } from '@/types/errorCodes';
import { baseLabels, items, renderContent } from './SelectionStepContent.testUtils';
import '@testing-library/jest-dom';

/** Spectrum presses need the fake timers advanced, or the click never flushes. */
const user = (): ReturnType<typeof userEvent.setup> =>
    userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

describe('SelectionStepContent — which state it shows', () => {
    describe('loading', () => {
        it('shows the loading message and hides the list', () => {
            renderContent({ showLoading: true });

            expect(screen.getByText(baseLabels.loadingMessage)).toBeInTheDocument();
            expect(screen.queryByText('Selectable Org')).not.toBeInTheDocument();
        });

        it('shows loading on a FIRST load even when showLoading is false', () => {
            // `isLoading && !hasLoadedOnce` — the first fetch has nothing behind it,
            // so the spinner is the whole screen.
            renderContent({ isLoading: true, hasLoadedOnce: false });

            expect(screen.getByText(baseLabels.loadingMessage)).toBeInTheDocument();
        });

        it('keeps the LIST on screen while refreshing an already-loaded list', () => {
            // The distinction those two flags exist for: a background refresh must
            // not blank the list a person is reading.
            renderContent({ isLoading: true, hasLoadedOnce: true, isRefreshing: true });

            expect(screen.getByText('Selectable Org')).toBeInTheDocument();
            expect(screen.queryByText(baseLabels.loadingMessage)).not.toBeInTheDocument();
        });
    });

    describe('error', () => {
        it('shows the error title and message instead of the list', () => {
            renderContent({ error: 'Adobe said no' });

            expect(screen.getByText(baseLabels.errorTitle)).toBeInTheDocument();
            expect(screen.getByText('Adobe said no')).toBeInTheDocument();
            expect(screen.queryByText('Selectable Org')).not.toBeInTheDocument();
        });

        it('offers Try Again, and retrying calls onLoad', async () => {
            const onLoad = jest.fn();
            renderContent({ error: 'Adobe said no', onLoad });

            await user().click(screen.getByRole('button', { name: /try again/i }));

            expect(onLoad).toHaveBeenCalledTimes(1);
        });

        it('a stale error does NOT show while a retry is in flight', () => {
            // `error && !isLoading` is the guard. `hasLoadedOnce: true` matters:
            // without it the loading branch answers first and this passes whatever
            // the error branch does — which is exactly how the first version of
            // this test failed to catch the guard being dropped (probe, 2026-09-02).
            renderContent({ error: 'Adobe said no', isLoading: true, hasLoadedOnce: true });

            expect(screen.queryByText(baseLabels.errorTitle)).not.toBeInTheDocument();
            expect(screen.queryByText('Adobe said no')).not.toBeInTheDocument();
        });
    });

    describe('an org mismatch is not retryable', () => {
        // The token reaches exactly one IMS org, so re-running the same call fails
        // identically. The recovery is a forced sign-in; Try Again drops to
        // secondary rather than disappearing, because the transient case still
        // exists.
        it('offers Switch IMS Org when the host can perform one', async () => {
            const onSwitchOrg = jest.fn();
            renderContent({ error: 'Wrong org', errorCode: ErrorCode.ORG_MISMATCH, onSwitchOrg });

            await user().click(screen.getByRole('button', { name: /switch ims org/i }));

            expect(onSwitchOrg).toHaveBeenCalledTimes(1);
            expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
        });

        it('falls back to Try Again alone when the host cannot switch orgs', () => {
            renderContent({ error: 'Wrong org', errorCode: ErrorCode.ORG_MISMATCH });

            expect(
                screen.queryByRole('button', { name: /switch ims org/i })
            ).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
        });

        it('a NON-mismatch error never offers the org switch, even when it could', () => {
            renderContent({ error: 'Network down', onSwitchOrg: jest.fn() });

            expect(
                screen.queryByRole('button', { name: /switch ims org/i })
            ).not.toBeInTheDocument();
        });
    });

    describe('empty', () => {
        it('shows the empty state when there are no items', () => {
            renderContent({ items: [], filteredItems: [] });

            expect(screen.getByText(baseLabels.emptyTitle)).toBeInTheDocument();
            expect(screen.getByText(baseLabels.emptyMessage)).toBeInTheDocument();
        });

        it('does NOT call an empty list empty while it is still loading', () => {
            renderContent({ items: [], filteredItems: [], isLoading: true, hasLoadedOnce: true });

            expect(screen.queryByText(baseLabels.emptyTitle)).not.toBeInTheDocument();
        });

        it('an empty SEARCH is not an empty list — the list stays', () => {
            // `items` decides emptiness, not `filteredItems`. Getting that backwards
            // replaces a searchable list with "No Organizations" the moment a query
            // matches nothing.
            renderContent({ items, filteredItems: [], searchQuery: 'zzz' });

            expect(screen.queryByText(baseLabels.emptyTitle)).not.toBeInTheDocument();
        });
    });

    describe('loaded', () => {
        it('hands the items to the list', () => {
            renderContent();

            expect(screen.getByText('Selectable Org')).toBeInTheDocument();
            expect(screen.getByText('Filtered Org')).toBeInTheDocument();
        });
    });
});
