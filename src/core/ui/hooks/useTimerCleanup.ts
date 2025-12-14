import { useRef, useEffect, useCallback } from 'react';

/**
 * Timer reference object managed by useTimerCleanup
 */
export interface TimerRef {
    /** The timer reference */
    ref: React.MutableRefObject<NodeJS.Timeout | null>;
    /** Set a new timeout and store its ID for cleanup */
    set: (callback: () => void, delay: number) => void;
    /** Clear the timer if active */
    clear: () => void;
}

/**
 * Hook for managing multiple timer refs with automatic cleanup on unmount.
 *
 * Provides a consistent pattern for timer management that:
 * - Stores timer IDs in refs for proper cleanup
 * - Clears all timers on component unmount
 * - Prevents memory leaks and state updates on unmounted components
 *
 * @param count - Number of timer refs to create (default: 1)
 * @returns Array of TimerRef objects with set/clear methods
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const [navTimer, clearTimer] = useTimerCleanup(2);
 *
 *   const handleAction = () => {
 *     navTimer.set(() => {
 *       doSomething();
 *       clearTimer.set(() => cleanup(), 300);
 *     }, 600);
 *   };
 *
 *   return <button onClick={handleAction}>Start</button>;
 * }
 * ```
 */
export function useTimerCleanup(count: number = 1): TimerRef[] {
    // Create refs array once (stable across re-renders)
    const refsArray = useRef<Array<React.MutableRefObject<NodeJS.Timeout | null>>>([]);

    // Initialize refs on first render
    if (refsArray.current.length === 0) {
        for (let i = 0; i < count; i++) {
            refsArray.current.push({ current: null });
        }
    }

    // Clear all timers on unmount
    useEffect(() => {
        const refs = refsArray.current;
        return () => {
            refs.forEach((timerRef) => {
                if (timerRef.current) {
                    clearTimeout(timerRef.current);
                    timerRef.current = null;
                }
            });
        };
    }, []);

    // Create stable timer management objects
    const timerObjects = useCallback((): TimerRef[] => {
        return refsArray.current.map((timerRef) => ({
            ref: timerRef,
            set: (callback: () => void, delay: number) => {
                // Clear any existing timer before setting a new one
                if (timerRef.current) {
                    clearTimeout(timerRef.current);
                }
                timerRef.current = setTimeout(callback, delay);
            },
            clear: () => {
                if (timerRef.current) {
                    clearTimeout(timerRef.current);
                    timerRef.current = null;
                }
            },
        }));
    }, []);

    return timerObjects();
}

/**
 * Simplified hook for a single timer with cleanup.
 *
 * @returns TimerRef object with set/clear methods
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const timer = useSingleTimer();
 *
 *   const handleAction = () => {
 *     timer.set(() => doSomething(), 1000);
 *   };
 *
 *   return <button onClick={handleAction}>Start</button>;
 * }
 * ```
 */
export function useSingleTimer(): TimerRef {
    return useTimerCleanup(1)[0];
}
