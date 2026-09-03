/**
 * A Code Sync check that runs for minutes must keep saying so.
 *
 * Two checks render this same view. The selection-time probe passes
 * `skipTrigger` and answers in about a second. "Check Again" does NOT, so when
 * Helix has never heard of the repo, `checkGitHubAppHandler` TRIGGERS a real
 * code sync and polls it for up to three minutes.
 *
 * That long path used to show one static line — "Checking installation
 * status..." — for its entire duration. So the user with the most to wait for
 * got the least evidence anything was happening, and the natural read is that
 * it hung.
 *
 * Two things are pinned here. The elapsed copy appears at all, and a
 * caller-supplied `recheckMessage` still OUTRANKS it: the retry loop's
 * "attempt 2 of 5" is measured progress, while the elapsed line is a
 * time-based guess, and a guess must never overwrite a measurement.
 *
 */

import React from 'react';
import { render, act, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import {
    CODE_SYNC_CHECK_STAGES,
    CodeSyncStatusView,
    type GitHubAppStatus,
} from '@/features/eds/ui/steps/repoSelectionInline.helpers';

const CHECKING: GitHubAppStatus = { isChecking: true, isInstalled: null };
const VERIFIED: GitHubAppStatus = { isChecking: false, isInstalled: true };

const renderView = (status: GitHubAppStatus, recheckMessage = '') =>
    render(
        <Provider theme={defaultTheme} colorScheme="dark">
            <CodeSyncStatusView
                status={status}
                isRechecking={false}
                recheckMessage={recheckMessage}
                createdRepo={{ owner: 'skukla', name: 'kukla-bodea' }}
                onCheckAgain={jest.fn()}
                onOpenInstallPage={jest.fn()}
            />
        </Provider>,
    );

/** Advance both the clock and the interval, as a real wait would. */
function advance(ms: number): void {
    act(() => {
        jest.advanceTimersByTime(ms);
    });
}

const [FIRST, SECOND] = CODE_SYNC_CHECK_STAGES;

describe('the long Code Sync wait', () => {
    it('names the repository before any threshold passes', () => {
        renderView(CHECKING);

        expect(screen.getByText('Verifying skukla/kukla-bodea...')).toBeInTheDocument();
    });

    it('speaks up once the wait outlives a glance', () => {
        renderView(CHECKING);

        advance(FIRST.afterMs + 1000);

        expect(screen.getByText(FIRST.message)).toBeInTheDocument();
    });

    it('sets the three-minute expectation before the user gives up', () => {
        renderView(CHECKING);

        advance(SECOND.afterMs + 1000);

        // The figure is read from `TIMEOUTS.LONG` in the handler's poll, not
        // estimated — if that bound changes, this copy is wrong.
        expect(screen.getByText(/up to three minutes/)).toBeInTheDocument();
    });

    it('never overwrites the retry loop, which knows more than the clock does', () => {
        renderView(CHECKING, 'Repository is still being registered... (attempt 2 of 5)');

        advance(SECOND.afterMs + 1000);

        expect(
            screen.getByText('Repository is still being registered... (attempt 2 of 5)'),
        ).toBeInTheDocument();
        expect(screen.queryByText(SECOND.message)).not.toBeInTheDocument();
    });

    it('stays quiet when nothing is being checked', () => {
        renderView(VERIFIED);

        advance(SECOND.afterMs + 1000);

        expect(screen.queryByText(FIRST.message)).not.toBeInTheDocument();
        expect(screen.queryByText(SECOND.message)).not.toBeInTheDocument();
    });
});

describe('the stage thresholds', () => {
    it('rise, so the later message can take over from the earlier one', () => {
        expect(FIRST.afterMs).toBeLessThan(SECOND.afterMs);
    });
});
