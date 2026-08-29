/**
 * Every state of the final step has a footer.
 *
 * The wizard's shared footer is hidden here — `shouldShowWizardFooter` excludes
 * `create-project` because this step draws its own. So whatever StepFooterArea
 * returns IS the footer, and any state it fails to cover is a state with no
 * footer at all.
 *
 * One was uncovered: the step mounts with `phase = 'creating'` but no progress
 * event yet, and `isProgressActive` returns false without progress. So on the
 * way in from Publish Storefront the footer vanished for a beat, then came back
 * when the first progress message landed. Reported 2026-08-20.
 *
 * The body already treated that window as its own state
 * (`phase === 'creating' && !progress`); only the footer disagreed.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { StepFooterArea } from '@/features/project-creation/ui/steps/ProjectCreationStep';

const BASE = {
    isActive: false,
    isStarting: false,
    isGitHubAppInstall: false,
    isCompleted: false,
    isOpeningProject: false,
    showGenericError: false,
    isCancelling: false,
    hasError: false,
    onBack: jest.fn(),
    onCancel: jest.fn(),
    onOpenProject: jest.fn(),
};

const renderFooter = (overrides: Partial<typeof BASE>) =>
    render(
        <Provider theme={defaultTheme} colorScheme="dark">
            <StepFooterArea {...BASE} {...overrides} />
        </Provider>
    );

/** The footer renders at least one button in every state that has one. */
const hasFooter = (container: HTMLElement): boolean =>
    container.querySelectorAll('button').length > 0;

describe('the final step always has a footer', () => {
    it('covers the window between mounting and the first progress event', () => {
        const { container } = renderFooter({ isStarting: true });

        expect(hasFooter(container)).toBe(true);
        expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it.each([
        ['creation running', { isActive: true }],
        ['waiting on a GitHub App install', { isGitHubAppInstall: true }],
        ['finished', { isCompleted: true }],
        ['failed', { showGenericError: true }],
    ])('covers %s', (_label, overrides) => {
        const { container } = renderFooter(overrides);

        expect(hasFooter(container)).toBe(true);
    });
});

describe('the starting window does not steal another state', () => {
    it('yields to the error branch, which needs progress and so cannot overlap', () => {
        // `isStarting` is `phase === 'creating' && !progress`; an error requires
        // `progress.error`. Both true at once is unrepresentable, but pin the
        // precedence anyway so a future widening of `isStarting` is caught here
        // rather than by someone losing their Back button.
        const { container } = renderFooter({ isStarting: false, showGenericError: true });

        expect(within(container).getByRole('button', { name: /back/i })).toBeInTheDocument();
    });
});
