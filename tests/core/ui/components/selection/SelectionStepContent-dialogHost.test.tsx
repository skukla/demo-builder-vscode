/**
 * SelectionStepContent hosted in a dialog: the error and empty states go to the dialog's title and
 * footer, a read refused for want of a sign-in offers sign-in, never a retry, the wait is silent
 * and the list carries no count. Without a host, the whole wizard screen keeps its large centred
 * views, its words and its count (the CONTROLs).
 */

import '@testing-library/jest-dom';

import { screen } from '@testing-library/react';
import React from 'react';
import { baseLabels, renderContent } from './SelectionStepContent.testUtils';
import { ErrorCode } from '@/types/errorCodes';

function hosted(extra: Record<string, unknown>, onSignIn?: () => Promise<unknown>) {
    const onOutcome = jest.fn();
    const onWaiting = jest.fn();
    const onCreate = jest.fn();
    const onLoad = jest.fn();
    const view = renderContent({ dialogHost: { onOutcome, onWaiting, onCreate, onSignIn }, onLoad, ...extra });
    return { onOutcome, onWaiting, onCreate, onLoad, view, outcome: () => onOutcome.mock.lastCall?.[0] };
}

describe('SelectionStepContent in a dialog', () => {
    it('reports a failed read as a red title with Try Again, and draws no icon or button', () => {
        const { outcome, onLoad } = hosted({ error: 'Adobe did not answer.' });

        expect(outcome()).toMatchObject({
            title: baseLabels.errorTitle,
            status: 'error',
            lines: ['Adobe did not answer.'],
            actions: [{ label: 'Try Again' }],
        });
        expect(screen.getByText('Adobe did not answer.')).toHaveClass('dialog-line');
        expect(screen.queryByRole('button', { name: 'Try Again' })).toBeNull();
        outcome().actions[0].onPress();
        expect(onLoad).toHaveBeenCalledTimes(1);
    });

    it('reports an org mismatch with the org switch as the main action, last', () => {
        const onSwitchOrg = jest.fn();
        const { outcome } = hosted({ error: 'Wrong org.', errorCode: ErrorCode.ORG_MISMATCH, onSwitchOrg });

        expect(outcome().actions.map((action: { label: string }) => action.label)).toEqual(['Try Again', 'Switch IMS Org']);
        outcome().actions[1].onPress();
        expect(onSwitchOrg).toHaveBeenCalledTimes(1);
    });

    it.each([ErrorCode.AUTH_REQUIRED, ErrorCode.AUTH_EXPIRED])('offers sign-in for %s, never a retry, and reads again after it', async (errorCode) => {
        const onSignIn = jest.fn(async () => undefined);
        const { outcome, onLoad } = hosted({ error: 'Adobe sign-in required.', errorCode }, onSignIn);

        expect(outcome()).toMatchObject({
            title: 'Sign in to Adobe',
            status: 'warning',
            actions: [{ label: 'Sign In with Adobe' }],
        });
        outcome().actions[0].onPress();
        await Promise.resolve();
        await Promise.resolve();
        expect(onSignIn).toHaveBeenCalledTimes(1);
        expect(onLoad).toHaveBeenCalledTimes(1);
    });

    it('offers no retry when signed out and the host has no way to sign in', () => {
        const { outcome } = hosted({ error: 'Adobe sign-in required.', errorCode: ErrorCode.AUTH_REQUIRED });

        expect(outcome().actions).toStrictEqual([]);
    });

    it('reports an empty list as an amber title with New, and no line repeating the title', () => {
        const { outcome, onCreate } = hosted({ items: [], filteredItems: [] });

        expect(outcome()).toMatchObject({
            title: baseLabels.emptyTitle,
            status: 'warning',
            lines: [],
            actions: [{ label: 'New' }],
        });
        expect(screen.queryByText(baseLabels.emptyMessage)).toBeNull();
        outcome().actions[0].onPress();
        expect(onCreate).toHaveBeenCalledTimes(1);
    });

    it('waits silently: a medium spinner, no words, and it tells the dialog', () => {
        const { onWaiting, view } = hosted({ showLoading: true, isLoading: true, hasLoadedOnce: false });

        expect(onWaiting).toHaveBeenLastCalledWith(true);
        expect(document.querySelector('.modal-wait [role="progressbar"]')).not.toBeNull();
        expect(screen.queryByText(baseLabels.loadingMessage)).toBeNull();
        expect(screen.queryByText(/slow to respond/)).toBeNull();

        view.unmount();
        expect(onWaiting).toHaveBeenLastCalledWith(false);
    });

    it('says no count of the list, and keeps its refresh and New', () => {
        hosted({ headerAction: <button type="button">New</button> });

        expect(screen.queryByText(/2 organizations/)).toBeNull();
        expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    });

    it('reports nothing with the list on screen', () => {
        const { onOutcome } = hosted({});

        expect(onOutcome).not.toHaveBeenCalled();
    });
});

describe('SelectionStepContent on a whole wizard screen', () => {
    it('CONTROL: keeps its large view with Try Again in the body', () => {
        renderContent({ error: 'Adobe did not answer.' });

        expect(screen.getByText(baseLabels.errorTitle)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    });

    it('CONTROL: keeps its words while loading, its count, and its empty message', () => {
        const { unmount } = renderContent({ showLoading: true, isLoading: true, hasLoadedOnce: false });
        expect(screen.getByText(baseLabels.loadingMessage)).toBeInTheDocument();
        unmount();

        const list = renderContent();
        expect(screen.getByText('2 organizations')).toBeInTheDocument();
        list.unmount();

        renderContent({ items: [], filteredItems: [] });
        expect(screen.getByText(baseLabels.emptyMessage)).toBeInTheDocument();
    });

    it('CONTROL: a signed-out read is not changed for the wizard by the dialog\'s rule', () => {
        renderContent({ error: 'Adobe sign-in required.', errorCode: ErrorCode.AUTH_REQUIRED });

        expect(screen.getByText(baseLabels.errorTitle)).toBeInTheDocument();
    });
});
