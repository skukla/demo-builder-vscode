/**
 * usePollingWithTimeout Hook Tests
 *
 * Tests for the generic polling hook with timeout support.
 * Verifies polling behavior, condition detection, timeout handling, and cleanup.
 *
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePollingWithTimeout } from '@/core/ui/hooks/usePollingWithTimeout';

describe('usePollingWithTimeout', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Basic Polling Behavior', () => {
        it('should start polling when enabled', async () => {
            const fetcher = jest.fn().mockResolvedValue({ ready: true });
            const condition = jest.fn().mockReturnValue(true);

            renderHook(() => usePollingWithTimeout({
                fetcher,
                condition,
                interval: 100,
                timeout: 1000,
                enabled: true,
            }));

            // Wait for initial fetch
            await act(async () => {
                await Promise.resolve();
            });

            expect(fetcher).toHaveBeenCalledTimes(1);
        });

        it('should not start polling when disabled', async () => {
            const fetcher = jest.fn().mockResolvedValue({ ready: true });
            const condition = jest.fn().mockReturnValue(true);

            renderHook(() => usePollingWithTimeout({
                fetcher,
                condition,
                interval: 100,
                timeout: 1000,
                enabled: false,
            }));

            await act(async () => {
                await Promise.resolve();
            });

            expect(fetcher).not.toHaveBeenCalled();
        });

        it('should poll at specified interval until condition met', async () => {
            let callCount = 0;
            const fetcher = jest.fn().mockImplementation(async () => {
                callCount++;
                return { count: callCount };
            });
            // Return true on third call
            const condition = jest.fn().mockImplementation((result) => result.count >= 3);

            const { result } = renderHook(() => usePollingWithTimeout({
                fetcher,
                condition,
                interval: 100,
                timeout: 5000,
                enabled: true,
            }));

            // Initial call
            await act(async () => {
                await Promise.resolve();
            });

            expect(result.current.loading).toBe(true);
            expect(fetcher).toHaveBeenCalledTimes(1);

            // Second interval - advance timer
            await act(async () => {
                jest.advanceTimersByTime(100);
                await Promise.resolve();
            });

            expect(fetcher).toHaveBeenCalledTimes(2);

            // Third interval - condition met
            await act(async () => {
                jest.advanceTimersByTime(100);
                await Promise.resolve();
            });

            expect(fetcher).toHaveBeenCalledTimes(3);
            expect(result.current.loading).toBe(false);
            expect(result.current.data).toEqual({ count: 3 });
        });

        it('should stop polling when condition is met', async () => {
            const fetcher = jest.fn().mockResolvedValue({ ready: true });
            const condition = jest.fn().mockReturnValue(true);

            const { result } = renderHook(() => usePollingWithTimeout({
                fetcher,
                condition,
                interval: 100,
                timeout: 1000,
                enabled: true,
            }));

            // Initial fetch satisfies condition
            await act(async () => {
                await Promise.resolve();
            });

            expect(result.current.loading).toBe(false);
            expect(fetcher).toHaveBeenCalledTimes(1);

            // Advance time - should not poll again
            await act(async () => {
                jest.advanceTimersByTime(500);
                await Promise.resolve();
            });

            expect(fetcher).toHaveBeenCalledTimes(1);
        });
    });

    describe('Timeout Handling', () => {
        it('should stop on timeout and return timeout error', async () => {
            const fetcher = jest.fn().mockResolvedValue({ ready: false });
            const condition = jest.fn().mockReturnValue(false);

            const { result } = renderHook(() => usePollingWithTimeout({
                fetcher,
                condition,
                interval: 100,
                timeout: 500,
                enabled: true,
            }));

            // Initial fetch
            await act(async () => {
                await Promise.resolve();
            });

            expect(result.current.loading).toBe(true);

            // Advance past timeout
            await act(async () => {
                jest.advanceTimersByTime(600);
                await Promise.resolve();
            });

            expect(result.current.timedOut).toBe(true);
            expect(result.current.error).toBe('Timeout');
            expect(result.current.loading).toBe(false);
        });

        it('should not trigger timeout if condition met before timeout', async () => {
            let callCount = 0;
            const fetcher = jest.fn().mockImplementation(async () => {
                callCount++;
                return { count: callCount };
            });
            const condition = jest.fn().mockImplementation((result) => result.count >= 2);

            const { result } = renderHook(() => usePollingWithTimeout({
                fetcher,
                condition,
                interval: 100,
                timeout: 500,
                enabled: true,
            }));

            // Initial fetch
            await act(async () => {
                await Promise.resolve();
            });

            // Second fetch - condition met
            await act(async () => {
                jest.advanceTimersByTime(100);
                await Promise.resolve();
            });

            expect(result.current.timedOut).toBe(false);
            expect(result.current.loading).toBe(false);
            expect(result.current.data).toEqual({ count: 2 });
        });
    });

    describe('Error Handling', () => {
        it('should handle fetcher errors gracefully', async () => {
            const fetcher = jest.fn().mockRejectedValue(new Error('Network error'));
            const condition = jest.fn().mockReturnValue(false);

            const { result } = renderHook(() => usePollingWithTimeout({
                fetcher,
                condition,
                interval: 100,
                timeout: 1000,
                enabled: true,
            }));

            await act(async () => {
                await Promise.resolve();
            });

            expect(result.current.error).toBe('Network error');
            expect(result.current.loading).toBe(false);
        });

        it('should handle non-Error throws', async () => {
            const fetcher = jest.fn().mockRejectedValue('String error');
            const condition = jest.fn().mockReturnValue(false);

            const { result } = renderHook(() => usePollingWithTimeout({
                fetcher,
                condition,
                interval: 100,
                timeout: 1000,
                enabled: true,
            }));

            await act(async () => {
                await Promise.resolve();
            });

            expect(result.current.error).toBe('Polling failed');
            expect(result.current.loading).toBe(false);
        });
    });

    describe('Cleanup', () => {
        it('should clean up timers on unmount', async () => {
            const fetcher = jest.fn().mockResolvedValue({ ready: false });
            const condition = jest.fn().mockReturnValue(false);

            const { unmount } = renderHook(() => usePollingWithTimeout({
                fetcher,
                condition,
                interval: 100,
                timeout: 1000,
                enabled: true,
            }));

            // Initial fetch
            await act(async () => {
                await Promise.resolve();
            });

            expect(fetcher).toHaveBeenCalledTimes(1);

            unmount();

            // Advance time - should not poll after unmount
            await act(async () => {
                jest.advanceTimersByTime(500);
                await Promise.resolve();
            });

            // Only the initial call should have happened
            expect(fetcher).toHaveBeenCalledTimes(1);
        });

        it('should stop polling when enabled changes to false', async () => {
            const fetcher = jest.fn().mockResolvedValue({ ready: false });
            const condition = jest.fn().mockReturnValue(false);

            const { result, rerender } = renderHook(
                ({ enabled }) => usePollingWithTimeout({
                    fetcher,
                    condition,
                    interval: 100,
                    timeout: 1000,
                    enabled,
                }),
                { initialProps: { enabled: true } }
            );

            // Initial fetch
            await act(async () => {
                await Promise.resolve();
            });

            expect(fetcher).toHaveBeenCalledTimes(1);

            // Disable polling
            rerender({ enabled: false });

            // Advance time - should not poll
            await act(async () => {
                jest.advanceTimersByTime(500);
                await Promise.resolve();
            });

            expect(fetcher).toHaveBeenCalledTimes(1);
        });
    });

    describe('Return Values', () => {
        it('should return data from successful fetch', async () => {
            const testData = { status: 'ready', items: [1, 2, 3] };
            const fetcher = jest.fn().mockResolvedValue(testData);
            const condition = jest.fn().mockReturnValue(true);

            const { result } = renderHook(() => usePollingWithTimeout({
                fetcher,
                condition,
                interval: 100,
                timeout: 1000,
                enabled: true,
            }));

            await act(async () => {
                await Promise.resolve();
            });

            expect(result.current.data).toEqual(testData);
            expect(result.current.loading).toBe(false);
            expect(result.current.timedOut).toBe(false);
            expect(result.current.error).toBeUndefined();
        });

        it('should return loading true while polling', async () => {
            const fetcher = jest.fn().mockResolvedValue({ ready: false });
            const condition = jest.fn().mockReturnValue(false);

            const { result } = renderHook(() => usePollingWithTimeout({
                fetcher,
                condition,
                interval: 100,
                timeout: 1000,
                enabled: true,
            }));

            await act(async () => {
                await Promise.resolve();
            });

            expect(result.current.loading).toBe(true);
        });
    });
});
