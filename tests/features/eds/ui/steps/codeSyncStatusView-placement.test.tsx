/**
 * The Code Sync view sits in the middle of its pane, in every state.
 *
 * It used to be centered inside a fixed 350px box, which clipped the install
 * steps and put the four states in three different places: `checking` centered
 * in its box, the taller states spilling out of theirs. The box now reserves a
 * minimum instead of capping (see `CenteredFeedbackContainer`), which fixed the
 * clipping and left every state pinned to the TOP of a tall pane with empty
 * space beneath it.
 *
 * Filling the pane closes that: `100%` is a MINIMUM here, so a short state
 * centers in the available height and a tall one simply grows past it — the
 * classic "centered flex clips its own overflow" trap cannot come back, because
 * nothing caps the height.
 *
 * All four states are pinned, not just the tall one. A view that centers while
 * checking and top-aligns when it answers is the jump this whole thread started
 * with.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import {
    CodeSyncStatusView,
    type GitHubAppStatus,
} from '@/features/eds/ui/steps/repoSelectionInline.helpers';

const renderView = (status: GitHubAppStatus, isRechecking = false) =>
    render(
        <Provider theme={defaultTheme} colorScheme="dark">
            <CodeSyncStatusView
                status={status}
                isRechecking={isRechecking}
                recheckMessage=""
                createdRepo={{ owner: 'skukla', name: 'bodea-team-demo' }}
                onCheckAgain={jest.fn()}
                onOpenInstallPage={jest.fn()}
            />
        </Provider>,
    );

/** The centering container: the only element that centers on both axes. */
const centeringBox = (container: HTMLElement): HTMLElement | null =>
    container.querySelector(
        '[style*="justify-content: center"][style*="align-items: center"]',
    );

const STATES: Array<[string, GitHubAppStatus, boolean]> = [
    ['checking', { isChecking: true, isInstalled: null }, false],
    ['verified', { isChecking: false, isInstalled: true }, false],
    ['unverifiable', { isChecking: false, isInstalled: false, undetermined: true }, false],
    [
        'needs-install',
        { isChecking: false, isInstalled: false, installUrl: 'https://github.com/apps/x' },
        false,
    ],
];

describe.each(STATES)('the %s state', (_name, status, isRechecking) => {
    it('fills the pane, so it centers in the available height', () => {
        const { container } = renderView(status, isRechecking);

        expect(centeringBox(container)?.style.minHeight).toBe('100%');
    });

    it('never caps its height, so tall content still grows', () => {
        const { container } = renderView(status, isRechecking);

        expect(centeringBox(container)?.style.height).toBe('');
    });

    // minHeight alone was NOT enough, and the screenshot proving it (2026-08-20)
    // showed the spinner pinned near the top of a tall pane. `.step-view-anim`
    // carries `min-height: 100%` but its own height stays content-driven, so a
    // percentage measured against it is indefinite and collapses. Growing as a
    // flex item is what actually reaches the bottom of the pane -- its CSS
    // comment calls this out as the opt-in a body has to take.
    // Asserts the CLASS, not a computed style: jsdom applies no stylesheet, so
    // reading flex-grow back would pass on an empty string forever. The first
    // attempt at this fix used Spectrum's `flex` prop, which `Flex` drops
    // silently -- it rendered no flex-grow and looked exactly like a fix.
    it('grows to fill, because a percentage alone measures against nothing', () => {
        const { container } = renderView(status, isRechecking);

        expect(centeringBox(container)?.className).toContain('centered-feedback--fill');
    });
});
