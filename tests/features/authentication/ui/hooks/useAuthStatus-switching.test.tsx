/**
 * useAuthStatus — the org-switch gate, the org-change comparison, and the
 * dependency arrays.
 *
 * Every assertion here is on what the hook DOES next: whether `check-auth` is
 * posted, what `updateState` / `setCanProceed` receive, what `authTimeout`
 * reads. The switching flag and the pre-auth org are refs, so the only way to
 * see them is through the next call.
 */

import {
    mockPostMessage,
    mockOnMessage,
    mockRequestAuth,
    baseState,
    authenticatedState,
    stateWithProjectSelected,
    successAuthData,
    checkingAuthData,
    timeoutAuthData,
    reAuthDifferentOrgData,
    resetMocks,
} from './useAuthStatus.testUtils';

// Mock WebviewClient - must be in test file for proper hoisting
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => {
            const { mockPostMessage } = require('./useAuthStatus.testUtils');
            return mockPostMessage(...args);
        },
        onMessage: (...args: any[]) => {
            const { mockOnMessage } = require('./useAuthStatus.testUtils');
            return mockOnMessage(...args);
        },
        requestAuth: (...args: any[]) => {
            const { mockRequestAuth } = require('./useAuthStatus.testUtils');
            return mockRequestAuth(...args);
        },
    },
}));

import { renderHook, act } from '@testing-library/react';
import { useAuthStatus } from '@/features/authentication/ui/hooks/useAuthStatus';
import { WizardState } from '@/types/webview';

type AuthCallback = (data: unknown) => void;

/** Render the hook, capturing the `auth-status` subscriber so a test can answer it. */
function renderWithCallback(
    state: Partial<WizardState>,
    updateState: jest.Mock = jest.fn(),
    setCanProceed: jest.Mock = jest.fn(),
) {
    let authCallback: AuthCallback | null = null;
    mockOnMessage.mockImplementation((type: string, callback: AuthCallback) => {
        if (type === 'auth-status') {
            authCallback = callback;
        }
        return jest.fn();
    });
    const rendered = renderHook(
        (props: { state: Partial<WizardState>; updateState: jest.Mock }) =>
            useAuthStatus({
                state: props.state as WizardState,
                updateState: props.updateState,
                setCanProceed,
            }),
        { initialProps: { state, updateState } },
    );
    mockPostMessage.mockClear();
    updateState.mockClear();
    return { ...rendered, answer: (data: unknown) => act(() => authCallback?.(data)) };
}

