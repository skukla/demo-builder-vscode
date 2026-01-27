/**
 * Unit Tests: useDaLiveAuth Hook
 *
 * Tests for the DA.live authentication state management hook.
 *
 * Coverage:
 * - Initial state and auth check on mount
 * - Auth status updates from backend
 * - Token verification flow
 * - Cancel auth (resets isAuthenticating without clearing token)
 * - Reset auth (clears everything)
 * - Error handling
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import type { WizardState, EDSConfig } from '@/types/webview';

// Mock webviewClient
const mockPostMessage = jest.fn();
let messageHandlers: Map<string, (data: unknown) => void> = new Map();

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: mockPostMessage,
        onMessage: jest.fn((type: string, handler: (data: unknown) => void) => {
            messageHandlers.set(type, handler);
            return () => messageHandlers.delete(type);
        }),
        ready: jest.fn().mockResolvedValue(undefined),
    },
}));

// Mock webviewLogger
jest.mock('@/core/ui/utils/webviewLogger', () => ({
    webviewLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// Default wizard state for hook tests
const createDefaultState = (overrides?: Partial<EDSConfig>): WizardState => ({
    currentStep: 'connect-services',
    projectName: 'test-project',
    projectTemplate: 'citisignal',
    adobeAuth: { isAuthenticated: true, isChecking: false },
    edsConfig: {
        accsHost: 'https://accs.example.com',
        storeViewCode: 'default',
        customerGroup: 'general',
        repoName: '',
        daLiveOrg: '',
        daLiveSite: '',
        ...overrides,
    },
});

// State with DA.live already authenticated
const createAuthenticatedState = (): WizardState => createDefaultState({
    daLiveOrg: 'test-org',
    daLiveAuth: {
        isAuthenticated: true,
        isAuthenticating: false,
    },
});

// State with DA.live authenticating in progress
const createAuthenticatingState = (): WizardState => createDefaultState({
    daLiveAuth: {
        isAuthenticated: false,
        isAuthenticating: true,
    },
});

describe('useDaLiveAuth Hook', () => {
    let mockUpdateState: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        messageHandlers.clear();
        mockUpdateState = jest.fn();
    });

    describe('initialization', () => {
        it('should check DA.live auth status on mount', async () => {
            // Given: Default state without DA.live auth
            const state = createDefaultState();

            // When: Hook is mounted
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');

            renderHook(() => useDaLiveAuth({
                state,
                updateState: mockUpdateState,
            }));

            // Then: Should send check-dalive-auth message
            expect(mockPostMessage).toHaveBeenCalledWith('check-dalive-auth');
        });

        it('should return isChecking true initially', async () => {
            // Given: Default state
            const state = createDefaultState();

            // When: Hook is mounted
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');

            const { result } = renderHook(() => useDaLiveAuth({
                state,
                updateState: mockUpdateState,
            }));

            // Then: isChecking should be true initially
            expect(result.current.isChecking).toBe(true);
        });
    });

    describe('auth status updates', () => {
        it('should update state when auth-status received with authenticated user', async () => {
            // Given: Default state
            const state = createDefaultState();
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');

            renderHook(() => useDaLiveAuth({
                state,
                updateState: mockUpdateState,
            }));

            // When: Receiving authenticated status with org
            const authHandler = messageHandlers.get('dalive-auth-status');
            expect(authHandler).toBeDefined();

            act(() => {
                authHandler?.({
                    isAuthenticated: true,
                    orgName: 'verified-org',
                });
            });

            // Then: Should update state with auth info
            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        edsConfig: expect.objectContaining({
                            daLiveOrg: 'verified-org',
                            daLiveAuth: expect.objectContaining({
                                isAuthenticated: true,
                                isAuthenticating: false,
                            }),
                        }),
                    })
                );
            });
        });

        it('should pre-fill org when unauthenticated with default orgName', async () => {
            // Given: Default state
            const state = createDefaultState();
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');

            renderHook(() => useDaLiveAuth({
                state,
                updateState: mockUpdateState,
            }));

            // When: Receiving unauthenticated status with orgName (from config setting)
            const authHandler = messageHandlers.get('dalive-auth-status');
            expect(authHandler).toBeDefined();

            act(() => {
                authHandler?.({
                    isAuthenticated: false,
                    orgName: 'default-org',
                });
            });

            // Then: Should update state with org for pre-fill
            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        edsConfig: expect.objectContaining({
                            daLiveOrg: 'default-org',
                            daLiveAuth: expect.objectContaining({
                                isAuthenticated: false,
                                isAuthenticating: false,
                            }),
                        }),
                    })
                );
            });
        });

        it('should set isChecking to false after receiving auth status', async () => {
            // Given: Default state
            const state = createDefaultState();
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');

            const { result } = renderHook(() => useDaLiveAuth({
                state,
                updateState: mockUpdateState,
            }));

            // Verify initially checking
            expect(result.current.isChecking).toBe(true);

            // When: Receiving auth status
            const authHandler = messageHandlers.get('dalive-auth-status');
            act(() => {
                authHandler?.({ isAuthenticated: false });
            });

            // Then: isChecking should be false
            await waitFor(() => {
                expect(result.current.isChecking).toBe(false);
            });
        });
    });

    describe('openDaLive', () => {
        it('should set isAuthenticating and send message when opening DA.live', async () => {
            // Given: Default state
            const state = createDefaultState();
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');

            const { result } = renderHook(() => useDaLiveAuth({
                state,
                updateState: mockUpdateState,
            }));

            mockUpdateState.mockClear();

            // When: Opening DA.live
            act(() => {
                result.current.openDaLive();
            });

            // Then: Should set authenticating and send message
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    edsConfig: expect.objectContaining({
                        daLiveAuth: expect.objectContaining({
                            isAuthenticating: true,
                            error: undefined,
                        }),
                    }),
                })
            );
            expect(mockPostMessage).toHaveBeenCalledWith('open-dalive-login');
        });
    });

    describe('storeTokenWithOrg', () => {
        it('should send token and org for verification', async () => {
            // Given: State with DA.live setup in progress
            const state = createDefaultState();
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');

            const { result } = renderHook(() => useDaLiveAuth({
                state,
                updateState: mockUpdateState,
            }));

            mockPostMessage.mockClear();

            // When: Storing token with org
            act(() => {
                result.current.storeTokenWithOrg('test-token', 'test-org');
            });

            // Then: Should send verification message
            expect(mockPostMessage).toHaveBeenCalledWith('store-dalive-token-with-org', {
                token: 'test-token',
                orgName: 'test-org',
            });
        });

        it('should update state on successful verification', async () => {
            // Given: State with DA.live setup in progress
            const state = createDefaultState();
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');

            renderHook(() => useDaLiveAuth({
                state,
                updateState: mockUpdateState,
            }));

            // When: Receiving successful verification
            const resultHandler = messageHandlers.get('dalive-token-with-org-result');
            expect(resultHandler).toBeDefined();

            act(() => {
                resultHandler?.({
                    success: true,
                    orgName: 'verified-org',
                });
            });

            // Then: Should update state with verified org
            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        edsConfig: expect.objectContaining({
                            daLiveOrg: 'verified-org',
                            daLiveAuth: expect.objectContaining({
                                isAuthenticated: true,
                                isAuthenticating: false,
                            }),
                        }),
                    })
                );
            });
        });

        it('should handle verification failure', async () => {
            // Given: State with DA.live setup in progress
            const state = createDefaultState();
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');

            renderHook(() => useDaLiveAuth({
                state,
                updateState: mockUpdateState,
            }));

            // When: Receiving failed verification
            const resultHandler = messageHandlers.get('dalive-token-with-org-result');

            act(() => {
                resultHandler?.({
                    success: false,
                    error: 'Invalid token',
                });
            });

            // Then: Should update state with error
            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        edsConfig: expect.objectContaining({
                            daLiveAuth: expect.objectContaining({
                                isAuthenticated: false,
                                isAuthenticating: false,
                                error: 'Invalid token',
                            }),
                        }),
                    })
                );
            });
        });
    });

    describe('cancelAuth', () => {
        it('should reset isAuthenticating without clearing token or org', async () => {
            // Given: State with authentication in progress
            const state = createAuthenticatingState();
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');

            const { result } = renderHook(() => useDaLiveAuth({
                state,
                updateState: mockUpdateState,
            }));

            mockUpdateState.mockClear();

            // When: Cancelling auth
            act(() => {
                result.current.cancelAuth();
            });

            // Then: Should only reset isAuthenticating
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    edsConfig: expect.objectContaining({
                        daLiveAuth: expect.objectContaining({
                            isAuthenticating: false,
                            error: undefined,
                        }),
                    }),
                })
            );

            // Should NOT clear the daLiveOrg or send clear message
            expect(mockPostMessage).not.toHaveBeenCalledWith('clear-dalive-auth');
        });

        it('should not send any backend message when cancelling', async () => {
            // Given: Default state
            const state = createDefaultState();
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');

            const { result } = renderHook(() => useDaLiveAuth({
                state,
                updateState: mockUpdateState,
            }));

            mockPostMessage.mockClear();

            // When: Cancelling auth
            act(() => {
                result.current.cancelAuth();
            });

            // Then: Should NOT send any message to backend
            // (cancelAuth only updates local state)
            const clearCalls = mockPostMessage.mock.calls.filter(
                call => call[0] === 'clear-dalive-auth'
            );
            expect(clearCalls).toHaveLength(0);
        });
    });

    describe('resetAuth', () => {
        it('should clear all auth state and send clear message', async () => {
            // Given: Authenticated state
            const state = createAuthenticatedState();
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');

            const { result } = renderHook(() => useDaLiveAuth({
                state,
                updateState: mockUpdateState,
            }));

            mockUpdateState.mockClear();
            mockPostMessage.mockClear();

            // When: Resetting auth
            act(() => {
                result.current.resetAuth();
            });

            // Then: Should clear all auth state
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    edsConfig: expect.objectContaining({
                        daLiveOrg: '',
                        daLiveSite: '',
                        daLiveAuth: expect.objectContaining({
                            isAuthenticated: false,
                            isAuthenticating: false,
                        }),
                    }),
                    daLiveSitesCache: undefined,
                })
            );

            // Should send clear message to backend
            expect(mockPostMessage).toHaveBeenCalledWith('clear-dalive-auth');
        });
    });

    describe('error handling', () => {
        it('should handle dalive-auth-error message', async () => {
            // Given: Default state
            const state = createDefaultState();
            const { useDaLiveAuth } = await import('@/features/eds/ui/hooks/useDaLiveAuth');

            renderHook(() => useDaLiveAuth({
                state,
                updateState: mockUpdateState,
            }));

            // When: Receiving auth error
            const errorHandler = messageHandlers.get('dalive-auth-error');
            expect(errorHandler).toBeDefined();

            act(() => {
                errorHandler?.({
                    error: 'Token expired',
                });
            });

            // Then: Should update state with error
            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        edsConfig: expect.objectContaining({
                            daLiveAuth: expect.objectContaining({
                                isAuthenticated: false,
                                isAuthenticating: false,
                                error: 'Token expired',
                            }),
                        }),
                    })
                );
            });
        });
    });
});
