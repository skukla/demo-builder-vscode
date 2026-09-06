/**
 * useFieldSyncWithBackend Hook Tests
 *
 * Tests for the debounced backend sync hook.
 * Verifies debouncing behavior, backend calls, and cleanup.
 *
 */

import '../../../../helpers/webviewClientMock';
import { renderHook, act } from '@testing-library/react';

import {
    useFieldSyncWithBackend,
    type UseFieldSyncWithBackendOptions,
} from '@/features/dashboard/ui/hooks/useFieldSyncWithBackend';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

describe('useFieldSyncWithBackend', () => {
    const mockRequest = webviewClient.request as jest.Mock;

    /** The hook under its usual options, with only what a test varies spelled out. */
    const renderField = (options: Partial<UseFieldSyncWithBackendOptions> = {}) =>
        renderHook(() =>
            useFieldSyncWithBackend({
                fieldId: 'test-field',
                messageType: 'updateField',
                ...options,
            })
        );

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
            const { result } = renderField({ debounceMs: 200 });

            act(() => {
                result.current.setValue('first value');
            });

            expect(mockRequest).not.toHaveBeenCalled();
        });

        it('should call backend after debounce delay', async () => {
            const { result } = renderField({ debounceMs: 200 });

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
            const { result } = renderField({ debounceMs: 200 });

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
            const { result } = renderField();

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
            mockRequest.mockReturnValue(
                new Promise((resolve) => {
                    resolveRequest = () => resolve({ success: true });
                })
            );

            const { result } = renderField({ debounceMs: 100 });

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

            const { result } = renderField({ debounceMs: 100 });

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

            const { result } = renderField({ debounceMs: 100 });

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
        it('is not syncing before anything has been asked', () => {
            const { result } = renderField();

            expect(result.current.isSyncing).toBe(false);
        });

        it('should accept initial value', () => {
            const { result } = renderField({ initialValue: 'initial' });

            expect(result.current.value).toBe('initial');
        });

        it('should not sync initial value', async () => {
            renderField({ initialValue: 'initial', debounceMs: 100 });

            await act(async () => {
                jest.advanceTimersByTime(500);
            });

            expect(mockRequest).not.toHaveBeenCalled();
        });
    });

    describe('Callbacks', () => {
        it('should call onSyncSuccess on successful sync', async () => {
            const onSyncSuccess = jest.fn();

            const { result } = renderField({ debounceMs: 100, onSyncSuccess });

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

            const { result } = renderField({ debounceMs: 100, onSyncError });

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
            const { result, unmount } = renderField({ debounceMs: 200 });

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


    describe('The pending timer itself', () => {
        // The request count cannot see these: an uncancelled timer still finds the
        // pending value already consumed and syncs nothing. What it leaves behind is a
        // timer, so the timer is what is counted.
        it('keeps ONE pending timer across rapid changes, not one per keystroke', () => {
            const { result } = renderField({ debounceMs: 200 });

            act(() => {
                result.current.setValue('first');
            });
            act(() => {
                result.current.setValue('second');
            });
            act(() => {
                result.current.setValue('third');
            });

            expect(jest.getTimerCount()).toBe(1);
        });

        it('cancels the pending timer on unmount', () => {
            const { result, unmount } = renderField({ debounceMs: 200 });

            act(() => {
                result.current.setValue('test');
            });
            expect(jest.getTimerCount()).toBe(1);

            unmount();

            expect(jest.getTimerCount()).toBe(0);
        });

        it('cancels the pending timer when flush takes the value instead', async () => {
            const { result } = renderField({ debounceMs: 200 });

            act(() => {
                result.current.setValue('test');
            });

            await act(async () => {
                await result.current.flush();
            });

            expect(jest.getTimerCount()).toBe(0);
        });

        it('never asks the platform to clear a timer it does not have', async () => {
            const clearSpy = jest.spyOn(global, 'clearTimeout');
            const { result, unmount } = renderField({ debounceMs: 200 });

            // Each of the three guards is passed with nothing scheduled: flush before
            // any edit, the first setValue, and unmount after flush emptied the slot.
            await act(async () => {
                await result.current.flush();
            });
            act(() => {
                result.current.setValue('test');
            });
            await act(async () => {
                await result.current.flush();
            });
            unmount();

            expect(clearSpy).not.toHaveBeenCalledWith(null);
        });
    });

    describe('Changed options', () => {
        it('sends the CURRENT field id and message type, not the first render’s', async () => {
            const { result, rerender } = renderHook(
                ({ fieldId, messageType }) =>
                    useFieldSyncWithBackend({ fieldId, messageType, debounceMs: 100 }),
                { initialProps: { fieldId: 'old-field', messageType: 'oldMessage' } }
            );

            rerender({ fieldId: 'new-field', messageType: 'newMessage' });

            act(() => {
                result.current.setValue('test');
            });
            await act(async () => {
                jest.advanceTimersByTime(100);
            });

            expect(mockRequest).toHaveBeenCalledWith('newMessage', {
                fieldId: 'new-field',
                value: 'test',
            });
        });

        it('debounces by the CURRENT delay after it changes', async () => {
            const { result, rerender } = renderHook(
                ({ debounceMs }) =>
                    useFieldSyncWithBackend({
                        fieldId: 'test-field',
                        messageType: 'updateField',
                        debounceMs,
                    }),
                { initialProps: { debounceMs: 500 } }
            );

            rerender({ debounceMs: 50 });

            act(() => {
                result.current.setValue('test');
            });
            await act(async () => {
                jest.advanceTimersByTime(50);
            });

            expect(mockRequest).toHaveBeenCalledTimes(1);
        });

        it('flushes to the CURRENT message type', async () => {
            const { result, rerender } = renderHook(
                ({ messageType }) =>
                    useFieldSyncWithBackend({
                        fieldId: 'test-field',
                        messageType,
                        debounceMs: 200,
                    }),
                { initialProps: { messageType: 'oldMessage' } }
            );

            rerender({ messageType: 'newMessage' });

            act(() => {
                result.current.setValue('test');
            });
            await act(async () => {
                await result.current.flush();
            });

            expect(mockRequest).toHaveBeenCalledWith('newMessage', {
                fieldId: 'test-field',
                value: 'test',
            });
        });
    });

    describe('After unmount', () => {
        it('flush syncs nothing once the field is gone', async () => {
            const { result, unmount } = renderField({ debounceMs: 200 });

            act(() => {
                result.current.setValue('test');
            });
            unmount();

            await act(async () => {
                await result.current.flush();
            });

            expect(mockRequest).not.toHaveBeenCalled();
        });

        it('does not report success for a request that outlived the field', async () => {
            let resolveRequest: () => void = () => {};
            mockRequest.mockReturnValue(
                new Promise((resolve) => {
                    resolveRequest = () => resolve({ success: true });
                })
            );
            const onSyncSuccess = jest.fn();

            const { result, unmount } = renderField({ debounceMs: 100, onSyncSuccess });

            act(() => {
                result.current.setValue('test');
            });
            await act(async () => {
                jest.advanceTimersByTime(100);
            });
            unmount();
            await act(async () => {
                resolveRequest();
            });

            expect(onSyncSuccess).not.toHaveBeenCalled();
        });

        it('does not report failure for a request that outlived the field', async () => {
            let rejectRequest: () => void = () => {};
            mockRequest.mockReturnValue(
                new Promise((_resolve, reject) => {
                    rejectRequest = () => reject(new Error('Network error'));
                })
            );
            const onSyncError = jest.fn();

            const { result, unmount } = renderField({ debounceMs: 100, onSyncError });

            act(() => {
                result.current.setValue('test');
            });
            await act(async () => {
                jest.advanceTimersByTime(100);
            });
            unmount();
            await act(async () => {
                rejectRequest();
            });

            expect(onSyncError).not.toHaveBeenCalled();
        });
    });

    describe('Manual Sync', () => {
        it('sends nothing when there is nothing pending', async () => {
            const { result } = renderField({ debounceMs: 200 });

            await act(async () => {
                await result.current.flush();
            });

            expect(mockRequest).not.toHaveBeenCalled();
        });

        it('should provide flush function for immediate sync', async () => {
            const { result } = renderField({ debounceMs: 200 });

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
