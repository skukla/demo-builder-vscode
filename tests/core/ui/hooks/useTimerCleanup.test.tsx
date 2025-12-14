import { renderHook, act } from '@testing-library/react';
import { useTimerCleanup, useSingleTimer } from '@/core/ui/hooks/useTimerCleanup';

describe('useTimerCleanup', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('timer creation', () => {
        it('should create specified number of timer refs', () => {
            const { result } = renderHook(() => useTimerCleanup(3));

            expect(result.current).toHaveLength(3);
            result.current.forEach((timer) => {
                expect(timer.ref).toBeDefined();
                expect(timer.set).toBeInstanceOf(Function);
                expect(timer.clear).toBeInstanceOf(Function);
            });
        });

        it('should default to 1 timer when no count provided', () => {
            const { result } = renderHook(() => useTimerCleanup());

            expect(result.current).toHaveLength(1);
        });
    });

    describe('timer.set()', () => {
        it('should execute callback after delay', () => {
            const callback = jest.fn();
            const { result } = renderHook(() => useTimerCleanup(1));

            act(() => {
                result.current[0].set(callback, 1000);
            });

            expect(callback).not.toHaveBeenCalled();

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('should store timer ID in ref', () => {
            const { result } = renderHook(() => useTimerCleanup(1));

            expect(result.current[0].ref.current).toBeNull();

            act(() => {
                result.current[0].set(() => {}, 1000);
            });

            expect(result.current[0].ref.current).not.toBeNull();
        });

        it('should clear previous timer when setting a new one', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            const { result } = renderHook(() => useTimerCleanup(1));

            act(() => {
                result.current[0].set(callback1, 1000);
            });

            act(() => {
                jest.advanceTimersByTime(500);
            });

            // Set a new timer before the first one fires
            act(() => {
                result.current[0].set(callback2, 1000);
            });

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            // First callback should NOT have been called (was cleared)
            expect(callback1).not.toHaveBeenCalled();
            // Second callback should have been called
            expect(callback2).toHaveBeenCalledTimes(1);
        });
    });

    describe('timer.clear()', () => {
        it('should clear the timer and set ref to null', () => {
            const callback = jest.fn();
            const { result } = renderHook(() => useTimerCleanup(1));

            act(() => {
                result.current[0].set(callback, 1000);
            });

            expect(result.current[0].ref.current).not.toBeNull();

            act(() => {
                result.current[0].clear();
            });

            expect(result.current[0].ref.current).toBeNull();

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(callback).not.toHaveBeenCalled();
        });

        it('should be safe to call clear when no timer is set', () => {
            const { result } = renderHook(() => useTimerCleanup(1));

            expect(() => {
                act(() => {
                    result.current[0].clear();
                });
            }).not.toThrow();
        });
    });

    describe('unmount cleanup', () => {
        it('should clear all timers on unmount', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            const { result, unmount } = renderHook(() => useTimerCleanup(2));

            act(() => {
                result.current[0].set(callback1, 1000);
                result.current[1].set(callback2, 2000);
            });

            unmount();

            act(() => {
                jest.advanceTimersByTime(3000);
            });

            expect(callback1).not.toHaveBeenCalled();
            expect(callback2).not.toHaveBeenCalled();
        });

        it('should set all refs to null on unmount', () => {
            const { result, unmount } = renderHook(() => useTimerCleanup(2));

            act(() => {
                result.current[0].set(() => {}, 1000);
                result.current[1].set(() => {}, 2000);
            });

            // Store refs before unmount to check after
            const ref0 = result.current[0].ref;
            const ref1 = result.current[1].ref;

            unmount();

            expect(ref0.current).toBeNull();
            expect(ref1.current).toBeNull();
        });
    });

    describe('multiple independent timers', () => {
        it('should manage multiple timers independently', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            const callback3 = jest.fn();
            const { result } = renderHook(() => useTimerCleanup(3));

            act(() => {
                result.current[0].set(callback1, 500);
                result.current[1].set(callback2, 1000);
                result.current[2].set(callback3, 1500);
            });

            act(() => {
                jest.advanceTimersByTime(500);
            });

            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).not.toHaveBeenCalled();
            expect(callback3).not.toHaveBeenCalled();

            act(() => {
                jest.advanceTimersByTime(500);
            });

            expect(callback2).toHaveBeenCalledTimes(1);
            expect(callback3).not.toHaveBeenCalled();

            act(() => {
                jest.advanceTimersByTime(500);
            });

            expect(callback3).toHaveBeenCalledTimes(1);
        });

        it('should allow clearing individual timers', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            const { result } = renderHook(() => useTimerCleanup(2));

            act(() => {
                result.current[0].set(callback1, 1000);
                result.current[1].set(callback2, 1000);
            });

            // Clear only the first timer
            act(() => {
                result.current[0].clear();
            });

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(callback1).not.toHaveBeenCalled();
            expect(callback2).toHaveBeenCalledTimes(1);
        });
    });

    describe('ref stability', () => {
        it('should maintain stable refs across re-renders', () => {
            const { result, rerender } = renderHook(() => useTimerCleanup(2));

            const initialRef0 = result.current[0].ref;
            const initialRef1 = result.current[1].ref;

            rerender();

            expect(result.current[0].ref).toBe(initialRef0);
            expect(result.current[1].ref).toBe(initialRef1);
        });
    });
});

describe('useSingleTimer', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should return a single TimerRef object', () => {
        const { result } = renderHook(() => useSingleTimer());

        expect(result.current.ref).toBeDefined();
        expect(result.current.set).toBeInstanceOf(Function);
        expect(result.current.clear).toBeInstanceOf(Function);
    });

    it('should execute callback after delay', () => {
        const callback = jest.fn();
        const { result } = renderHook(() => useSingleTimer());

        act(() => {
            result.current.set(callback, 500);
        });

        expect(callback).not.toHaveBeenCalled();

        act(() => {
            jest.advanceTimersByTime(500);
        });

        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should clean up on unmount', () => {
        const callback = jest.fn();
        const { result, unmount } = renderHook(() => useSingleTimer());

        act(() => {
            result.current.set(callback, 1000);
        });

        unmount();

        act(() => {
            jest.advanceTimersByTime(1000);
        });

        expect(callback).not.toHaveBeenCalled();
    });
});
