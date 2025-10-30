import { useEffect, useState, useRef } from 'react';

/**
 * Custom hook to ensure loading UI displays for a minimum duration
 * 
 * Shows loading immediately when operation starts, but keeps it visible
 * for at least the minimum duration to avoid jarring "flashes" that look buggy.
 * 
 * This prevents the UX issue where a spinner appears and disappears so quickly
 * (<300ms) that it looks like a visual glitch rather than intentional feedback.
 * 
 * @param isLoading - The actual loading state from your async operation
 * @param minDuration - Minimum time in milliseconds to show loading (default: 500ms)
 * @returns showLoading - Whether to display the loading UI
 * 
 * @example
 * ```tsx
 * const [isLoading, setIsLoading] = useState(false);
 * const showLoading = useMinimumLoadingTime(isLoading, 500);
 * 
 * const handleClick = async () => {
 *   setIsLoading(true);  // Spinner shows immediately
 *   try {
 *     await quickOperation(); // Completes in 100ms
 *   } finally {
 *     setIsLoading(false);  // Spinner stays visible until 500ms total
 *   }
 * };
 * ```
 * 
 * USER EXPERIENCE:
 * - Operation starts: Spinner shows immediately ✓
 * - Fast operation (100ms): Spinner stays visible for 500ms total (feels intentional)
 * - Slow operation (2000ms): Spinner shows for actual duration (2000ms)
 */
export function useMinimumLoadingTime(isLoading: boolean, minDuration: number = 500): boolean {
    const [showLoading, setShowLoading] = useState(false);
    const loadingStartTime = useRef<number | null>(null);
    const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (isLoading) {
            // Loading started - show immediately and track start time
            setShowLoading(true);
            loadingStartTime.current = Date.now();
            
            // Clear any pending hide timeout
            if (hideTimeout.current) {
                clearTimeout(hideTimeout.current);
                hideTimeout.current = null;
            }
        } else if (loadingStartTime.current !== null) {
            // Loading finished - check if minimum duration has elapsed
            const elapsed = Date.now() - loadingStartTime.current;
            const remaining = minDuration - elapsed;

            if (remaining > 0) {
                // Haven't reached minimum duration yet - delay hiding
                hideTimeout.current = setTimeout(() => {
                    setShowLoading(false);
                    loadingStartTime.current = null;
                    hideTimeout.current = null;
                }, remaining);
            } else {
                // Minimum duration already exceeded - hide immediately
                setShowLoading(false);
                loadingStartTime.current = null;
            }
        }

        // Cleanup on unmount
        return () => {
            if (hideTimeout.current) {
                clearTimeout(hideTimeout.current);
            }
        };
    }, [isLoading, minDuration]);

    return showLoading;
}

