import { useState, useCallback } from 'react';
import { useIsMounted } from './useIsMounted';

/**
 * Options for configuring an async operation
 */
export interface UseAsyncOperationOptions<T> {
    /** Callback when operation succeeds */
    onSuccess?: (data: T) => void;
    /** Callback when operation fails */
    onError?: (error: Error) => void;
    /** Initial message to display */
    initialMessage?: string;
    /** Initial sub-message to display */
    initialSubMessage?: string;
}

/**
 * Return value from useAsyncOperation
 */
export interface UseAsyncOperationReturn<T> {
    /** Execute an async operation */
    execute: (operation: () => Promise<T>) => Promise<T | undefined>;
    /** Whether an operation is currently executing */
    isExecuting: boolean;
    /** Current status message */
    message: string | null;
    /** Current sub-message (details) */
    subMessage: string | null;
    /** Update the current message */
    setMessage: (msg: string | null) => void;
    /** Update the current sub-message */
    setSubMessage: (msg: string | null) => void;
    /** Current error, if any */
    error: Error | null;
    /** Reset all state to initial values */
    reset: () => void;
}

/**
 * Hook for managing async operation state with messages and error handling.
 *
 * Provides a consistent pattern for:
 * - Tracking execution state (isExecuting)
 * - Managing status messages (message, subMessage)
 * - Error handling with callbacks
 * - Cleanup on unmount
 *
 * @template T - The return type of the async operation
 *
 * @example
 * ```tsx
 * const checkOperation = useAsyncOperation<CheckResult>({
 *     onSuccess: (result) => console.log('Success:', result),
 *     onError: (error) => console.error('Failed:', error),
 *     initialMessage: 'Checking...',
 * });
 *
 * const handleCheck = async () => {
 *     checkOperation.setMessage('Verifying configuration...');
 *     await checkOperation.execute(async () => {
 *         return await api.check();
 *     });
 * };
 *
 * return (
 *     <div>
 *         {checkOperation.isExecuting && <Spinner />}
 *         {checkOperation.message && <Text>{checkOperation.message}</Text>}
 *         {checkOperation.error && <Error>{checkOperation.error.message}</Error>}
 *     </div>
 * );
 * ```
 */
export function useAsyncOperation<T = void>(
    options: UseAsyncOperationOptions<T> = {}
): UseAsyncOperationReturn<T> {
    const {
        onSuccess,
        onError,
        initialMessage = null,
        initialSubMessage = null,
    } = options;

    const [isExecuting, setIsExecuting] = useState(false);
    const [message, setMessage] = useState<string | null>(initialMessage);
    const [subMessage, setSubMessage] = useState<string | null>(initialSubMessage);
    const [error, setError] = useState<Error | null>(null);

    // Track mounted state to prevent state updates after unmount
    const isMountedRef = useIsMounted();

    const execute = useCallback(
        async (operation: () => Promise<T>): Promise<T | undefined> => {
            if (!isMountedRef.current) return undefined;

            setIsExecuting(true);
            setError(null);

            try {
                const result = await operation();

                if (!isMountedRef.current) return undefined;

                setIsExecuting(false);
                onSuccess?.(result);
                return result;
            } catch (e) {
                if (!isMountedRef.current) return undefined;

                const err = e instanceof Error ? e : new Error(String(e));
                setError(err);
                setIsExecuting(false);
                onError?.(err);
                return undefined;
            }
        },
        [onSuccess, onError]
    );

    const reset = useCallback(() => {
        setIsExecuting(false);
        setMessage(initialMessage);
        setSubMessage(initialSubMessage);
        setError(null);
    }, [initialMessage, initialSubMessage]);

    return {
        execute,
        isExecuting,
        message,
        subMessage,
        setMessage,
        setSubMessage,
        error,
        reset,
    };
}
