/**
 * useFieldSyncWithBackend Hook
 *
 * Provides debounced field value synchronization with the backend.
 * Manages local state and syncs to backend after debounce delay.
 *
 * @module features/dashboard/ui/hooks/useFieldSyncWithBackend
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/**
 * Options for useFieldSyncWithBackend hook
 */
export interface UseFieldSyncWithBackendOptions<T = string> {
    /** Unique identifier for the field */
    fieldId: string;
    /** Message type to send to backend */
    messageType: string;
    /** Initial field value */
    initialValue?: T;
    /** Debounce delay in milliseconds (default: 300) */
    debounceMs?: number;
    /** Callback on successful sync */
    onSyncSuccess?: (value: T) => void;
    /** Callback on sync error */
    onSyncError?: (error: Error) => void;
}

/**
 * Return type for useFieldSyncWithBackend hook
 */
export interface UseFieldSyncWithBackendReturn<T = string> {
    /** Current field value */
    value: T;
    /** Set new field value (triggers debounced sync) */
    setValue: (value: T) => void;
    /** Whether sync is in progress */
    isSyncing: boolean;
    /** Error message from last sync attempt */
    error: string | undefined;
    /** Flush pending sync immediately */
    flush: () => Promise<void>;
}

/**
 * Hook for debounced field synchronization with backend
 *
 * @param options - Sync configuration
 * @returns Field state and sync controls
 *
 * @example
 * ```tsx
 * const { value, setValue, isSyncing, error } = useFieldSyncWithBackend({
 *     fieldId: 'project-name',
 *     messageType: 'updateField',
 *     initialValue: project.name,
 *     debounceMs: 300,
 * });
 *
 * return (
 *     <TextField
 *         value={value}
 *         onChange={setValue}
 *         validationState={error ? 'invalid' : undefined}
 *     />
 * );
 * ```
 */
export function useFieldSyncWithBackend<T = string>({
    fieldId,
    messageType,
    initialValue,
    debounceMs = 300,
    onSyncSuccess,
    onSyncError,
}: UseFieldSyncWithBackendOptions<T>): UseFieldSyncWithBackendReturn<T> {
    const [value, setLocalValue] = useState<T>(initialValue as T);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);

    // Track pending value and timer
    const pendingValueRef = useRef<T | undefined>(undefined);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const isMountedRef = useRef(true);

    // Cleanup on unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, []);

    // Sync to backend
    const syncToBackend = useCallback(async (syncValue: T) => {
        if (!isMountedRef.current) return;

        setIsSyncing(true);
        setError(undefined);

        try {
            await webviewClient.request(messageType, {
                fieldId,
                value: syncValue,
            });

            if (!isMountedRef.current) return;

            setError(undefined);
            onSyncSuccess?.(syncValue);
        } catch (e) {
            if (!isMountedRef.current) return;

            const errorMessage = e instanceof Error ? e.message : 'Sync failed';
            setError(errorMessage);
            onSyncError?.(e instanceof Error ? e : new Error(errorMessage));
        } finally {
            if (isMountedRef.current) {
                setIsSyncing(false);
            }
        }
    }, [fieldId, messageType, onSyncSuccess, onSyncError]);

    // Set value with debounced sync
    const setValue = useCallback((newValue: T) => {
        setLocalValue(newValue);
        pendingValueRef.current = newValue;

        // Clear existing timer
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }

        // Schedule sync after debounce delay
        timerRef.current = setTimeout(() => {
            if (pendingValueRef.current !== undefined) {
                syncToBackend(pendingValueRef.current);
                pendingValueRef.current = undefined;
            }
        }, debounceMs);
    }, [debounceMs, syncToBackend]);

    // Flush pending sync immediately
    const flush = useCallback(async () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        if (pendingValueRef.current !== undefined) {
            const valueToSync = pendingValueRef.current;
            pendingValueRef.current = undefined;
            await syncToBackend(valueToSync);
        }
    }, [syncToBackend]);

    return {
        value,
        setValue,
        isSyncing,
        error,
        flush,
    };
}
