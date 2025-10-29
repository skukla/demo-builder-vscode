interface LoadingState<T> {
    /** Current data */
    data: T | null;
    /** Loading status */
    loading: boolean;
    /** Error state */
    error: string | null;
    /** Whether data has been loaded at least once */
    hasLoadedOnce: boolean;
    /** Whether currently refreshing (loading but has cached data) */
    isRefreshing: boolean;
}
interface UseLoadingStateReturn<T> extends LoadingState<T> {
    /** Set data and clear loading/error states */
    setData: (data: T) => void;
    /** Set loading state */
    setLoading: (loading: boolean) => void;
    /** Set error state and clear loading */
    setError: (error: string) => void;
    /** Set refreshing state (loading with cached data) */
    setRefreshing: (refreshing: boolean) => void;
    /** Reset to initial state */
    reset: () => void;
}
/**
 * Hook for managing async data loading state
 *
 * Provides unified state management for loading, error, data, and refresh states.
 * Tracks whether data has been loaded at least once to enable better UX patterns.
 *
 * @param initialData - Optional initial data value
 *
 * @example
 * ```tsx
 * const {
 *   data,
 *   loading,
 *   error,
 *   hasLoadedOnce,
 *   isRefreshing,
 *   setData,
 *   setLoading,
 *   setError,
 *   setRefreshing
 * } = useLoadingState<Project[]>([]);
 *
 * const loadProjects = async (isRefresh = false) => {
 *   if (isRefresh) {
 *     setRefreshing(true);
 *   } else {
 *     setLoading(true);
 *   }
 *
 *   try {
 *     const result = await fetchProjects();
 *     setData(result);
 *   } catch (err) {
 *     setError(err.message);
 *   }
 * };
 * ```
 */
export declare function useLoadingState<T>(initialData?: T | null): UseLoadingStateReturn<T>;
export {};
//# sourceMappingURL=useLoadingState.d.ts.map