/**
 * Tests for ErrorCode integration in useSelectionStep hook
 *
 * Verifies that the hook extracts and exposes error codes from backend responses.
 */

// Import mock exports from testUtils
import {
    useSelectionStep,
} from './useSelectionStep.testUtils';
import {
    mockOnMessage,
    TestItem,
    baseState,
    testItems,
    resetMocks,
} from './useSelectionStep.testUtils';

import { renderHook, act, waitFor } from '@testing-library/react';
import { ErrorCode } from '@/types/errorCodes';
import { WizardState } from '@/types/webview';

describe('useSelectionStep error code handling', () => {
    const mockUpdateState = jest.fn();

    beforeEach(() => {
        resetMocks();
        mockUpdateState.mockClear();
    });

    it('extracts TIMEOUT error code from structured response', async () => {
        let messageCallback: ((data: unknown) => void) | null = null;
        mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
            if (type === 'test-items') {
                messageCallback = callback;
            }
            return jest.fn();
        });

        const { result } = renderHook(() =>
            useSelectionStep<TestItem>({
                cacheKey: 'projectsCache',
                messageType: 'test-items',
                errorMessageType: 'test-error',
                state: baseState as WizardState,
                updateState: mockUpdateState,
                autoLoad: false,
            })
        );

        // Trigger load
        act(() => {
            result.current.load();
        });

        // Simulate error response with code
        act(() => {
            messageCallback?.({
                error: 'Operation timed out',
                code: ErrorCode.TIMEOUT,
            });
        });

        await waitFor(() => {
            expect(result.current.error).toBe('Operation timed out');
            expect(result.current.errorCode).toBe(ErrorCode.TIMEOUT);
        });
    });

    it('extracts NETWORK error code from error message channel', async () => {
        let errorCallback: ((data: unknown) => void) | null = null;
        mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
            if (type === 'test-error') {
                errorCallback = callback;
            }
            return jest.fn();
        });

        const { result } = renderHook(() =>
            useSelectionStep<TestItem>({
                cacheKey: 'projectsCache',
                messageType: 'test-items',
                errorMessageType: 'test-error',
                state: baseState as WizardState,
                updateState: mockUpdateState,
                autoLoad: false,
            })
        );

        // Trigger load
        act(() => {
            result.current.load();
        });

        // Simulate error with code
        act(() => {
            errorCallback?.({
                error: 'Network connection failed',
                code: ErrorCode.NETWORK,
            });
        });

        await waitFor(() => {
            expect(result.current.error).toBe('Network connection failed');
            expect(result.current.errorCode).toBe(ErrorCode.NETWORK);
        });
    });

    it('returns null errorCode when no error', () => {
        const stateWithItems = {
            ...baseState,
            projectsCache: testItems,
        };

        const { result } = renderHook(() =>
            useSelectionStep<TestItem>({
                cacheKey: 'projectsCache',
                messageType: 'test-items',
                errorMessageType: 'test-error',
                state: stateWithItems as WizardState,
                updateState: mockUpdateState,
                autoLoad: false,
            })
        );

        expect(result.current.error).toBeNull();
        expect(result.current.errorCode).toBeNull();
    });

    it('clears errorCode when items load successfully', async () => {
        let messageCallback: ((data: unknown) => void) | null = null;
        mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
            if (type === 'test-items') {
                messageCallback = callback;
            }
            return jest.fn();
        });

        const { result } = renderHook(() =>
            useSelectionStep<TestItem>({
                cacheKey: 'projectsCache',
                messageType: 'test-items',
                errorMessageType: 'test-error',
                state: baseState as WizardState,
                updateState: mockUpdateState,
                autoLoad: false,
            })
        );

        // First: trigger an error
        act(() => {
            result.current.load();
        });

        act(() => {
            messageCallback?.({
                error: 'Operation timed out',
                code: ErrorCode.TIMEOUT,
            });
        });

        await waitFor(() => {
            expect(result.current.errorCode).toBe(ErrorCode.TIMEOUT);
        });

        // Second: successful load should clear the error
        act(() => {
            result.current.load();
        });

        act(() => {
            messageCallback?.(testItems);
        });

        await waitFor(() => {
            expect(result.current.error).toBeNull();
            expect(result.current.errorCode).toBeNull();
        });
    });

    it('handles response without code field (backward compatibility)', async () => {
        let errorCallback: ((data: unknown) => void) | null = null;
        mockOnMessage.mockImplementation((type: string, callback: (data: unknown) => void) => {
            if (type === 'test-error') {
                errorCallback = callback;
            }
            return jest.fn();
        });

        const { result } = renderHook(() =>
            useSelectionStep<TestItem>({
                cacheKey: 'projectsCache',
                messageType: 'test-items',
                errorMessageType: 'test-error',
                state: baseState as WizardState,
                updateState: mockUpdateState,
                autoLoad: false,
            })
        );

        // Trigger load
        act(() => {
            result.current.load();
        });

        // Simulate legacy error without code
        act(() => {
            errorCallback?.({
                error: 'Some legacy error',
                // No code field - backward compatibility
            });
        });

        await waitFor(() => {
            expect(result.current.error).toBe('Some legacy error');
            expect(result.current.errorCode).toBeNull();
        });
    });
});
