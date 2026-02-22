/**
 * useAuthStatus Hook Tests - Core Behavior
 *
 * Tests initialization, checkAuthentication, handleLogin,
 * showLoadingSpinner, and cleanup behavior.
 */

// Import mock exports from testUtils
import {
    mockPostMessage,
    mockOnMessage,
    mockRequestAuth,
    baseState,
    stateWithProjectSelected,
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

describe('useAuthStatus - core', () => {
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

    describe('initialization', () => {
        it('should return initial state values and begin checking', () => {
            const { result } = renderHook(() =>
                useAuthStatus({
                    state: baseState as WizardState,
                    updateState: mockUpdateState,
                    setCanProceed: mockSetCanProceed,
                })
            );

            expect(result.current.authStatus).toBe('Checking Adobe authentication...');
            expect(result.current.authSubMessage).toBe('');
            expect(result.current.authTimeout).toBe(false);
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

            mockPostMessage.mockClear();

            act(() => {
                result.current.checkAuthentication();
            });

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

        it('should request forced auth without immediately clearing state when force=true', () => {
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

            expect(mockRequestAuth).toHaveBeenCalledWith(true);
            expect(mockUpdateState).toHaveBeenCalledWith({
                adobeAuth: expect.objectContaining({
                    isChecking: true,
                    error: undefined,
                }),
            });
            expect(mockUpdateState).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeOrg: undefined,
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
