import { useEffect, useState } from 'react';

/**
 * Custom hook for debounced loading states
 * 
 * Only shows loading UI if the operation takes longer than the debounce delay.
 * This prevents jarring "flash of loading state" for fast operations while
 * still providing feedback for slower ones.
 * 
 * This is the industry-standard UX pattern used by modern web apps like
 * Gmail, Slack, and GitHub.
 * 
 * @param isLoading - The actual loading state from your async operation
 * @param delay - Delay in milliseconds before showing loading UI (default: 300ms)
 * @returns showLoading - Whether to display the loading UI
 * 
 * @example
 * ```tsx
 * const [isLoading, setIsLoading] = useState(false);
 * const showLoading = useDebouncedLoading(isLoading, 300);
 * 
 * const fetchData = async () => {
 *   setIsLoading(true);
 *   try {
 *     const result = await api.getData();
 *     setData(result);
 *   } finally {
 *     setIsLoading(false);
 *   }
 * };
 * 
 * return (
 *   <>
 *     {showLoading ? (
 *       <LoadingDisplay message="Loading..." />
 *     ) : (
 *       <DataDisplay data={data} />
 *     )}
 *   </>
 * );
 * ```
 * 
 * TYPICAL USER EXPERIENCE:
 * - Fast operations (<300ms): No loading UI shown, feels instant ⚡
 * - Slow operations (>300ms): Loading UI appears after 300ms delay
 */
export function useDebouncedLoading(isLoading: boolean, delay: number = 300): boolean {
    const [showLoading, setShowLoading] = useState(false);

    useEffect(() => {
        if (isLoading) {
            // Start a timer to show loading UI after delay
            const timeout = setTimeout(() => {
                setShowLoading(true);
            }, delay);

            // Cleanup timer if loading completes before delay
            return () => clearTimeout(timeout);
        } else {
            // Immediately hide loading UI when operation completes
            setShowLoading(false);
            // Return undefined explicitly to satisfy TypeScript
            return undefined;
        }
    }, [isLoading, delay]);

    return showLoading;
}

