/**
 * useRunClock — how long a whole run has been going (PL-59; one clock for the run
 * since 2026-10-16, when the stage clock that restarted on every step was removed).
 *
 * Asserted: nothing until a second is up; it counts from the START the extension
 * stamped, not from when the modal opened; it does not restart while the start stays
 * the same; no start, no clock. And `tookValue` words the end.
 */

import { act, renderHook } from '@testing-library/react';
import { tookValue, useRunClock } from '@/core/ui/hooks/useRunClock';

/** The setup file already installs fake timers; move them by hand. */
function tick(ms: number): void {
    act(() => {
        jest.advanceTimersByTime(ms);
    });
}

describe('useRunClock', () => {
    it('shows nothing until the run has gone for a second', () => {
        // Read once: inside the callback it would move with every render.
        const began = Date.now();
        const { result } = renderHook(() => useRunClock(began));

        expect(result.current).toBeUndefined();
        tick(1000);
        expect(result.current).toBe('1 second');
    });

    it('counts from when the run began, not from when the modal opened', () => {
        const began = Date.now() - 150_000;

        const { result } = renderHook(() => useRunClock(began));

        expect(result.current).toBe('2 minutes, 30 seconds');
    });

    it('keeps counting across stages: the start does not change between pushes', () => {
        const began = Date.now();
        const { result, rerender } = renderHook(({ start }) => useRunClock(start), {
            initialProps: { start: began },
        });
        tick(5000);
        rerender({ start: began });
        tick(3000);

        expect(result.current).toBe('8 seconds');
    });

    it('shows nothing without a start — control', () => {
        const { result } = renderHook(() => useRunClock(undefined));
        tick(5000);

        expect(result.current).toBeUndefined();
    });
});

describe('tookValue', () => {
    it('says how long the whole run took', () => {
        expect(tookValue(192_000)).toBe('3 minutes, 12 seconds');
    });

    // A run under a minute was over before anyone wondered (owner, 2026-10-26).
    it('says nothing for a run under a minute, and from a minute on', () => {
        expect(tookValue(59_999)).toBeUndefined();
        expect(tookValue(60_000)).toBe('1 minute');
    });
});
