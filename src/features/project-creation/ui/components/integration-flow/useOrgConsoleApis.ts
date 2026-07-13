/**
 * useOrgConsoleApis — journey-level PREFETCH of the org's console APIs.
 *
 * Fires `list-org-console-apis` the moment `componentIds` become defined — the
 * integration pick is known (mesh: at the kind pick; catalog: at the entry
 * pick; custom: at a valid URL) — instead of when the api-access stage mounts.
 * By the time the user walks the destination stages and reaches the API stage,
 * the list is usually READY, so the stage shows at most one spinner (the mesh
 * enable's) and the fetch is never issued concurrently with — and never
 * starved behind — the enable's 180s Adobe-session budget.
 *
 * Refetches when the id KEY changes (a different pick after Back); a plain
 * rerender never refetches; a stale resolve after a key change is dropped.
 *
 * @module features/project-creation/ui/components/integration-flow/useOrgConsoleApis
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiAccessOption } from '@/core/ui/components/selection';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { webviewClient } from '@/core/ui/utils/vscode-api';

/** The `list-org-console-apis` handler response envelope. */
interface ListApisResult {
    success: boolean;
    data?: { apis: ApiAccessOption[] };
    error?: string;
}

export type OrgConsoleApisStatus = 'loading' | 'error' | 'ready';

export interface OrgConsoleApisState {
    status: OrgConsoleApisStatus;
    apis: ApiAccessOption[];
    error?: string;
    retry: () => void;
}

/**
 * Prefetch the org's subscribable APIs for the given integration ids.
 *
 * @param componentIds - the pick-first id list, or undefined while no pick
 *   exists yet (nothing is fetched; status stays 'loading')
 * @returns fetch status, the API rows, the error message, and a retry
 */
export function useOrgConsoleApis(componentIds: string[] | undefined): OrgConsoleApisState {
    const [status, setStatus] = useState<OrgConsoleApisStatus>('loading');
    const [apis, setApis] = useState<ApiAccessOption[]>([]);
    const [error, setError] = useState<string | undefined>(undefined);

    // The latest ids, read at request time (retry uses the current pick).
    const idsRef = useRef(componentIds);
    idsRef.current = componentIds;
    // The id key a fetch was last issued for (dedupes rerenders, refetches on change).
    const lastKey = useRef<string | undefined>(undefined);
    // Per-fetch cancellation token: a stale resolve after a key change is dropped.
    const activeToken = useRef<{ cancelled: boolean } | null>(null);

    const fetchApis = useCallback((): void => {
        const ids = idsRef.current;
        if (!ids) return;
        if (activeToken.current) activeToken.current.cancelled = true;
        const token = { cancelled: false };
        activeToken.current = token;
        setStatus('loading');
        setError(undefined);
        webviewClient
            .request<ListApisResult>(
                'list-org-console-apis',
                { componentIds: ids },
                FRONTEND_TIMEOUTS.ORG_APIS_REQUEST_TIMEOUT,
            )
            .then((result) => {
                if (token.cancelled) return;
                if (result.success && result.data) {
                    setApis(result.data.apis);
                    setStatus('ready');
                } else {
                    setError(result.error ?? 'Could not load Adobe APIs.');
                    setStatus('error');
                }
            })
            .catch((err: unknown) => {
                if (token.cancelled) return;
                setError(err instanceof Error ? err.message : String(err));
                setStatus('error');
            });
    }, []);

    useEffect(() => {
        if (!componentIds) return;
        const key = componentIds.join('|');
        if (lastKey.current === key) return;
        lastKey.current = key;
        fetchApis();
    }, [componentIds, fetchApis]);

    return { status, apis, error, retry: fetchApis };
}
