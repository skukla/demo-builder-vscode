/**
 * useAuthStatus Hook Tests - Message Handling & State
 *
 * Tests auth-status message handling, re-authentication state
 * preservation, and canProceed state updates.
 */

// Import mock exports from testUtils
import {
    mockPostMessage as _mockPostMessage,
    mockOnMessage,
    baseState,
    authenticatedState,
    stateWithProjectSelected,
    successAuthData,
    timeoutAuthData,
    checkingAuthData,
    reAuthSameOrgData,
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

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuthStatus } from '@/features/authentication/ui/hooks/useAuthStatus';
import { WizardState } from '@/types/webview';

describe('useAuthStatus - messages & state', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        resetMocks();
        mockUpdateState.mockClear();
        mockSetCanProceed.mockClear();
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
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

    describe('re-authentication state preservation', () => {
        it('should preserve project/workspace when re-authenticating with same org', async () => {
            let authCallback: ((data: unknown) => void) | null = null;
            mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
                if (type === 'auth-status') {
                    authCallback = callback;
                }
                return jest.fn();
            });

            const { result } = renderHook(() =>
                useAuthStatus({
                    state: stateWithProjectSelected as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            mockUpdateState.mockClear();

            act(() => {
                result.current.handleLogin(true);
            });

            mockUpdateState.mockClear();

            act(() => {
                authCallback?.(reAuthSameOrgData);
            });

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        adobeAuth: expect.objectContaining({
                            isAuthenticated: true,
                        }),
                        adobeOrg: expect.objectContaining({
                            id: 'org-123',
                        }),
                    })
                );
            });

            const allCalls = mockUpdateState.mock.calls;
            const clearedProject = allCalls.some(
                (call) => call[0]?.adobeProject === undefined && 'adobeProject' in call[0]
            );
            expect(clearedProject).toBe(false);
        });

        it('should clear project/workspace when re-authenticating with different org', async () => {
            let authCallback: ((data: unknown) => void) | null = null;
            mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
                if (type === 'auth-status') {
                    authCallback = callback;
                }
                return jest.fn();
            });

            const { result } = renderHook(() =>
                useAuthStatus({
                    state: stateWithProjectSelected as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            mockUpdateState.mockClear();

            act(() => {
                result.current.handleLogin(true);
            });

            mockUpdateState.mockClear();

            act(() => {
                authCallback?.(reAuthDifferentOrgData);
            });

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        adobeAuth: expect.objectContaining({
                            isAuthenticated: true,
                        }),
                        adobeOrg: expect.objectContaining({
                            id: 'org-999',
                        }),
                        adobeProject: undefined,
                        adobeWorkspace: undefined,
                    })
                );
            });
        });

        it('should clear state on regular auth check if org differs from state', async () => {
            let authCallback: ((data: unknown) => void) | null = null;
            mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
                if (type === 'auth-status') {
                    authCallback = callback;
                }
                return jest.fn();
            });

            renderHook(() =>
                useAuthStatus({
                    state: stateWithProjectSelected as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            mockUpdateState.mockClear();

            act(() => {
                authCallback?.(reAuthDifferentOrgData);
            });

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalled();
            });

            const allCalls = mockUpdateState.mock.calls;
            const clearedProject = allCalls.some(
                (call) => call[0]?.adobeProject === undefined && 'adobeProject' in call[0]
            );
            expect(clearedProject).toBe(true);
        });

        it('should NOT clear state on regular auth check if org matches state', async () => {
            let authCallback: ((data: unknown) => void) | null = null;
            mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
                if (type === 'auth-status') {
                    authCallback = callback;
                }
                return jest.fn();
            });

            renderHook(() =>
                useAuthStatus({
                    state: stateWithProjectSelected as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            mockUpdateState.mockClear();

            act(() => {
                authCallback?.(reAuthSameOrgData);
            });

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalled();
            });

            const allCalls = mockUpdateState.mock.calls;
            const clearedProject = allCalls.some(
                (call) => call[0]?.adobeProject === undefined && 'adobeProject' in call[0]
            );
            expect(clearedProject).toBe(false);
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
});
