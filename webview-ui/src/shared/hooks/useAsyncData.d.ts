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
export declare function useAsyncData<T>(options?: UseAsyncDataOptions<T>): UseAsyncDataReturn<T>;
export {};
//# sourceMappingURL=useAsyncData.d.ts.map