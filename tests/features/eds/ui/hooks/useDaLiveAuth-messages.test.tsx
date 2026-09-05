/**
 * useDaLiveAuth — the four messages the extension pushes at it.
 *
 * The hook is a state machine driven entirely by pushes: an auth status, a
 * login-opened with the bookmarklet URL, a token-stored verdict, and a
 * token-with-org verdict. `dalive-token-stored` had no test at all before
 * PL-22 MUT-04, and the auth-status branch that decides whether an org name
 * reaches the wizard had one of its three arms covered.
 *
 * What matters here is which shape reaches `updateState`: the wizard reads
 * `edsConfig.daLiveOrg` to decide the SC is signed in to the right org, so a
 * branch that writes the wrong one signs them into nothing.
 *
 * The mock wall and the wizard state come from `edsAuthHooks.testUtils`, which
 * must be imported before the hook — `jest.mock` hoists above the imports of
 * the module it appears in, not across modules.
 */

import { createDefaultState, messageHandlers, mockPostMessage } from './edsAuthHooks.testUtils';
import { renderHook, act } from '@testing-library/react';
import type { WizardState, EDSConfig } from '@/types/webview';

/** The auth block of the edsConfig the hook last pushed to updateState. */
function lastAuth(updateState: jest.Mock) {
    const calls = updateState.mock.calls;
    const last = calls[calls.length - 1]?.[0] as { edsConfig?: EDSConfig } | undefined;
    return last?.edsConfig?.daLiveAuth;
}

/** The whole edsConfig the hook last pushed. */
function lastConfig(updateState: jest.Mock) {
    const calls = updateState.mock.calls;
    return (calls[calls.length - 1]?.[0] as { edsConfig?: EDSConfig } | undefined)?.edsConfig;
}

