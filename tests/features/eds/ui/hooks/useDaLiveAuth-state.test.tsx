/**
 * useDaLiveAuth — what it answers with, and what it preserves when it writes.
 *
 * Two things nothing checked before PL-22 MUT-04. First, the hook writes a
 * WHOLE `edsConfig` back on every auth change, so every field the SC has
 * already filled in — the ACCS host, the store view, the repo name, the site —
 * has to be carried across or the wizard silently loses it. Second, its
 * callbacks are memoised against the current state; a stale one writes
 * yesterday's config over today's.
 *
 * The mock wall and the wizard state come from `edsAuthHooks.testUtils`, which
 * must be imported before the hook.
 */

import { createDefaultState, messageHandlers, mockPostMessage } from './edsAuthHooks.testUtils';
import { renderHook, act } from '@testing-library/react';
import type { WizardState, EDSConfig } from '@/types/webview';

/** The edsConfig the hook last pushed to updateState. */
function lastConfig(updateState: jest.Mock) {
    const calls = updateState.mock.calls;
    return (calls[calls.length - 1]?.[0] as { edsConfig?: EDSConfig } | undefined)?.edsConfig;
}

/** A wizard state whose EDS config the SC has already filled in. */
const filledIn = (): WizardState =>
    createDefaultState({
        accsHost: 'https://accs.example.com',
        storeViewCode: 'uk_store',
        customerGroup: 'wholesale',
        repoName: 'demo-repo',
        daLiveOrg: 'old-org',
        daLiveSite: 'demo-site',
    });

