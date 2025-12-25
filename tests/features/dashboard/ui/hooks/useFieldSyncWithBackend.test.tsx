/**
 * useFieldSyncWithBackend Hook Tests
 *
 * Tests for the debounced backend sync hook.
 * Verifies debouncing behavior, backend calls, and cleanup.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

// Mock the WebviewClient - must be before import
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        request: jest.fn(),
    },
}));

import { useFieldSyncWithBackend } from '@/features/dashboard/ui/hooks/useFieldSyncWithBackend';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

describe('useFieldSyncWithBackend', () => {
    const mockRequest = webviewClient.request as jest.Mock;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        mockRequest.mockResolvedValue({ success: true });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Basic Sync Behavior', () => {
        it('should not call backend immediately on value change', () => {
            const { result } = renderHook(() =>
                useFieldSyncWithBackend({
                    fieldId: 'test-field',
                    messageType: 'updateField',
                    debounceMs: 200,
                })
            );

            act(() => {
                result.current.setValue('first value');
            });

            expect(mockRequest).not.toHaveBeenCalled();
        });

        it('should call backend after debounce delay', async () => {
            const { result } = renderHook(() =>
                useFieldSyncWithBackend({
                    fieldId: 'test-field',
                    messageType: 'updateField',
                    debounceMs: 200,
                })
            );

            act(() => {
                result.current.setValue('test value');
            });

            // Advance past debounce delay
            await act(async () => {
                jest.advanceTimersByTime(200);
            });

            expect(mockRequest).toHaveBeenCalledTimes(1);
            expect(mockRequest).toHaveBeenCalledWith('updateField', {
                fieldId: 'test-field',
                value: 'test value',
            });
        });
    });

    describe('Debouncing', () => {
        it('should debounce multiple rapid value changes', async () => {
            const { result } = renderHook(() =>
                useFieldSyncWithBackend({
                    fieldId: 'test-field',
                    messageType: 'updateField',
                    debounceMs: 200,
                })
            );

            // Multiple rapid changes within debounce window
            act(() => {
                result.current.setValue('first');
            });

            act(() => {
                jest.advanceTimersByTime(50);
                result.current.setValue('second');
            });

            act(() => {
                jest.advanceTimersByTime(50);
                result.current.setValue('third');
            });

            // Still within debounce window
            expect(mockRequest).not.toHaveBeenCalled();

            // Advance past debounce delay from last change
            await act(async () => {
                jest.advanceTimersByTime(200);
            });

            // Should only call once with final value
            expect(mockRequest).toHaveBeenCalledTimes(1);
            expect(mockRequest).toHaveBeenCalledWith('updateField', {
                fieldId: 'test-field',
                value: 'third',
            });
        });

        it('should use default debounce of 300ms when not specified', async () => {
            const { result } = renderHook(() =>
                useFieldSyncWithBackend({
                    fieldId: 'test-field',
                    messageType: 'updateField',
                })
            );

            act(() => {
                result.current.setValue('test');
            });

            // Should not have called yet at 200ms
            act(() => {
                jest.advanceTimersByTime(200);
            });
            expect(mockRequest).not.toHaveBeenCalled();

            // Should call at 300ms
            await act(async () => {
                jest.advanceTimersByTime(100);
            });
            expect(mockRequest).toHaveBeenCalledTimes(1);
        });
    });

    describe('Sync Status', () => {
        it('should set isSyncing true during backend call', async () => {
            let resolveRequest: () => void = () => {};
            mockRequest.mockReturnValue(new Promise(resolve => {
                resolveRequest = () => resolve({ success: true });
            }));

            const { result } = renderHook(() =>
                useFieldSyncWithBackend({
                    fieldId: 'test-field',
                    messageType: 'updateField',
                    debounceMs: 100,
                })
            );

            act(() => {
                result.current.setValue('test');
            });

            await act(async () => {
                jest.advanceTimersByTime(100);
            });

            expect(result.current.isSyncing).toBe(true);

            await act(async () => {
                resolveRequest();
            });

            expect(result.current.isSyncing).toBe(false);
        });

        it('should set error on sync failure', async () => {
            mockRequest.mockRejectedValue(new Error('Sync failed'));

            const { result } = renderHook(() =>
                useFieldSyncWithBackend({
                    fieldId: 'test-field',
                    messageType: 'updateField',
                    debounceMs: 100,
                })
            );

            act(() => {
                result.current.setValue('test');
            });

            await act(async () => {
                jest.advanceTimersByTime(100);
            });

            expect(result.current.error).toBe('Sync failed');
            expect(result.current.isSyncing).toBe(false);
        });

        it('should clear error on successful sync after failure', async () => {
            mockRequest
                .mockRejectedValueOnce(new Error('Sync failed'))
                .mockResolvedValueOnce({ success: true });

            const { result } = renderHook(() =>
                useFieldSyncWithBackend({
                    fieldId: 'test-field',
                    messageType: 'updateField',
                    debounceMs: 100,
                })
            );

            // First sync fails
            act(() => {
                result.current.setValue('test1');
            });

            await act(async () => {
                jest.advanceTimersByTime(100);
            });

            expect(result.current.error).toBe('Sync failed');

            // Second sync succeeds
            act(() => {
                result.current.setValue('test2');
            });

            await act(async () => {
                jest.advanceTimersByTime(100);
            });

            expect(result.current.error).toBeUndefined();
        });
    });

    describe('Initial Value', () => {
        it('should accept initial value', () => {
            const { result } = renderHook(() =>
                useFieldSyncWithBackend({
                    fieldId: 'test-field',
                    messageType: 'updateField',
                    initialValue: 'initial',
                })
            );

            expect(result.current.value).toBe('initial');
        });

        it('should not sync initial value', async () => {
            renderHook(() =>
                useFieldSyncWithBackend({
                    fieldId: 'test-field',
                    messageType: 'updateField',
                    initialValue: 'initial',
                    debounceMs: 100,
                })
            );

            await act(async () => {
                jest.advanceTimersByTime(500);
            });

            expect(mockRequest).not.toHaveBeenCalled();
        });
    });

    describe('Callbacks', () => {
        it('should call onSyncSuccess on successful sync', async () => {
            const onSyncSuccess = jest.fn();

            const { result } = renderHook(() =>
                useFieldSyncWithBackend({
                    fieldId: 'test-field',
                    messageType: 'updateField',
                    debounceMs: 100,
                    onSyncSuccess,
                })
            );

            act(() => {
                result.current.setValue('test');
            });

            await act(async () => {
                jest.advanceTimersByTime(100);
            });

            expect(onSyncSuccess).toHaveBeenCalledWith('test');
        });

        it('should call onSyncError on failed sync', async () => {
            const onSyncError = jest.fn();
            mockRequest.mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() =>
                useFieldSyncWithBackend({
                    fieldId: 'test-field',
                    messageType: 'updateField',
                    debounceMs: 100,
                    onSyncError,
                })
            );

            act(() => {
                result.current.setValue('test');
            });

            await act(async () => {
                jest.advanceTimersByTime(100);
            });

            expect(onSyncError).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('Cleanup', () => {
        it('should cancel pending sync on unmount', async () => {
            const { result, unmount } = renderHook(() =>
                useFieldSyncWithBackend({
                    fieldId: 'test-field',
                    messageType: 'updateField',
                    debounceMs: 200,
                })
            );

            act(() => {
                result.current.setValue('test');
            });

            unmount();

            // Advance past debounce
            await act(async () => {
                jest.advanceTimersByTime(300);
            });

            // Should not have synced
            expect(mockRequest).not.toHaveBeenCalled();
        });
    });

    describe('Manual Sync', () => {
        it('should provide flush function for immediate sync', async () => {
            const { result } = renderHook(() =>
                useFieldSyncWithBackend({
                    fieldId: 'test-field',
                    messageType: 'updateField',
                    debounceMs: 200,
                })
            );

            act(() => {
                result.current.setValue('test');
            });

            // Flush immediately without waiting
            await act(async () => {
                await result.current.flush();
            });

            expect(mockRequest).toHaveBeenCalledTimes(1);
        });
    });
});
