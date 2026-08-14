/**
 * One request to a Data Installer handler, with the response envelope unwrapped.
 *
 * **The envelope is the whole point.** A handler that RETURNS
 * `{success:false, error, code}` does not reject: the communication manager puts
 * the entire `HandlerResponse` in the response payload
 * (`core/communication/webviewCommunicationManager.ts`), and
 * `webviewClient.request` rejects only when a handler THROWS
 * (`core/ui/utils/WebviewClient.ts`). So `useVSCodeRequest` resolves with the
 * envelope and leaves its `error` null — every refusal from
 * `resolveDataInstallerAccess` (not configured, signed out, no token) arrives
 * looking exactly like a success.
 *
 * The connectivity line this replaced read `data.reachable` straight off that
 * envelope, so it printed "Connected to the Data Installer service" for a signed-out
 * user. This hook is where that class of bug is closed for the whole feature: both
 * failure shapes — a thrown transport error and a returned refusal — come out as
 * one `failure`, and `value` is the handler's `data` or nothing.
 *
 * Wraps the shared `useVSCodeRequest` rather than calling `webviewClient` directly;
 * the loading/error/data state machine is that hook's job, not this one's.
 *
 * @module features/data-installer/ui/hooks/useDataInstallerRequest
 */

import { useCallback, useMemo } from 'react';
import { useVSCodeRequest } from '@/core/ui/hooks/useVSCodeRequest';
import type { HandlerResponse } from '@/types/handlers';

/** A refusal or a transport failure, flattened into one shape. */
export interface DataInstallerFailure {
    /** Message to show. Handler-authored where there is one. */
    message: string;
    /** `ErrorCode` the guard set, when the failure came back as an envelope. */
    code?: string;
    /**
     * Structured data the refusal carried (e.g. `needsAccsCredentials`), so the
     * UI can branch on facts instead of matching message strings.
     */
    data?: unknown;
}

export interface DataInstallerRequest<T> {
    /**
     * True once ANY outcome has arrived (success or failure). Needed by callers
     * whose handler returns no data on success — `value` stays null there, so
     * "did it finish" and "did it fail" are otherwise indistinguishable from
     * "never ran".
     */
    settled: boolean;
    /** Send the request. Never rejects — a failure lands in `failure`. */
    load: (payload?: unknown) => void;
    /** True while a request is in flight. */
    loading: boolean;
    /** The handler's `data`, or null when the last attempt did not succeed. */
    value: T | null;
    /** The reason the last attempt did not succeed, or null. */
    failure: DataInstallerFailure | null;
}

/** Fallback wording for a refusal that arrived with no message of its own. */
const UNSTATED_FAILURE = 'The Data Installer request did not succeed.';

export function useDataInstallerRequest<T>(type: string): DataInstallerRequest<T> {
    const { execute, loading, error, data } = useVSCodeRequest<HandlerResponse>(type);

    const load = useCallback(
        (payload?: unknown): void => {
            // `execute` rethrows so callers can await it; nothing awaits it here,
            // and an unhandled rejection in a webview is a console error the user
            // sees instead of the state we already keep.
            void execute(payload).catch(() => undefined);
        },
        [execute],
    );

    const failure = useMemo((): DataInstallerFailure | null => {
        if (error) {
            return { message: error.message };
        }
        if (data && data.success === false) {
            return {
                message: data.error ?? UNSTATED_FAILURE,
                ...(typeof data.code === 'string' ? { code: data.code } : {}),
                ...(data.data !== undefined ? { data: data.data } : {}),
            };
        }
        return null;
    }, [error, data]);

    const value = useMemo(
        (): T | null => (data?.success ? ((data.data ?? null) as T | null) : null),
        [data],
    );

    return { load, loading, value, failure, settled: data !== null || error !== null };
}
