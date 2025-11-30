/**
 * Tests for ErrorCode integration in useAuthStatus hook
 *
 * Verifies that the hook extracts and exposes error codes from backend responses.
 */

// Import mock exports from testUtils
import {
    mockPostMessage,
    mockOnMessage,
    mockRequestAuth,
    baseState,
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
import { ErrorCode } from '@/types/errorCodes';
import { useAuthStatus } from '@/features/authentication/ui/hooks/useAuthStatus';
import { WizardState } from '@/types/webview';

describe('useAuthStatus error code handling', () => {
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

    it('extracts code from backend response with TIMEOUT', async () => {
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

        // Simulate backend response with error code
        act(() => {
            authCallback?.({
                isAuthenticated: false,
                error: 'Operation timed out',
                code: ErrorCode.TIMEOUT,
                message: 'Authentication check timed out',
                subMessage: 'Please try again',
            });
        });

        // Verify the hook sets authTimeout when code is TIMEOUT
        await waitFor(() => {
            expect(result.current.authTimeout).toBe(true);
        });

        // Verify updateState was called with the code
        expect(mockUpdateState).toHaveBeenCalledWith(
            expect.objectContaining({
                adobeAuth: expect.objectContaining({
                    error: 'Operation timed out',
                    code: ErrorCode.TIMEOUT,
                }),
            })
        );
    });

    it('sets authTimeout true when code is TIMEOUT', async () => {
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

        // Simulate timeout response using code
        act(() => {
            authCallback?.({
                isAuthenticated: false,
                error: 'timeout',
                code: ErrorCode.TIMEOUT,
            });
        });

        await waitFor(() => {
            expect(result.current.authTimeout).toBe(true);
        });
    });

    it('does NOT set authTimeout when code is NETWORK (not TIMEOUT)', async () => {
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

        // Simulate response with NETWORK code (not TIMEOUT)
        act(() => {
            authCallback?.({
                isAuthenticated: false,
                error: 'network error',
                code: ErrorCode.NETWORK, // Different code
            });
        });

        // Should NOT be treated as timeout
        await waitFor(() => {
            expect(result.current.authTimeout).toBe(false);
        });
    });

    it('extracts AUTH_NO_APP_BUILDER code', async () => {
        let authCallback: ((data: unknown) => void) | null = null;
        mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
            if (type === 'auth-status') {
                authCallback = callback;
            }
            return jest.fn();
        });

        renderHook(() =>
            useAuthStatus({
                state: baseState as WizardState,
                updateState: mockUpdateState,
                setCanProceed: mockSetCanProceed,
            })
        );

        mockUpdateState.mockClear();

        act(() => {
            authCallback?.({
                isAuthenticated: false,
                error: 'No App Builder access',
                code: ErrorCode.AUTH_NO_APP_BUILDER,
                orgLacksAccess: true,
            });
        });

        await waitFor(() => {
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeAuth: expect.objectContaining({
                        code: ErrorCode.AUTH_NO_APP_BUILDER,
                        orgLacksAccess: true,
                    }),
                })
            );
        });
    });

    it('extracts NETWORK code', async () => {
        let authCallback: ((data: unknown) => void) | null = null;
        mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
            if (type === 'auth-status') {
                authCallback = callback;
            }
            return jest.fn();
        });

        renderHook(() =>
            useAuthStatus({
                state: baseState as WizardState,
                updateState: mockUpdateState,
                setCanProceed: mockSetCanProceed,
            })
        );

        mockUpdateState.mockClear();

        act(() => {
            authCallback?.({
                isAuthenticated: false,
                error: 'Network connection failed',
                code: ErrorCode.NETWORK,
            });
        });

        await waitFor(() => {
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeAuth: expect.objectContaining({
                        error: 'Network connection failed',
                        code: ErrorCode.NETWORK,
                    }),
                })
            );
        });
    });

    it('handles response without code field (backward compatibility)', async () => {
        let authCallback: ((data: unknown) => void) | null = null;
        mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
            if (type === 'auth-status') {
                authCallback = callback;
            }
            return jest.fn();
        });

        renderHook(() =>
            useAuthStatus({
                state: baseState as WizardState,
                updateState: mockUpdateState,
                setCanProceed: mockSetCanProceed,
            })
        );

        mockUpdateState.mockClear();

        // Simulate legacy response without code
        act(() => {
            authCallback?.({
                isAuthenticated: false,
                error: 'Some error',
                // No code field - backward compatibility
            });
        });

        // Should still work, just without code
        await waitFor(() => {
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeAuth: expect.objectContaining({
                        error: 'Some error',
                        // code will be undefined
                    }),
                })
            );
        });
    });

    it('passes through for successful authentication', async () => {
        let authCallback: ((data: unknown) => void) | null = null;
        mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
            if (type === 'auth-status') {
                authCallback = callback;
            }
            return jest.fn();
        });

        renderHook(() =>
            useAuthStatus({
                state: baseState as WizardState,
                updateState: mockUpdateState,
                setCanProceed: mockSetCanProceed,
            })
        );

        mockUpdateState.mockClear();

        act(() => {
            authCallback?.({
                isAuthenticated: true,
                email: 'user@example.com',
                // No error or code for successful auth
            });
        });

        await waitFor(() => {
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeAuth: expect.objectContaining({
                        isAuthenticated: true,
                        email: 'user@example.com',
                    }),
                })
            );
        });
    });
});
