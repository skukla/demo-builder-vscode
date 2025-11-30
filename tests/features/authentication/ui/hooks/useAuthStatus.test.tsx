/**
 * useAuthStatus Hook Tests
 *
 * Tests authentication status management, message handling,
 * timeout scenarios, and canProceed state updates.
 */

// Import mock exports from testUtils
import {
    mockPostMessage,
    mockOnMessage,
    mockRequestAuth,
    baseState,
    authenticatedState,
    successAuthData,
    timeoutAuthData,
    checkingAuthData,
    resetMocks,
    AuthStatusData,
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

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuthStatus } from '@/features/authentication/ui/hooks/useAuthStatus';
import { WizardState } from '@/types/webview';

describe('useAuthStatus', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        resetMocks();
        mockUpdateState.mockClear();
        mockSetCanProceed.mockClear();
        // Suppress console.log in tests
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('initialization', () => {
        it('should return initial state values and begin checking', () => {
            const { result } = renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            // Hook calls checkAuthentication on mount, so authStatus is set
            expect(result.current.authStatus).toBe('Checking Adobe authentication...');
            expect(result.current.authSubMessage).toBe('');
            expect(result.current.authTimeout).toBe(false);
            // showLoadingSpinner reads from state.adobeAuth.isChecking which is still false
            // until the updateState callback is invoked and state re-renders
            expect(result.current.showLoadingSpinner).toBe(false);
        });

        it('should check authentication on mount', () => {
            renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            expect(mockPostMessage).toHaveBeenCalledWith('check-auth');
        });

        it('should subscribe to auth-status messages', () => {
            renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            expect(mockOnMessage).toHaveBeenCalledWith('auth-status', expect.any(Function));
        });
    });

    describe('checkAuthentication', () => {
        it('should update state to isChecking when called', () => {
            const { result } = renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            // Clear initial check-auth call
            mockPostMessage.mockClear();
            mockUpdateState.mockClear();

            act(() => {
                result.current.checkAuthentication();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('check-auth');
            expect(mockUpdateState).toHaveBeenCalledWith({
                adobeAuth: expect.objectContaining({
                    isChecking: true,
                }),
            });
        });

        it('should skip check if already checking', () => {
            const checkingState = {
                ...baseState,
                adobeAuth: {
                    ...baseState.adobeAuth!,
                    isChecking: true,
                },
            };

            const { result } = renderHook(() =>
                useAuthStatus({
                    state: checkingState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            // Clear initial calls
            mockPostMessage.mockClear();

            act(() => {
                result.current.checkAuthentication();
            });

            // Should not call postMessage again
            expect(mockPostMessage).not.toHaveBeenCalled();
        });

        it('should set authStatus message when checking', () => {
            const { result } = renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            // Clear initial check
            mockPostMessage.mockClear();

            act(() => {
                result.current.checkAuthentication();
            });

            expect(result.current.authStatus).toBe('Checking Adobe authentication...');
        });
    });

    describe('handleLogin', () => {
        it('should reset state and request auth', () => {
            const { result } = renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            mockUpdateState.mockClear();

            act(() => {
                result.current.handleLogin();
            });

            expect(mockRequestAuth).toHaveBeenCalledWith(false);
            expect(mockUpdateState).toHaveBeenCalledWith({
                adobeAuth: expect.objectContaining({
                    isChecking: true,
                    error: undefined,
                }),
            });
        });

        it('should force login and clear org/project/workspace when force=true', () => {
            const { result } = renderHook(() =>
                useAuthStatus({
                    state: authenticatedState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            mockUpdateState.mockClear();

            act(() => {
                result.current.handleLogin(true);
            });

            expect(mockRequestAuth).toHaveBeenCalledWith(true);
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeOrg: undefined,
                    adobeProject: undefined,
                    adobeWorkspace: undefined,
                })
            );
        });

        it('should clear auth status and timeout on login', () => {
            const { result } = renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            act(() => {
                result.current.handleLogin();
            });

            expect(result.current.authStatus).toBe('');
            expect(result.current.authSubMessage).toBe('');
            expect(result.current.authTimeout).toBe(false);
        });
    });

    describe('auth-status message handling', () => {
        it('should update state on successful auth response', async () => {
            let authCallback: ((data: unknown) => void) | null = null;
            mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
                if (type === 'auth-status') {
                    authCallback = callback;
                }
                return jest.fn();
            });

            const { result } = renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            mockUpdateState.mockClear();

            // Simulate auth status message
            act(() => {
                authCallback?.(successAuthData);
            });

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        adobeAuth: expect.objectContaining({
                            isAuthenticated: true,
                            email: 'user@adobe.com',
                        }),
                        adobeOrg: expect.objectContaining({
                            id: 'org-123',
                            code: 'ORG123',
                            name: 'Test Organization',
                        }),
                    })
                );
            });

            expect(result.current.authStatus).toBe('Authenticated successfully');
            expect(result.current.authSubMessage).toBe('Welcome back!');
        });

        it('should handle timeout error', async () => {
            let authCallback: ((data: unknown) => void) | null = null;
            mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
                if (type === 'auth-status') {
                    authCallback = callback;
                }
                return jest.fn();
            });

            const { result } = renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            // Simulate timeout message
            act(() => {
                authCallback?.(timeoutAuthData);
            });

            await waitFor(() => {
                expect(result.current.authTimeout).toBe(true);
            });

            expect(result.current.authStatus).toBe('Authentication timed out');
            expect(result.current.authSubMessage).toBe('Please try again');
        });

        it('should update auth state when checking response received', async () => {
            let authCallback: ((data: unknown) => void) | null = null;
            mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
                if (type === 'auth-status') {
                    authCallback = callback;
                }
                return jest.fn();
            });

            const { result } = renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            mockUpdateState.mockClear();

            // Simulate checking message
            act(() => {
                authCallback?.(checkingAuthData);
            });

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        adobeAuth: expect.objectContaining({
                            isChecking: true,
                        }),
                    })
                );
            });

            expect(result.current.authTimeout).toBe(false);
        });

        it('should handle empty message and subMessage gracefully', async () => {
            let authCallback: ((data: unknown) => void) | null = null;
            mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
                if (type === 'auth-status') {
                    authCallback = callback;
                }
                return jest.fn();
            });

            const { result } = renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            // Simulate message with no message/subMessage
            act(() => {
                authCallback?.({
                    isAuthenticated: true,
                });
            });

            await waitFor(() => {
                expect(result.current.authStatus).toBe('');
                expect(result.current.authSubMessage).toBe('');
            });
        });
    });

    describe('canProceed updates', () => {
        it('should set canProceed to true when authenticated with org and not expiring', () => {
            renderHook(() =>
                useAuthStatus({
                    state: authenticatedState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should set canProceed to false when not authenticated', () => {
            renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should set canProceed to false when no org selected', () => {
            const noOrgState = {
                ...authenticatedState,
                adobeOrg: undefined,
            };

            renderHook(() =>
                useAuthStatus({
                    state: noOrgState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should set canProceed to false when token expiring soon', () => {
            const expiringState = {
                ...authenticatedState,
                adobeAuth: {
                    ...authenticatedState.adobeAuth!,
                    tokenExpiringSoon: true,
                },
            };

            renderHook(() =>
                useAuthStatus({
                    state: expiringState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    describe('showLoadingSpinner', () => {
        it('should reflect isChecking from state', () => {
            const checkingState = {
                ...baseState,
                adobeAuth: {
                    ...baseState.adobeAuth!,
                    isChecking: true,
                },
            };

            const { result } = renderHook(() =>
                useAuthStatus({
                    state: checkingState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            expect(result.current.showLoadingSpinner).toBe(true);
        });

        it('should be false when not checking', () => {
            const { result } = renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            expect(result.current.showLoadingSpinner).toBe(false);
        });
    });

    describe('cleanup', () => {
        it('should unsubscribe from messages on unmount', () => {
            const unsubscribe = jest.fn();
            mockOnMessage.mockReturnValue(unsubscribe);

            const { unmount } = renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            unmount();

            expect(unsubscribe).toHaveBeenCalled();
        });
    });
});
