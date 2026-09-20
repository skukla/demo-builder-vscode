/**
 * useElapsedClock — the one thing on the progress modal that always moves.
 *
 * PL-59: a stage can hold a single line for two minutes while it waits on Adobe
 * (a Bodea mesh deploy's subscribe, 1m 58s on 2026-09-19), and the SC has nothing
 * to tell a live run from a hung one.
 */

import { act, renderHook } from '@testing-library/react';
import { useElapsedClock } from '@/core/ui/hooks/useElapsedClock';

/** The setup file already installs fake timers; move them by hand. */
function tick(ms: number): void {
    act(() => {
        jest.advanceTimersByTime(ms);
    });
}

describe('useElapsedClock', () => {
    it('shows nothing until a stage has run for a second', () => {
        const { result } = renderHook(() => useElapsedClock('Deploying the app'));

        expect(result.current).toBeUndefined();

        tick(1000);

        expect(result.current).toBe('1 second');
    });

    it('keeps counting, and reads as minutes past sixty seconds', () => {
        const { result } = renderHook(() => useElapsedClock('Deploying the app'));

        tick(45000);
        expect(result.current).toBe('45 seconds');

        tick(27000);
        expect(result.current).toBe('1 minute, 12 seconds');
    });

    // It times the STAGE, not the run: "1 minute, 12 seconds" left over from the
    // previous stage would say the new one has been stuck since before it started.
    it('starts again when the stage changes', () => {
        const { result, rerender } = renderHook(({ stage }) => useElapsedClock(stage), {
            initialProps: { stage: 'Adding Adobe services' },
        });
        tick(30000);
        expect(result.current).toBe('30 seconds');

        rerender({ stage: 'Deploying the app' });

        expect(result.current).toBeUndefined();
        tick(2000);
        expect(result.current).toBe('2 seconds');
    });

    it('stops when nothing is running', () => {
        const { result } = renderHook(() => useElapsedClock(null));

        tick(5000);

        expect(result.current).toBeUndefined();
    });
});
