import { useState, useCallback } from 'react';

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
export function useLoadingState<T>(
  initialData: T | null = null
): UseLoadingStateReturn<T> {
  const [data, setDataState] = useState<T | null>(initialData);
  const [loading, setLoadingState] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(!!initialData);
  const [isRefreshing, setIsRefreshingState] = useState(false);

  const setData = useCallback((newData: T) => {
    setDataState(newData);
    setLoadingState(false);
    setIsRefreshingState(false);
    setErrorState(null);
    setHasLoadedOnce(true);
  }, []);

  const setLoading = useCallback((isLoading: boolean) => {
    setLoadingState(isLoading);
    if (isLoading) {
      setErrorState(null);
    }
  }, []);

  const setError = useCallback((errorMessage: string) => {
    setErrorState(errorMessage);
    setLoadingState(false);
    setIsRefreshingState(false);
  }, []);

  const setRefreshing = useCallback((refreshing: boolean) => {
    setIsRefreshingState(refreshing);
    if (refreshing) {
      setErrorState(null);
    }
  }, []);

  const reset = useCallback(() => {
    setDataState(initialData);
    setLoadingState(false);
    setErrorState(null);
    setHasLoadedOnce(!!initialData);
    setIsRefreshingState(false);
  }, [initialData]);

  return {
    data,
    loading,
    error,
    hasLoadedOnce,
    isRefreshing,
    setData,
    setLoading,
    setError,
    setRefreshing,
    reset
  };
}