describe('useAuthStatus - switching and org change', () => {
    beforeEach(() => {
        resetMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('the org-switch gate', () => {
        it('a forced login suspends auth checks until the switch completes', () => {
            const { result } = renderWithCallback(baseState);

            act(() => result.current.handleLogin(true));
            act(() => result.current.checkAuthentication());

            expect(mockPostMessage).not.toHaveBeenCalled();
        });

        it('a plain login does not suspend auth checks', () => {
            const { result } = renderWithCallback(baseState);

            act(() => result.current.handleLogin());
            act(() => result.current.checkAuthentication());

            expect(mockPostMessage).toHaveBeenCalledWith('check-auth');
        });

        it('a forced login with no org in state still requests auth', () => {
            const { result } = renderWithCallback(baseState);

            act(() => result.current.handleLogin(true));

            expect(mockRequestAuth).toHaveBeenCalledWith(true);
        });

        it('an authenticated answer ends the switch — checks run again', () => {
            const { result, answer } = renderWithCallback(baseState);
            act(() => result.current.handleLogin(true));

            answer(successAuthData);
            act(() => result.current.checkAuthentication());

            expect(mockPostMessage).toHaveBeenCalledWith('check-auth');
        });

        it('an unauthenticated answer keeps the switch open', () => {
            const { result, answer } = renderWithCallback(baseState);
            act(() => result.current.handleLogin(true));

            answer(checkingAuthData);
            act(() => result.current.checkAuthentication());

            expect(mockPostMessage).not.toHaveBeenCalled();
        });
    });

    describe('the timeout flag', () => {
        it('a timeout reports the check as finished, not still checking', () => {
            const updateState = jest.fn();
            const { answer } = renderWithCallback(baseState, updateState);

            answer(timeoutAuthData);

            expect(updateState).toHaveBeenCalledWith({
                adobeAuth: expect.objectContaining({ isChecking: false, error: 'timeout' }),
            });
        });

        it('a checking answer clears a previous timeout', () => {
            const { result, answer } = renderWithCallback(baseState);
            answer(timeoutAuthData);
            expect(result.current.authTimeout).toBe(true);

            answer(checkingAuthData);

            expect(result.current.authTimeout).toBe(false);
        });

        it('an answer that is neither authenticated nor checking leaves the timeout standing', () => {
            const { result, answer } = renderWithCallback(baseState);
            answer(timeoutAuthData);

            answer({ isAuthenticated: false, isChecking: false, message: 'Not signed in' });

            expect(result.current.authTimeout).toBe(true);
        });
    });

    describe('the org-change comparison', () => {
        it('a checking answer carries no org and must not clear the project', () => {
            const updateState = jest.fn();
            const { answer } = renderWithCallback(stateWithProjectSelected, updateState);

            answer(checkingAuthData);

            const update = updateState.mock.calls[0][0];
            expect(update).not.toHaveProperty('adobeProject');
            expect(update).not.toHaveProperty('adobeWorkspace');
        });

        it('with no previous org there is nothing to compare — the project stays', () => {
            const updateState = jest.fn();
            const { answer } = renderWithCallback(
                { ...stateWithProjectSelected, adobeOrg: undefined },
                updateState,
            );

            answer(successAuthData);

            expect(updateState.mock.calls[0][0]).not.toHaveProperty('adobeProject');
        });

        it('the org captured at a forced login is the one compared, not whatever state holds now', () => {
            const updateState = jest.fn();
            const { result, rerender, answer } = renderWithCallback(
                stateWithProjectSelected,
                updateState,
            );
            act(() => result.current.handleLogin(true));
            // The parent dropped the org meanwhile; the pre-auth org still knows.
            rerender({ state: { ...stateWithProjectSelected, adobeOrg: undefined }, updateState });
            updateState.mockClear();

            answer(reAuthDifferentOrgData);

            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ adobeProject: undefined, adobeWorkspace: undefined }),
            );
        });

        it('an answer without an isChecking field reads as not checking', () => {
            const updateState = jest.fn();
            const { answer } = renderWithCallback(baseState, updateState);

            answer({ isAuthenticated: true, email: 'user@adobe.com' });

            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ adobeAuth: expect.objectContaining({ isChecking: false }) }),
            );
        });
    });

    describe('the callbacks follow their props', () => {
        it('checkAuthentication writes through the updater it was last given', () => {
            const first = jest.fn();
            const second = jest.fn();
            const { result, rerender } = renderWithCallback(baseState, first);

            rerender({ state: baseState, updateState: second });
            act(() => result.current.checkAuthentication());

            expect(second).toHaveBeenCalledWith({
                adobeAuth: expect.objectContaining({ isChecking: true }),
            });
            expect(first).not.toHaveBeenCalled();
        });

        it('handleLogin writes through the updater it was last given', () => {
            const first = jest.fn();
            const second = jest.fn();
            const { result, rerender } = renderWithCallback(baseState, first);

            rerender({ state: baseState, updateState: second });
            act(() => result.current.handleLogin());

            expect(second).toHaveBeenCalledWith({
                adobeAuth: expect.objectContaining({ isChecking: true, error: undefined }),
            });
            expect(first).not.toHaveBeenCalled();
        });

        it('canProceed is re-derived when the auth state changes', () => {
            const setCanProceed = jest.fn();
            const { rerender } = renderWithCallback(baseState, jest.fn(), setCanProceed);
            expect(setCanProceed).toHaveBeenLastCalledWith(false);

            rerender({ state: authenticatedState, updateState: jest.fn() });

            expect(setCanProceed).toHaveBeenLastCalledWith(true);
        });
    });
});
