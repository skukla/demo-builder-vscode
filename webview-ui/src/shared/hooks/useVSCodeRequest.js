"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useVSCodeRequest = useVSCodeRequest;
const react_1 = require("react");
const vscode_api_1 = require("@/core/ui/vscode-api");
/**
 * Hook for making request-response calls to VS Code extension
 *
 * Manages loading, error, and data state automatically.
 * Returns an execute function to trigger the request.
 *
 * @param type - Request message type
 * @param options - Optional configuration
 * @param options.timeout - Request timeout in milliseconds (default: 30000)
 * @param options.onSuccess - Callback when request succeeds
 * @param options.onError - Callback when request fails
 *
 * @example
 * ```tsx
 * const { execute, loading, error, data } = useVSCodeRequest<Project[]>('get-projects');
 *
 * const loadProjects = async () => {
 *   try {
 *     const projects = await execute({ orgId: 'org123' });
 *     console.log('Loaded projects:', projects);
 *   } catch (err) {
 *     console.error('Failed:', err);
 *   }
 * };
 * ```
 */
function useVSCodeRequest(type, options = {}) {
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const [data, setData] = (0, react_1.useState)(null);
    // Use refs to store callbacks to avoid recreating execute function
    const optionsRef = (0, react_1.useRef)(options);
    // Update ref whenever options change
    optionsRef.current = options;
    const execute = (0, react_1.useCallback)(async (payload) => {
        setLoading(true);
        setError(null);
        try {
            const result = await vscode_api_1.vscode.request(type, payload, optionsRef.current.timeout);
            setData(result);
            setLoading(false);
            // Call success callback if provided
            if (optionsRef.current.onSuccess) {
                optionsRef.current.onSuccess(result);
            }
            return result;
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            setLoading(false);
            // Call error callback if provided
            if (optionsRef.current.onError) {
                optionsRef.current.onError(error);
            }
            throw error;
        }
    }, [type]);
    const reset = (0, react_1.useCallback)(() => {
        setLoading(false);
        setError(null);
        setData(null);
    }, []);
    return {
        execute,
        loading,
        error,
        data,
        reset
    };
}
//# sourceMappingURL=useVSCodeRequest.js.map