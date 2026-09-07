/**
 * useSelectionStep — load lifecycle: auto-load, re-subscription, and teardown.
 *
 * Every pre-existing suite passed `autoLoad: false`, so the mount-time load and
 * its StrictMode guard were never executed at all, and none of the hook's
 * dependency arrays were exercised by changing the value they name. Both are
 * decisions with no test between them and a wrong answer: a hook that stops
 * re-loading when the wizard hands it a new message type is silently dead.
 */

import { useSelectionStep, UseSelectionStepOptions } from './useSelectionStep.testUtils';
import {
    baseState,
    captureChannels,
    mockPostMessage,
    resetMocks,
    TestItem,
    testItems,
} from './useSelectionStep.testUtils';

import { renderHook, act, waitFor } from '@testing-library/react';
import { WizardState } from '@/types/webview';

describe('useSelectionStep - load lifecycle', () => {
    const mockUpdateState = jest.fn();

    beforeEach(() => {
        resetMocks();
        mockUpdateState.mockClear();
    });

    /** The options every test here shares; overrides win. */
    function options(
        extra: Partial<UseSelectionStepOptions<TestItem>> = {},
    ): UseSelectionStepOptions<TestItem> {
        return {
            cacheKey: 'projectsCache',
            messageType: 'test-items',
            errorMessageType: 'test-error',
            state: baseState as WizardState,
            updateState: mockUpdateState,
            ...extra,
        };
    }

    describe('auto-load on mount', () => {
        it('requests items on mount when the cache is empty', () => {
            renderHook(() => useSelectionStep<TestItem>(options()));

            expect(mockPostMessage).toHaveBeenCalledTimes(1);
            expect(mockPostMessage).toHaveBeenCalledWith('test-items', {});
        });

        it('sends the caller payload with the mount request', () => {
            const messagePayload = { orgId: 'org-1' };

            renderHook(() => useSelectionStep<TestItem>(options({ messagePayload })));

            expect(mockPostMessage).toHaveBeenCalledWith('test-items', messagePayload);
        });

        it('requests nothing on mount when autoLoad is off', () => {
            renderHook(() => useSelectionStep<TestItem>(options({ autoLoad: false })));

            expect(mockPostMessage).not.toHaveBeenCalled();
        });

        it('requests nothing on mount when the cache is already populated', () => {
            const state = { ...baseState, projectsCache: testItems } as WizardState;

            renderHook(() => useSelectionStep<TestItem>(options({ state })));

            expect(mockPostMessage).not.toHaveBeenCalled();
        });

        it('requests once even when the state object changes identity', () => {
            const { rerender } = renderHook(
                ({ state }: { state: WizardState }) =>
                    useSelectionStep<TestItem>(options({ state })),
                { initialProps: { state: { ...baseState } as WizardState } },
            );

            // A fresh object with the same empty cache — what the wizard hands down on
            // any unrelated state change. The guard, not the cache, is what stops a
            // second request here.
            rerender({ state: { ...baseState } as WizardState });

            expect(mockPostMessage).toHaveBeenCalledTimes(1);
        });

        it('requests once autoLoad turns on after mount', () => {
            const { rerender } = renderHook(
                ({ autoLoad }: { autoLoad: boolean }) =>
                    useSelectionStep<TestItem>(options({ autoLoad })),
                { initialProps: { autoLoad: false } },
            );

            expect(mockPostMessage).not.toHaveBeenCalled();

            rerender({ autoLoad: true });

            expect(mockPostMessage).toHaveBeenCalledTimes(1);
            expect(mockPostMessage).toHaveBeenCalledWith('test-items', {});
        });
    });

    describe('following the message type', () => {
        it('loads against the current message type, not the one it mounted with', () => {
            const { result, rerender } = renderHook(
                ({ messageType }: { messageType: string }) =>
                    useSelectionStep<TestItem>(options({ messageType, autoLoad: false })),
                { initialProps: { messageType: 'test-items' } },
            );

            rerender({ messageType: 'other-items' });
            act(() => {
                result.current.load();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('other-items', {});
        });

        it('refreshes against the current message type too', () => {
            const { result, rerender } = renderHook(
                ({ messageType }: { messageType: string }) =>
                    useSelectionStep<TestItem>(options({ messageType, autoLoad: false })),
                { initialProps: { messageType: 'test-items' } },
            );

            rerender({ messageType: 'other-items' });
            act(() => {
                result.current.refresh();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('other-items', {});
        });

        it('re-subscribes to the new channel and drops the old one', () => {
            const channels = captureChannels();
            const { rerender } = renderHook(
                ({ messageType }: { messageType: string }) =>
                    useSelectionStep<TestItem>(options({ messageType, autoLoad: false })),
                { initialProps: { messageType: 'test-items' } },
            );

            expect(channels.unsubscribes['test-items']?.[0]).not.toHaveBeenCalled();

            rerender({ messageType: 'other-items' });

            expect(channels.handlers['other-items']).toBeDefined();
            expect(channels.unsubscribes['test-items']?.[0]).toHaveBeenCalled();
        });

        it('unsubscribes both channels on unmount', () => {
            const channels = captureChannels();
            const { unmount } = renderHook(() =>
                useSelectionStep<TestItem>(options({ autoLoad: false })),
            );

            unmount();

            expect(channels.unsubscribes['test-items']?.[0]).toHaveBeenCalled();
            expect(channels.unsubscribes['test-error']?.[0]).toHaveBeenCalled();
        });
    });

    describe('reading the cache', () => {
        it('re-reads the cache when the wizard state changes', () => {
            const later: TestItem[] = [{ id: '9', name: 'Later' }];
            const { result, rerender } = renderHook(
                ({ state }: { state: WizardState }) =>
                    useSelectionStep<TestItem>(options({ state, autoLoad: false })),
                {
                    initialProps: {
                        state: { ...baseState, projectsCache: testItems } as WizardState,
                    },
                },
            );

            expect(result.current.items).toEqual(testItems);

            rerender({ state: { ...baseState, projectsCache: later } as WizardState });

            expect(result.current.items).toEqual(later);
        });
    });

    describe('what the response does to the loading flags', () => {
        it('clears loading when items arrive', async () => {
            const channels = captureChannels();
            const { result } = renderHook(() => useSelectionStep<TestItem>(options()));

            expect(result.current.isLoading).toBe(true);

            act(() => {
                channels.handlers['test-items']?.(testItems);
            });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });
        });

        it('clears refreshing when a structured error arrives on the items channel', async () => {
            const channels = captureChannels();
            const { result } = renderHook(() =>
                useSelectionStep<TestItem>(options({ autoLoad: false })),
            );

            act(() => {
                result.current.refresh();
            });
            expect(result.current.isRefreshing).toBe(true);

            act(() => {
                channels.handlers['test-items']?.({ error: 'Timed out' });
            });

            await waitFor(() => {
                expect(result.current.isRefreshing).toBe(false);
            });
        });

        it('clears refreshing when the error channel fires', async () => {
            const channels = captureChannels();
            const { result } = renderHook(() =>
                useSelectionStep<TestItem>(options({ autoLoad: false })),
            );

            act(() => {
                result.current.refresh();
            });

            act(() => {
                channels.handlers['test-error']?.({ error: 'Network down' });
            });

            await waitFor(() => {
                expect(result.current.isRefreshing).toBe(false);
            });
        });

        it('falls back to a generic message when the error channel sends no text', async () => {
            const channels = captureChannels();
            const { result } = renderHook(() =>
                useSelectionStep<TestItem>(options({ autoLoad: false })),
            );

            act(() => {
                channels.handlers['test-error']?.({});
            });

            await waitFor(() => {
                expect(result.current.error).toBe('Failed to load items');
            });
        });

        it('ignores a payload that is neither a list nor an error object', () => {
            const channels = captureChannels();
            const { result } = renderHook(() =>
                useSelectionStep<TestItem>(options({ autoLoad: false })),
            );

            act(() => {
                channels.handlers['test-items']?.('unexpected');
            });

            expect(result.current.error).toBeNull();
            expect(result.current.errorCode).toBeNull();
            expect(mockUpdateState).not.toHaveBeenCalled();
        });
    });

    describe('validation before load', () => {
        it('sends the request when validation passes', () => {
            const validateBeforeLoad = jest.fn(() => ({ valid: true }));

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>(options({ autoLoad: false, validateBeforeLoad })),
            );

            act(() => {
                result.current.load();
            });

            expect(validateBeforeLoad).toHaveBeenCalled();
            expect(mockPostMessage).toHaveBeenCalledWith('test-items', {});
        });

        it('stops loading when validation fails without a message', () => {
            const validateBeforeLoad = jest.fn(() => ({ valid: false }));

            const { result } = renderHook(() =>
                useSelectionStep<TestItem>(options({ autoLoad: false, validateBeforeLoad })),
            );

            act(() => {
                result.current.load();
            });

            expect(result.current.error).toBe('Validation failed');
            expect(result.current.isLoading).toBe(false);
            expect(mockPostMessage).not.toHaveBeenCalled();
        });
    });
});
