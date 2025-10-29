"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useLoadingState = useLoadingState;
const react_1 = require("react");
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
function useLoadingState(initialData = null) {
    const [data, setDataState] = (0, react_1.useState)(initialData);
    const [loading, setLoadingState] = (0, react_1.useState)(false);
    const [error, setErrorState] = (0, react_1.useState)(null);
    const [hasLoadedOnce, setHasLoadedOnce] = (0, react_1.useState)(!!initialData);
    const [isRefreshing, setIsRefreshingState] = (0, react_1.useState)(false);
    const setData = (0, react_1.useCallback)((newData) => {
        setDataState(newData);
        setLoadingState(false);
        setIsRefreshingState(false);
        setErrorState(null);
        setHasLoadedOnce(true);
    }, []);
    const setLoading = (0, react_1.useCallback)((isLoading) => {
        setLoadingState(isLoading);
        if (isLoading) {
            setErrorState(null);
        }
    }, []);
    const setError = (0, react_1.useCallback)((errorMessage) => {
        setErrorState(errorMessage);
        setLoadingState(false);
        setIsRefreshingState(false);
    }, []);
    const setRefreshing = (0, react_1.useCallback)((refreshing) => {
        setIsRefreshingState(refreshing);
        if (refreshing) {
            setErrorState(null);
        }
    }, []);
    const reset = (0, react_1.useCallback)(() => {
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
//# sourceMappingURL=useLoadingState.js.map