/**
 * useElapsedStage Tests
 *
 * Drives the sub-message on long waits (the Adobe org-services catalog measured
 * 38.9s / 96 services on a real org, 2026-07-31). The contract is small: show the
 * LATEST stage whose threshold has passed, nothing before the first, and reset
 * when the wait ends so a second wait starts from the beginning.
 *
 */

import { renderHook, act } from '@testing-library/react';
import { ORG_SERVICES_LOADING_STAGES, useElapsedStage } from '@/core/ui/hooks/useElapsedStage';

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

    it('shows a stage AT its threshold, not only past it', () => {
        // The boundary is the whole contract of a threshold: a stage declared at
        // 5s that first appears at 6s is a stage nobody configured.
        const { result } = renderHook(() => useElapsedStage(true, STAGES));

        advance(5000);

        expect(result.current).toBe('Still working…');
    });

    it('shows nothing while inactive', () => {
        const { result } = renderHook(() => useElapsedStage(false, STAGES));

        advance(20000);

        expect(result.current).toBeUndefined();
    });

    // A stage at zero says "from the moment the wait starts". While there is no
    // wait there is nothing to say, so `active` gates the message outright rather
    // than relying on the elapsed clock sitting at zero.
    it('shows nothing while inactive even for a stage with a zero threshold', () => {
        const { result } = renderHook(() =>
            useElapsedStage(false, [{ afterMs: 0, message: 'Starting…' }])
        );

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

    // The shared constant is the only reason this hook exists — every surface that
    // waits on the Adobe org-services catalog passes it. An empty list, or a stage
    // that lost its threshold, disables the whole thing with nothing to see.
    it('advances through TWO distinct messages when driven by the org-services stages', () => {
        const { result } = renderHook(() => useElapsedStage(true, ORG_SERVICES_LOADING_STAGES));

        advance(5000);
        const early = result.current;
        expect(early).toEqual(expect.any(String));

        advance(11000);

        expect(result.current).toEqual(expect.any(String));
        expect(result.current).not.toBe(early);
    });

    it('clears its interval on unmount', () => {
        const clearSpy = jest.spyOn(global, 'clearInterval');
        const { unmount } = renderHook(() => useElapsedStage(true, STAGES));

        unmount();

        expect(clearSpy).toHaveBeenCalled();
        clearSpy.mockRestore();
    });
});
