/**
 * usePollingWithTimeout Hook
 *
 * Generic polling hook that fetches data at intervals until a condition is met
 * or a timeout occurs. Handles cleanup and provides loading/error states.
 *
 * @module core/ui/hooks/usePollingWithTimeout
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Options for usePollingWithTimeout hook
 */
export interface UsePollingWithTimeoutOptions<T> {
    /** Async function to fetch data */
    fetcher: () => Promise<T>;
    /** Condition to check if polling should stop */
    condition: (result: T) => boolean;
    /** Polling interval in milliseconds */
    interval: number;
    /** Maximum time to poll before timeout in milliseconds */
    timeout: number;
    /** Whether polling is enabled (default: true) */
    enabled?: boolean;
}

/**
 * Return type for usePollingWithTimeout hook
 */
export interface UsePollingWithTimeoutReturn<T> {
    /** Data from the last successful fetch */
    data: T | null;
    /** Whether polling is in progress */
    loading: boolean;
    /** Whether polling timed out */
    timedOut: boolean;
    /** Error message if fetch failed */
    error: string | undefined;
}

/**
 * Hook for polling with automatic timeout
 *
 * Polls at specified intervals until condition is met or timeout occurs.
 * Properly cleans up timers on unmount or when disabled.
 *
 * @param options - Polling configuration
 * @returns Polling state including data, loading, timedOut, and error
 *
 * @example
 * ```tsx
 * const { data, loading, timedOut, error } = usePollingWithTimeout({
 *     fetcher: async () => fetchStatus(),
 *     condition: (result) => result.ready === true,
 *     interval: 1000,
 *     timeout: 30000,
 *     enabled: true,
 * });
 * ```
 */
export function usePollingWithTimeout<T>({
    fetcher,
    condition,
    interval,
    timeout,
    enabled = true,
}: UsePollingWithTimeoutOptions<T>): UsePollingWithTimeoutReturn<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(enabled);
    const [timedOut, setTimedOut] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);

    // Track mount state and timers
    const isMountedRef = useRef(true);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isPollingRef = useRef(false);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        isPollingRef.current = false;
    }, []);

    useEffect(() => {
        isMountedRef.current = true;

        if (!enabled) {
            cleanup();
            return;
        }

        // Execute single fetch
        const executeFetch = async () => {
            if (!isMountedRef.current || !isPollingRef.current) return;

            try {
                const result = await fetcher();

                // Check if still mounted and still actively polling (not timed out)
                if (!isMountedRef.current || !isPollingRef.current) return;

                setData(result);
                setError(undefined);

                // Check if condition is met
                if (condition(result)) {
                    cleanup();
                    setLoading(false);
                }
            } catch (e) {
                if (!isMountedRef.current) return;

                const errorMessage = e instanceof Error ? e.message : 'Polling failed';
                setError(errorMessage);
                setLoading(false);
                cleanup();
            }
        };

        // Start polling
        isPollingRef.current = true;
        setLoading(true);
        setTimedOut(false);
        setError(undefined);

        // Initial fetch
        executeFetch();

        // Set up interval for subsequent fetches
        intervalRef.current = setInterval(executeFetch, interval);

        // Set up timeout
        timeoutRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;

            cleanup();
            setTimedOut(true);
            setError('Timeout');
            setLoading(false);
        }, timeout);

        return () => {
            isMountedRef.current = false;
            cleanup();
        };
    }, [enabled, fetcher, condition, interval, timeout, cleanup]);

    return {
        data,
        loading,
        timedOut,
        error,
    };
}
