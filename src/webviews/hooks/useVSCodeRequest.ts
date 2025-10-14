import { useCallback, useState } from 'react';
import { vscode } from '../app/vscodeApi';

interface UseVSCodeRequestReturn<T> {
  /** Execute the request */
  execute: (payload?: unknown) => Promise<T>;
  /** Current loading state */
  loading: boolean;
  /** Error from last request (null if no error) */
  error: Error | null;
  /** Response data from last successful request */
  data: T | null;
  /** Reset state to initial values */
  reset: () => void;
}

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
export function useVSCodeRequest<T = unknown>(
  type: string,
  options: {
    timeout?: number;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
  } = {}
): UseVSCodeRequestReturn<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(
    async (payload?: unknown): Promise<T> => {
      setLoading(true);
      setError(null);

      try {
        const result = await vscode.request<T>(
          type,
          payload,
          options.timeout
        );

        setData(result);
        setLoading(false);

        // Call success callback if provided
        if (options.onSuccess) {
          options.onSuccess(result);
        }

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setLoading(false);

        // Call error callback if provided
        if (options.onError) {
          options.onError(error);
        }

        throw error;
      }
    },
    [type, options.timeout, options.onSuccess, options.onError]
  );

  const reset = useCallback(() => {
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
