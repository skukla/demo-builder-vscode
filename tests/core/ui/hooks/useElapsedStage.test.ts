/**
 * useElapsedStage Tests
 *
 * Drives the sub-message on long waits (the Adobe org-services catalog measured
 * 38.9s / 96 services on a real org, 2026-07-31). The contract is small: show the
 * LATEST stage whose threshold has passed, nothing before the first, and reset
 * when the wait ends so a second wait starts from the beginning.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useElapsedStage } from '@/core/ui/hooks/useElapsedStage';

const STAGES = [
    { afterMs: 5000, message: 'Still working…' },
    { afterMs: 15000, message: 'Adobe is returning the full catalog…' },
];

beforeEach(() => {
    jest.useFakeTimers();
});
afterEach(() => {
    jest.useRealTimers();
});

/** Advance both the clock and the interval, as a real wait would. */
function advance(ms: number): void {
    act(() => {
        jest.advanceTimersByTime(ms);
    });
}

describe('useElapsedStage', () => {
    it('shows nothing before the first threshold', () => {
        const { result } = renderHook(() => useElapsedStage(true, STAGES));

        expect(result.current).toBeUndefined();
        advance(4000);
        expect(result.current).toBeUndefined();
    });

    it('shows a stage once its threshold passes', () => {
        const { result } = renderHook(() => useElapsedStage(true, STAGES));

        advance(6000);

        expect(result.current).toBe('Still working…');
    });

    it('advances to the LATEST stage passed, not the first', () => {
        const { result } = renderHook(() => useElapsedStage(true, STAGES));

        advance(20000);

        expect(result.current).toBe('Adobe is returning the full catalog…');
    });

    it('accepts stages in any order', () => {
        const { result } = renderHook(() => useElapsedStage(true, [...STAGES].reverse()));

        advance(20000);

        expect(result.current).toBe('Adobe is returning the full catalog…');
    });

    it('shows nothing while inactive', () => {
        const { result } = renderHook(() => useElapsedStage(false, STAGES));

        advance(20000);

        expect(result.current).toBeUndefined();
    });

    // A second wait must not inherit the first one's elapsed time, or it would
    // open on "Adobe is returning the full catalog…" immediately.
    it('RESETS when the wait ends, so the next one starts fresh', () => {
        const { result, rerender } = renderHook(({ active }) => useElapsedStage(active, STAGES), {
            initialProps: { active: true },
        });
        advance(20000);
        expect(result.current).toBe('Adobe is returning the full catalog…');

        rerender({ active: false });
        expect(result.current).toBeUndefined();

        rerender({ active: true });
        expect(result.current).toBeUndefined();
        advance(6000);
        expect(result.current).toBe('Still working…');
    });

    it('is inert with no stages', () => {
        const { result } = renderHook(() => useElapsedStage(true, []));

        advance(60000);

        expect(result.current).toBeUndefined();
    });

    it('clears its interval on unmount', () => {
        const clearSpy = jest.spyOn(global, 'clearInterval');
        const { unmount } = renderHook(() => useElapsedStage(true, STAGES));

        unmount();

        expect(clearSpy).toHaveBeenCalled();
        clearSpy.mockRestore();
    });
});
