import { useState, useCallback } from 'react';
import { useLoadingState } from './useLoadingState';
import { useVSCodeMessage } from './useVSCodeMessage';

interface UseAsyncDataOptions<T> {
  /** Initial data */
  initialData?: T | null;
  /** Automatically load data on mount */
  autoLoad?: boolean;
  /** Message type to listen for data updates */
  messageType?: string;
  /** Message type to listen for errors */
  errorMessageType?: string;
  /** Transform function for incoming data */
  transform?: (data: unknown) => T;
  /** Auto-select when only one item */
  autoSelectSingle?: boolean;
  /** Callback when single item is auto-selected */
  onAutoSelect?: (item: unknown) => void;
}

interface UseAsyncDataReturn<T> {
  /** Current data */
  data: T | null;
  /** Loading status */
  loading: boolean;
  /** Error state */
  error: string | null;
  /** Whether data has been loaded at least once */
  hasLoadedOnce: boolean;
  /** Whether currently refreshing */
  isRefreshing: boolean;
  /** Manually trigger data load */
  load: (isRefresh?: boolean) => void;
  /** Manually set data */
  setData: (data: T) => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Set error state */
  setError: (error: string) => void;
  /** Reset to initial state */
  reset: () => void;
}

/**
 * Hook for managing async data with VS Code message integration
 *
 * Combines useLoadingState with useVSCodeMessage for a complete
 * async data fetching pattern. Handles loading, error, data states,
 * and message subscriptions automatically.
 *
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * const {
 *   data: projects,
 *   loading,
 *   error,
 *   load,
 *   hasLoadedOnce
 * } = useAsyncData<Project[]>({
 *   messageType: 'projects',
 *   errorMessageType: 'project-error',
 *   autoLoad: true,
 *   autoSelectSingle: true,
 *   onAutoSelect: (project) => selectProject(project)
 * });
 *
 * return (
 *   <>
 *     {loading && !hasLoadedOnce && <LoadingDisplay />}
 *     {error && <ErrorDisplay message={error} />}
 *     {projects && <ProjectList items={projects} />}
 *   </>
 * );
 * ```
 */
export function useAsyncData<T>(
  options: UseAsyncDataOptions<T> = {},
): UseAsyncDataReturn<T> {
  const {
    initialData = null,
    autoLoad = false,
    messageType,
    errorMessageType,
    transform,
    autoSelectSingle = false,
    onAutoSelect,
  } = options;

  const {
    data,
    loading,
    error,
    hasLoadedOnce,
    isRefreshing,
    setData: setDataState,
    setLoading,
    setError: setErrorState,
    setRefreshing,
    reset,
  } = useLoadingState<T>(initialData);

  const [_loadRequested, setLoadRequested] = useState(autoLoad);

  // Listen for data messages - hook must be called at top level
  useVSCodeMessage(
    messageType || '__disabled__',
    (receivedData) => {
      if (!messageType) return;

      // Handle error responses (data with error field)
      if (receivedData && typeof receivedData === 'object' && 'error' in receivedData) {
        setErrorState(receivedData.error as string);
        return;
      }

      // Transform data if transform function provided
      const processedData = transform ? transform(receivedData) : (receivedData as T);
      setDataState(processedData);

      // Auto-select if only one item and array data
      if (
        autoSelectSingle &&
        Array.isArray(processedData) &&
        processedData.length === 1 &&
        onAutoSelect
      ) {
        onAutoSelect(processedData[0]);
      }
    },
    [messageType, transform, autoSelectSingle, onAutoSelect, setDataState, setErrorState],
  );

  // Listen for error messages - hook must be called at top level
  useVSCodeMessage<string | { error?: string }>(
    errorMessageType || '__disabled__',
    (errorData) => {
      if (!errorMessageType) return;

      const errorMessage =
        typeof errorData === 'string'
          ? errorData
          : (errorData as { error?: string })?.error || 'An error occurred';
      setErrorState(errorMessage);
    },
    [errorMessageType, setErrorState],
  );

  const load = useCallback((isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadRequested(true);
  }, [setLoading, setRefreshing]);

  const setData = useCallback(
    (newData: T) => {
      setDataState(newData);
    },
    [setDataState],
  );

  const setError = useCallback(
    (errorMessage: string) => {
      setErrorState(errorMessage);
    },
    [setErrorState],
  );

  return {
    data,
    loading,
    error,
    hasLoadedOnce,
    isRefreshing,
    load,
    setData,
    setLoading,
    setError,
    reset,
  };
}
