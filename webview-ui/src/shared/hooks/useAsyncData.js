"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAsyncData = useAsyncData;
const react_1 = require("react");
const useLoadingState_1 = require("@/core/ui/hooks/useLoadingState");
const useVSCodeMessage_1 = require("@/core/ui/hooks/useVSCodeMessage");
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
function useAsyncData(options = {}) {
    const { initialData = null, autoLoad = false, messageType, errorMessageType, transform, autoSelectSingle = false, onAutoSelect } = options;
    const { data, loading, error, hasLoadedOnce, isRefreshing, setData: setDataState, setLoading, setError: setErrorState, setRefreshing, reset } = (0, useLoadingState_1.useLoadingState)(initialData);
    const [loadRequested, setLoadRequested] = (0, react_1.useState)(autoLoad);
    // Listen for data messages
    (0, react_1.useEffect)(() => {
        if (!messageType)
            return;
        const unsubscribe = (0, useVSCodeMessage_1.useVSCodeMessage)(messageType, (receivedData) => {
            // Handle error responses (data with error field)
            if (receivedData && typeof receivedData === 'object' && 'error' in receivedData) {
                setErrorState(receivedData.error);
                return;
            }
            // Transform data if transform function provided
            const processedData = transform ? transform(receivedData) : receivedData;
            setDataState(processedData);
            // Auto-select if only one item and array data
            if (autoSelectSingle &&
                Array.isArray(processedData) &&
                processedData.length === 1 &&
                onAutoSelect) {
                onAutoSelect(processedData[0]);
            }
        });
        return unsubscribe;
    }, [messageType, transform, autoSelectSingle, onAutoSelect, setDataState, setErrorState]);
    // Listen for error messages
    (0, react_1.useEffect)(() => {
        if (!errorMessageType)
            return;
        const unsubscribe = (0, useVSCodeMessage_1.useVSCodeMessage)(errorMessageType, (errorData) => {
            const errorMessage = typeof errorData === 'string'
                ? errorData
                : errorData?.error || 'An error occurred';
            setErrorState(errorMessage);
        });
        return unsubscribe;
    }, [errorMessageType, setErrorState]);
    const load = (0, react_1.useCallback)((isRefresh = false) => {
        if (isRefresh) {
            setRefreshing(true);
        }
        else {
            setLoading(true);
        }
        setLoadRequested(true);
    }, [setLoading, setRefreshing]);
    const setData = (0, react_1.useCallback)((newData) => {
        setDataState(newData);
    }, [setDataState]);
    const setError = (0, react_1.useCallback)((errorMessage) => {
        setErrorState(errorMessage);
    }, [setErrorState]);
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
        reset
    };
}
//# sourceMappingURL=useAsyncData.js.map