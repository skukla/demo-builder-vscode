/**
 * Unit Tests: useGitHubAuth Hook
 *
 * Tests for the GitHub OAuth state management hook.
 *
 * Coverage: 4 tests
 * - Initial state check (1 test)
 * - Auth status updates (1 test)
 * - OAuth flow state (1 test)
 * - Error handling (1 test)
 */

import {
    createDefaultState,
    messageHandlers,
    mockPostMessage,
} from './edsAuthHooks.testUtils';
import { renderHook, act, waitFor } from '@testing-library/react';

describe('useGitHubAuth Hook', () => {
    let mockUpdateState: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        messageHandlers.clear();
        mockUpdateState = jest.fn();
        // ABSORB the expected OAuth failure. This suite has an error-path test,
        // and webviewLogger.error logs unconditionally — deliberately, since an
        // error is never dev-only. In beforeEach, not beforeAll: the console
        // gate installs its wrapper in a setup-file beforeEach that runs first,
        // so a beforeAll spy would be wrapped BY the gate and still counted.
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    /**
     * The mounted-but-unanswered state, asserted whole and asserted FIRST.
     *
     * `EMPTY_ORGS` is a module-level constant, so it is initialised once when
     * the hook module is first imported — which means the mutation run
     * attributes it to whichever test imports the module first, and only that
     * test can catch a wrong default. Keep the `orgs` assertion here.
     */
    it('checks GitHub auth on mount and reports checking, signed-out, no orgs', async () => {
        // Given: Default state without GitHub auth
        const state = createDefaultState();

        // When: Hook is mounted
        const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

        const { result } = renderHook(() => useGitHubAuth({
            state,
            updateState: mockUpdateState,
        }));

        // Then: Should send check-github-auth message
        expect(mockPostMessage).toHaveBeenCalledWith('check-github-auth');
        expect(result.current.isChecking).toBe(true);
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.isAuthenticating).toBe(false);
        expect(result.current.orgs).toEqual([]);
    });

    it('should update state when auth-status received', async () => {
        // Given: Default state
        const state = createDefaultState();

        // When: Hook receives auth-status message
        const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

        renderHook(() => useGitHubAuth({
            state,
            updateState: mockUpdateState,
        }));

        // Simulate receiving auth status
        const authHandler = messageHandlers.get('github-auth-status');
        expect(authHandler).toBeDefined();

        act(() => {
            authHandler?.({
                isAuthenticated: true,
                user: { login: 'testuser', avatarUrl: 'https://example.com/avatar' },
            });
        });

        // Then: Should update state with auth info
        await waitFor(() => {
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    edsConfig: expect.objectContaining({
                        githubAuth: expect.objectContaining({
                            isAuthenticated: true,
                            user: expect.objectContaining({ login: 'testuser' }),
                        }),
                    }),
                })
            );
        });
    });

    it('should set isAuthenticating during OAuth flow', async () => {
        // Given: Default state
        const state = createDefaultState();

        // When: OAuth is initiated
        const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

        const { result } = renderHook(() => useGitHubAuth({
            state,
            updateState: mockUpdateState,
        }));

        // Trigger OAuth
        act(() => {
            result.current.startOAuth();
        });

        // Then: Should set authenticating state and send message
        expect(mockUpdateState).toHaveBeenCalledWith(
            expect.objectContaining({
                edsConfig: expect.objectContaining({
                    githubAuth: expect.objectContaining({
                        isAuthenticating: true,
                    }),
                }),
            })
        );
        expect(mockPostMessage).toHaveBeenCalledWith('github-oauth');
    });

    it('should handle OAuth error response', async () => {
        // Given: Default state
        const state = createDefaultState();

        // When: OAuth error is received
        const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

        renderHook(() => useGitHubAuth({
            state,
            updateState: mockUpdateState,
        }));

        // Simulate receiving OAuth error
        const errorHandler = messageHandlers.get('github-oauth-error');
        expect(errorHandler).toBeDefined();

        act(() => {
            errorHandler?.({
                error: 'OAuth failed: User cancelled',
            });
        });

        // Then: Should update state with error
        await waitFor(() => {
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    edsConfig: expect.objectContaining({
                        githubAuth: expect.objectContaining({
                            isAuthenticated: false,
                            isAuthenticating: false,
                            error: expect.stringContaining('cancelled'),
                        }),
                    }),
                })
            );
        });
    });
    /**
     * What the hook REPORTS, as distinct from what it was told.
     *
     * Every consumer reads these three flags to decide whether to show a
     * sign-in button, a spinner, or the repo picker. `|| false` is what keeps
     * an absent `githubAuth` from reporting `undefined` into a boolean prop.
     */
    describe('the reported flags', () => {
        it('reports the flags the wizard state already carries', async () => {
            const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

            const { result } = renderHook(() =>
                useGitHubAuth({
                    state: createDefaultState({
                        githubAuth: {
                            isAuthenticated: true,
                            isAuthenticating: true,
                            user: { login: 'octocat', email: null, name: null, avatarUrl: null },
                            error: 'stale error',
                        },
                    }),
                    updateState: mockUpdateState,
                })
            );

            expect(result.current.isAuthenticated).toBe(true);
            expect(result.current.isAuthenticating).toBe(true);
            expect(result.current.user).toEqual(
                expect.objectContaining({ login: 'octocat' })
            );
            expect(result.current.error).toBe('stale error');
        });

        it('renders signed-out rather than throwing when the state has no edsConfig', async () => {
            // The wizard reaches this step with edsConfig unset on a fresh
            // project; reading through it unguarded takes the whole step down.
            const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

            const { result } = renderHook(() =>
                useGitHubAuth({
                    state: { ...createDefaultState(), edsConfig: undefined },
                    updateState: mockUpdateState,
                })
            );

            expect(result.current.isAuthenticated).toBe(false);
            expect(result.current.user).toBeUndefined();
        });
    });

    /**
     * The three actions, each asserted by the MESSAGE it sends and the state it
     * writes — not by the hook's own return value, which they do not change.
     */
    describe('the actions', () => {
        it('checkAuthStatus re-asks the extension', async () => {
            const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

            const { result } = renderHook(() =>
                useGitHubAuth({ state: createDefaultState(), updateState: mockUpdateState })
            );
            // The mount check already fired; this proves the callback re-asks.
            mockPostMessage.mockClear();

            act(() => {
                result.current.checkAuthStatus();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('check-github-auth');
        });

        it('changeAccount signs out, starts authenticating and drops the user', async () => {
            // Switching accounts must not leave the previous login on screen
            // while the new OAuth window is open.
            const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

            const { result } = renderHook(() =>
                useGitHubAuth({
                    state: createDefaultState({
                        githubAuth: {
                            isAuthenticated: true,
                            user: { login: 'octocat', email: null, name: null, avatarUrl: null },
                        },
                    }),
                    updateState: mockUpdateState,
                })
            );

            act(() => {
                result.current.changeAccount();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('github-change-account');
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    edsConfig: expect.objectContaining({
                        githubAuth: {
                            isAuthenticated: false,
                            isAuthenticating: true,
                            user: undefined,
                            error: undefined,
                        },
                    }),
                })
            );
        });

        it('startOAuth preserves the signed-in flag it was not asked to change', async () => {
            const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

            const { result } = renderHook(() =>
                useGitHubAuth({
                    state: createDefaultState({ githubAuth: { isAuthenticated: true } }),
                    updateState: mockUpdateState,
                })
            );

            act(() => {
                result.current.startOAuth();
            });

            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    edsConfig: expect.objectContaining({
                        githubAuth: expect.objectContaining({ isAuthenticated: true }),
                    }),
                })
            );
        });

        it('startOAuth writes signed-out when the state carries no githubAuth', async () => {
            // `undefined` into a boolean prop is the bug the `|| false` prevents.
            const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

            const { result } = renderHook(() =>
                useGitHubAuth({ state: createDefaultState(), updateState: mockUpdateState })
            );

            act(() => {
                result.current.startOAuth();
            });

            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    edsConfig: expect.objectContaining({
                        githubAuth: expect.objectContaining({ isAuthenticated: false }),
                    }),
                })
            );
        });

        it('writes the LATEST edsConfig, not the one present at mount', async () => {
            // The updater is memoised on edsConfig. Memoising it on nothing
            // makes every later write clobber the wizard state with the values
            // the step was mounted with — the user's typed repo name included.
            const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');

            const { result, rerender } = renderHook(
                ({ state }) => useGitHubAuth({ state, updateState: mockUpdateState }),
                { initialProps: { state: createDefaultState({ repoName: 'first-repo' }) } }
            );
            rerender({ state: createDefaultState({ repoName: 'second-repo' }) });

            act(() => {
                result.current.startOAuth();
            });

            expect(mockUpdateState).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    edsConfig: expect.objectContaining({ repoName: 'second-repo' }),
                })
            );
        });
    });

    /**
     * The three pushes from the extension. Each ends the initial check, and two
     * of them carry the org list the namespace picker is built from.
     */
    describe('incoming pushes', () => {
        const renderAndPush = async (
            type: string,
            payload: Record<string, unknown>,
            overrides?: Parameters<typeof createDefaultState>[0]
        ) => {
            const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');
            const { result } = renderHook(() =>
                useGitHubAuth({ state: createDefaultState(overrides), updateState: mockUpdateState })
            );
            act(() => {
                messageHandlers.get(type)?.(payload);
            });
            return result;
        };

        it('auth-status ends the initial check and stops any authenticating spinner', async () => {
            const result = await renderAndPush('github-auth-status', { isAuthenticated: false });

            expect(result.current.isChecking).toBe(false);
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    edsConfig: expect.objectContaining({
                        githubAuth: expect.objectContaining({ isAuthenticating: false }),
                    }),
                })
            );
        });

        it('auth-status keeps the orgs it was sent', async () => {
            const result = await renderAndPush('github-auth-status', {
                isAuthenticated: true,
                orgs: ['adobe', 'hlxsites'],
            });

            expect(result.current.orgs).toEqual(['adobe', 'hlxsites']);
        });

        it('auth-status with no orgs reports an empty list, never undefined', async () => {
            // `orgs` feeds a picker that maps over it.
            const result = await renderAndPush('github-auth-status', { isAuthenticated: true });

            expect(result.current.orgs).toEqual([]);
        });

        it('auth-complete ends the check, records the login and clears the error', async () => {
            const result = await renderAndPush(
                'github-auth-complete',
                {
                    isAuthenticated: true,
                    user: { login: 'octocat', email: null, name: null, avatarUrl: null },
                    orgs: ['adobe'],
                },
                { githubAuth: { isAuthenticated: false, error: 'the failure that just got fixed' } }
            );

            expect(result.current.isChecking).toBe(false);
            expect(result.current.orgs).toEqual(['adobe']);
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    edsConfig: expect.objectContaining({
                        githubAuth: expect.objectContaining({
                            isAuthenticated: true,
                            isAuthenticating: false,
                            user: expect.objectContaining({ login: 'octocat' }),
                            error: undefined,
                        }),
                    }),
                })
            );
        });

        it('auth-complete with no orgs reports an empty list, never undefined', async () => {
            const result = await renderAndPush('github-auth-complete', { isAuthenticated: true });

            expect(result.current.orgs).toEqual([]);
        });

        it('an OAuth error ends the initial check too', async () => {
            // Otherwise the step sits on its spinner forever after a refusal.
            const result = await renderAndPush('github-oauth-error', { error: 'User cancelled' });

            expect(result.current.isChecking).toBe(false);
        });

        it('unsubscribes from all three pushes on unmount', async () => {
            const { useGitHubAuth } = await import('@/features/eds/ui/hooks/useGitHubAuth');
            const { unmount } = renderHook(() =>
                useGitHubAuth({ state: createDefaultState(), updateState: mockUpdateState })
            );
            expect(messageHandlers.has('github-auth-status')).toBe(true);

            unmount();

            expect(messageHandlers.has('github-auth-status')).toBe(false);
            expect(messageHandlers.has('github-auth-complete')).toBe(false);
            expect(messageHandlers.has('github-oauth-error')).toBe(false);
        });
    });
});
