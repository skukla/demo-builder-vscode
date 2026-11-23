/**
 * useOrgApis — reads the org's subscribable Adobe APIs (`list-org-console-apis`, entitlement
 * filtered, with the baseline + APIs other integrations already cover flagged `locked`) while the
 * Add Integration flow is on its api-access stage.
 *
 * It sits above the stage because the dialog itself answers for the read: its wait, and the
 * title and buttons of a failed read (`apiAccessProblem`). It reads again each time the stage is
 * entered, and a response to a question no longer asked is dropped.
 *
 * @module features/project-creation/ui/components/integration-flow/useOrgApis
 */

import { useCallback, useEffect, useState } from 'react';
import type { ApiAccessOption } from '@/core/ui/components/selection/ApiAccessPicker';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import { ErrorCode } from '@/types/errorCodes';

/** The `list-org-console-apis` handler response (rows are already picker-shaped). */
interface ListOrgApisResponse {
    success: boolean;
    error?: string;
    /** AUTH_REQUIRED distinguishes "signed out" from a retryable failure. */
    code?: ErrorCode;
    data?: { apis: ApiAccessOption[] };
}

interface OrgApisRead {
    apis: ApiAccessOption[];
    loading: boolean;
    error?: string;
    /** The failure is "not signed in": a sign-in, never a Retry. */
    needsSignIn: boolean;
}

export interface OrgApis extends OrgApisRead {
    /** Read the list again. */
    retry: () => void;
}

const NO_APIS: ApiAccessOption[] = [];
// Starts loading, and goes back to it on leaving the stage, so entering the stage never draws
// one frame of an empty list before the read starts.
const LOADING: OrgApisRead = { apis: NO_APIS, loading: true, needsSignIn: false };

function readFailed(error: string, needsSignIn = false): OrgApisRead {
    return { apis: NO_APIS, loading: false, error, needsSignIn };
}

/**
 * @param active - whether the flow is on the api-access stage; nothing is read otherwise
 * @param componentIds - the integrations already in the project, whose APIs come back locked
 * @returns the list, how the read stands, and a way to read it again
 */
export function useOrgApis(active: boolean, componentIds: string[]): OrgApis {
    const [read, setRead] = useState<OrgApisRead>(LOADING);
    const [reloadKey, setReloadKey] = useState(0);
    const retry = useCallback(() => setReloadKey((key) => key + 1), []);

    useEffect(() => {
        if (!active) return undefined;
        let cancelled = false;
        setRead(LOADING);
        webviewClient
            .request<ListOrgApisResponse>('list-org-console-apis', { componentIds })
            .then((res) => {
                if (cancelled) return;
                setRead(
                    res.success && res.data
                        ? { apis: res.data.apis, loading: false, needsSignIn: false }
                        : readFailed(res.error ?? 'Could not list Adobe APIs.', res.code === ErrorCode.AUTH_REQUIRED),
                );
            })
            .catch((err: unknown) => {
                if (!cancelled) setRead(readFailed(err instanceof Error ? err.message : String(err)));
            });
        return () => {
            cancelled = true;
            setRead(LOADING);
        };
    }, [active, componentIds, reloadKey]);

    return { ...read, retry };
}