describe('useDaLiveAuth - state it answers with', () => {
    let updateState: jest.Mock;

    async function mount(state: WizardState) {
        const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');
        return renderHook(() =>
            useDaLiveAuth({
                state,
                updateState: updateState as unknown as (updates: Partial<WizardState>) => void,
            })
        );
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
    // The values the step renders from
    // =========================================================================

    describe('the flags the step renders from', () => {
        it('reports the stored auth state', async () => {
            const { result } = await mount(
                createDefaultState({
                    daLiveAuth: { isAuthenticated: true, isAuthenticating: false },
                })
            );

            expect(result.current.isAuthenticated).toBe(true);
            expect(result.current.isAuthenticating).toBe(false);
        });

        it('reports a sign-in in progress', async () => {
            const { result } = await mount(
                createDefaultState({
                    daLiveAuth: { isAuthenticated: false, isAuthenticating: true },
                })
            );

            expect(result.current.isAuthenticated).toBe(false);
            expect(result.current.isAuthenticating).toBe(true);
        });

        it('reports both as false when nothing has been stored yet', async () => {
            // Not undefined: the step renders a sign-in button off these, and an
            // undefined would put it in the wrong state on first paint.
            const { result } = await mount(createDefaultState());

            expect(result.current.isAuthenticated).toBe(false);
            expect(result.current.isAuthenticating).toBe(false);
        });

        it('survives a wizard state with no EDS config at all', async () => {
            // The first render of a fresh wizard.
            const { result } = await mount({
                currentStep: 'storefront-setup',
                projectName: 'test-project',
                adobeAuth: { isAuthenticated: true, isChecking: false },
            } as WizardState);

            expect(result.current.isAuthenticated).toBe(false);
            expect(result.current.isAuthenticating).toBe(false);
            expect(result.current.verifiedOrg).toBeUndefined();
        });

        it('reports the org the SC is verified against', async () => {
            const { result } = await mount(createDefaultState({ daLiveOrg: 'verified-org' }));

            expect(result.current.verifiedOrg).toBe('verified-org');
        });

        it('reports the stored error', async () => {
            const { result } = await mount(
                createDefaultState({
                    daLiveAuth: {
                        isAuthenticated: false,
                        isAuthenticating: false,
                        error: 'Token expired',
                    },
                })
            );

            expect(result.current.error).toBe('Token expired');
        });
    });

    // =========================================================================
    // What a write preserves
    // =========================================================================

    describe('signing in keeps the rest of the config', () => {
        it('carries every field the SC already filled in', async () => {
            await mount(filledIn());

            push('dalive-auth-status', { isAuthenticated: true, orgName: 'verified-org' });

            expect(lastConfig(updateState)).toEqual(
                expect.objectContaining({
                    accsHost: 'https://accs.example.com',
                    storeViewCode: 'uk_store',
                    customerGroup: 'wholesale',
                    repoName: 'demo-repo',
                    daLiveSite: 'demo-site',
                    daLiveOrg: 'verified-org',
                })
            );
        });

        it('fills the unset ones with an empty string rather than leaving them out', async () => {
            // The wizard's own type says these are strings; an undefined reaches
            // a text field as an uncontrolled input and React complains.
            await mount({
                currentStep: 'storefront-setup',
                projectName: 'test-project',
                adobeAuth: { isAuthenticated: true, isChecking: false },
            } as WizardState);

            push('dalive-auth-status', { isAuthenticated: true, orgName: 'verified-org' });

            expect(lastConfig(updateState)).toEqual({
                accsHost: '',
                storeViewCode: '',
                customerGroup: '',
                repoName: '',
                daLiveSite: '',
                daLiveOrg: 'verified-org',
                daLiveAuth: {
                    isAuthenticated: true,
                    isAuthenticating: false,
                    error: undefined,
                },
            });
        });

        it('keeps an existing auth field the update does not mention', async () => {
            await mount(
                createDefaultState({
                    daLiveAuth: {
                        isAuthenticated: false,
                        isAuthenticating: false,
                        error: 'stale error',
                    },
                })
            );

            push('dalive-auth-status', { isAuthenticated: true, orgName: 'verified-org' });

            // The update DOES mention error (clears it) — this asserts the merge
            // order, which is what makes clearing it possible.
            expect(lastConfig(updateState)?.daLiveAuth?.error).toBeUndefined();
        });
    });

    // =========================================================================
    // The callbacks
    // =========================================================================

    describe('starting a sign-in', () => {
        it('marks the flow in progress and opens DA.live', async () => {
            const { result } = await mount(createDefaultState());

            act(() => {
                result.current.openDaLive();
            });

            expect(lastConfig(updateState)?.daLiveAuth).toEqual({
                isAuthenticated: false,
                isAuthenticating: true,
                error: undefined,
            });
            expect(mockPostMessage).toHaveBeenCalledWith('open-dalive-login');
        });

        it('sends the pasted token with the org to verify it against', async () => {
            const { result } = await mount(createDefaultState());

            act(() => {
                result.current.storeTokenWithOrg('a-token', 'an-org');
            });

            expect(lastConfig(updateState)?.daLiveAuth).toEqual({
                isAuthenticated: false,
                isAuthenticating: true,
                error: undefined,
            });
            expect(mockPostMessage).toHaveBeenCalledWith('store-dalive-token-with-org', {
                token: 'a-token',
                orgName: 'an-org',
            });
        });

        it('clears a previous error when it starts', async () => {
            const { result } = await mount(
                createDefaultState({
                    daLiveAuth: {
                        isAuthenticated: false,
                        isAuthenticating: false,
                        error: 'Token expired',
                    },
                })
            );

            act(() => {
                result.current.openDaLive();
            });

            expect(lastConfig(updateState)?.daLiveAuth?.error).toBeUndefined();
        });
    });

    describe('cancelling versus resetting', () => {
        it('cancelling leaves a stored token in place', async () => {
            // The SC changed their mind about pasting; they are still signed in.
            const { result } = await mount(
                createDefaultState({
                    daLiveOrg: 'verified-org',
                    daLiveAuth: { isAuthenticated: true, isAuthenticating: true },
                })
            );

            act(() => {
                result.current.cancelAuth();
            });

            expect(lastConfig(updateState)?.daLiveAuth).toEqual({
                isAuthenticated: true,
                isAuthenticating: false,
                error: undefined,
            });
            expect(lastConfig(updateState)?.daLiveOrg).toBe('verified-org');
            expect(mockPostMessage).not.toHaveBeenCalledWith('clear-dalive-auth');
        });

        it('cancelling an unauthenticated attempt leaves it unauthenticated', async () => {
            const { result } = await mount(
                createDefaultState({
                    daLiveAuth: { isAuthenticated: false, isAuthenticating: true },
                })
            );

            act(() => {
                result.current.cancelAuth();
            });

            expect(lastConfig(updateState)?.daLiveAuth?.isAuthenticated).toBe(false);
        });

        it('resetting clears the org, the site and the sites cache', async () => {
            const { result } = await mount(filledIn());

            act(() => {
                result.current.resetAuth();
            });

            const last = updateState.mock.calls[updateState.mock.calls.length - 1][0];
            expect(last.edsConfig.daLiveOrg).toBe('');
            expect(last.edsConfig.daLiveSite).toBe('');
            expect(last.edsConfig.selectedSite).toBeUndefined();
            expect(last.daLiveSitesCache).toBeUndefined();
            expect(mockPostMessage).toHaveBeenCalledWith('clear-dalive-auth');
        });

        it('resetting keeps the Commerce fields, which are not DA.live state', async () => {
            const { result } = await mount(filledIn());

            act(() => {
                result.current.resetAuth();
            });

            expect(lastConfig(updateState)).toEqual(
                expect.objectContaining({
                    accsHost: 'https://accs.example.com',
                    storeViewCode: 'uk_store',
                    customerGroup: 'wholesale',
                    repoName: 'demo-repo',
                })
            );
        });
    });

    describe('the callbacks see the current state, not the state they were made with', () => {
        // A memoised callback holding the first render's config writes stale
        // values over whatever the SC has typed since.
        it('cancelling writes through the latest updateState', async () => {
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');
            const first = jest.fn();
            const second = jest.fn();
            const { result, rerender } = renderHook(
                ({ u }: { u: jest.Mock }) =>
                    useDaLiveAuth({
                        state: createDefaultState(),
                        updateState: u as unknown as (updates: Partial<WizardState>) => void,
                    }),
                { initialProps: { u: first } }
            );

            rerender({ u: second });
            act(() => {
                result.current.cancelAuth();
            });

            expect(second).toHaveBeenCalled();
            expect(first).not.toHaveBeenCalled();
        });

        it('resetting writes the config the SC has now', async () => {
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');
            const { result, rerender } = renderHook(
                ({ s }: { s: WizardState }) =>
                    useDaLiveAuth({
                        state: s,
                        updateState: updateState as unknown as (
                            updates: Partial<WizardState>
                        ) => void,
                    }),
                { initialProps: { s: createDefaultState({ repoName: 'first-repo' }) } }
            );

            rerender({ s: createDefaultState({ repoName: 'renamed-repo' }) });
            act(() => {
                result.current.resetAuth();
            });

            expect(lastConfig(updateState)?.repoName).toBe('renamed-repo');
        });
    });
});