describe('useDaLiveAuth - incoming messages', () => {
    let updateState: jest.Mock;

    async function mount(state: WizardState = createDefaultState()) {
        const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');
        return renderHook(() => useDaLiveAuth({ state, updateState }));
    }

    const push = (type: string, data: unknown) =>
        act(() => {
            messageHandlers.get(type)?.(data);
        });

    beforeEach(() => {
        jest.clearAllMocks();
        messageHandlers.clear();
        updateState = jest.fn();
    });

    // =========================================================================
    // dalive-auth-status
    // =========================================================================

    describe('an auth status carrying an org', () => {
        it('signs the SC in to that org', async () => {
            await mount();

            push('dalive-auth-status', { isAuthenticated: true, orgName: 'verified-org' });

            expect(lastConfig(updateState)?.daLiveOrg).toBe('verified-org');
            expect(lastAuth(updateState)).toEqual({
                isAuthenticated: true,
                isAuthenticating: false,
                error: undefined,
            });
        });

        it('pre-fills the org even when the token is gone, and says why', async () => {
            // A remembered org with an expired token: the SC sees the org they
            // used last and a reason, rather than an empty field.
            await mount();

            push('dalive-auth-status', {
                isAuthenticated: false,
                orgName: 'remembered-org',
                error: 'Token expired',
            });

            expect(lastConfig(updateState)?.daLiveOrg).toBe('remembered-org');
            expect(lastAuth(updateState)).toEqual({
                isAuthenticated: false,
                isAuthenticating: false,
                error: 'Token expired',
            });
        });
    });

    describe('an auth status carrying no org', () => {
        it('touches the auth block only, leaving the org field alone', async () => {
            // Writing an undefined org here would wipe an org the SC typed.
            await mount();

            push('dalive-auth-status', { isAuthenticated: true });

            expect(lastConfig(updateState)?.daLiveOrg).toBe('');
            expect(lastAuth(updateState)).toEqual({
                isAuthenticated: true,
                isAuthenticating: false,
                error: undefined,
            });
        });

        it('does the same when it is not authenticated either', async () => {
            await mount();

            push('dalive-auth-status', { isAuthenticated: false, error: 'No token stored' });

            expect(lastConfig(updateState)?.daLiveOrg).toBe('');
            expect(lastAuth(updateState)).toEqual({
                isAuthenticated: false,
                isAuthenticating: false,
                error: 'No token stored',
            });
        });
    });

    describe('the bookmarklet setup flag', () => {
        it('starts out unset, so the first-run instructions show', async () => {
            const { result } = await mount();

            expect(result.current.setupComplete).toBe(false);
        });

        it('follows what the extension reports', async () => {
            const { result } = await mount();

            push('dalive-auth-status', { isAuthenticated: false, setupComplete: true });

            expect(result.current.setupComplete).toBe(true);
        });

        it('stays as it was when a status says nothing about it', async () => {
            // The flag lives in a ref, so it is read at render time. The rerender
            // is what makes the second status observable at all — without it the
            // hook would report the value from before either push.
            const { result, rerender } = await mount();

            push('dalive-auth-status', { isAuthenticated: false, setupComplete: true });
            push('dalive-auth-status', { isAuthenticated: false });
            rerender();

            expect(result.current.setupComplete).toBe(true);
        });

        it('can be reported as not complete', async () => {
            const { result } = await mount();

            push('dalive-auth-status', { isAuthenticated: false, setupComplete: false });

            expect(result.current.setupComplete).toBe(false);
        });
    });

    describe('the bookmarklet URL', () => {
        it('arrives with the auth status', async () => {
            const { result } = await mount();

            push('dalive-auth-status', {
                isAuthenticated: false,
                bookmarkletUrl: 'https://example.invalid/bookmarklet',
            });

            expect(result.current.bookmarkletUrl).toBe('https://example.invalid/bookmarklet');
        });

        it('arrives when the login window opens', async () => {
            const { result } = await mount();

            push('dalive-login-opened', { bookmarkletUrl: 'https://example.invalid/from-open' });

            expect(result.current.bookmarkletUrl).toBe('https://example.invalid/from-open');
        });

        it('is not cleared by a later status that does not carry one', async () => {
            // The SC still needs the bookmarklet after a failed sign-in.
            const { result } = await mount();

            push('dalive-auth-status', {
                isAuthenticated: false,
                bookmarkletUrl: 'https://example.invalid/keep-me',
            });
            push('dalive-auth-status', { isAuthenticated: false, error: 'nope' });

            expect(result.current.bookmarkletUrl).toBe('https://example.invalid/keep-me');
        });
    });

    // =========================================================================
    // dalive-token-stored
    // =========================================================================

    describe('a token-stored verdict', () => {
        it('marks the SC authenticated when the token was accepted', async () => {
            await mount();

            push('dalive-token-stored', { success: true });

            expect(lastAuth(updateState)).toEqual({
                isAuthenticated: true,
                isAuthenticating: false,
                error: undefined,
            });
        });

        it('reports the reason the token was refused', async () => {
            await mount();

            push('dalive-token-stored', { success: false, error: 'Token is not a DA.live token' });

            expect(lastAuth(updateState)).toEqual({
                isAuthenticated: false,
                isAuthenticating: false,
                error: 'Token is not a DA.live token',
            });
        });

        it('says something when the refusal came with no reason', async () => {
            // Leaving `error` undefined would end the flow with a spinner that
            // simply stops.
            await mount();

            push('dalive-token-stored', { success: false });

            expect(lastAuth(updateState)?.error).toBe('Failed to store token');
        });
    });

    // =========================================================================
    // dalive-token-with-org-result
    // =========================================================================

    describe('a token-with-org verdict', () => {
        it('signs the SC in to the verified org', async () => {
            await mount();

            push('dalive-token-with-org-result', { success: true, orgName: 'verified-org' });

            expect(lastConfig(updateState)?.daLiveOrg).toBe('verified-org');
            expect(lastAuth(updateState)?.isAuthenticated).toBe(true);
        });

        it('does not sign anyone in when the org came back unverified', async () => {
            // Success WITH no org is the shape that matters: both halves are
            // required before an org reaches the wizard.
            await mount();

            push('dalive-token-with-org-result', { success: true });

            expect(lastAuth(updateState)).toEqual({
                isAuthenticated: false,
                isAuthenticating: false,
                error: 'Failed to verify organization',
            });
        });

        it('does not sign anyone in when the token failed but an org came back', async () => {
            await mount();

            push('dalive-token-with-org-result', {
                success: false,
                orgName: 'some-org',
                error: 'Not a member of some-org',
            });

            expect(lastAuth(updateState)).toEqual({
                isAuthenticated: false,
                isAuthenticating: false,
                error: 'Not a member of some-org',
            });
            expect(lastConfig(updateState)?.daLiveOrg).toBe('');
        });
    });

    // =========================================================================
    // Lifecycle
    // =========================================================================

    describe('subscriptions', () => {
        it('listens for all four pushes', async () => {
            await mount();

            expect([...messageHandlers.keys()].sort()).toEqual([
                'dalive-auth-status',
                'dalive-login-opened',
                'dalive-token-stored',
                'dalive-token-with-org-result',
            ]);
        });

        it('unsubscribes every one of them on unmount', async () => {
            // A leaked listener writes into a wizard step that has gone.
            const { unmount } = await mount();

            unmount();

            expect([...messageHandlers.keys()]).toEqual([]);
        });

        it('asks the extension for the current status again on demand', async () => {
            const { result } = await mount();
            mockPostMessage.mockClear();

            act(() => {
                result.current.checkAuthStatus();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('check-dalive-auth');
        });
    });
});
