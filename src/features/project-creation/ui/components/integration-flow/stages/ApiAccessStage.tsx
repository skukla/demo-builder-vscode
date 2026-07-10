/**
 * ApiAccessStage — the API-access stage of the Add Integration flow.
 *
 * Wires the shared {@link ApiAccessPicker} into the wizard: on mount it fetches the
 * org's subscribable Adobe services ONCE via the wizard-scoped
 * `list-org-console-apis` handler (`{ componentIds }` → each service flagged
 * `locked` when the reconcile union already covers it), then renders:
 *   - a COMPACT loading row while the request is in flight (never a tall centered band);
 *   - an inline error + Retry on failure (Retry refetches);
 *   - the grouped picker on success, with guidance copy explaining that picks grant
 *     the app's actions access to those Adobe APIs — and that APIs can also be added
 *     LATER from the dashboard (Manage APIs) or by asking the AI, so skipping is safe.
 *
 * This stage NEVER blocks the flow's Continue (no canProceed wiring): locked APIs
 * are subscribed by the union regardless, and free picks are always optional.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/ApiAccessStage
 */

import { ActionButton } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { ApiAccessPicker, type ApiAccessOption } from '@/core/ui/components/selection';
import { webviewClient } from '@/core/ui/utils/vscode-api';

/** The picker's guidance line — including the add-later escape hatch. */
const API_ACCESS_HELPER =
    'Your picks grant this app’s actions access to those Adobe APIs — you can also ' +
    'add APIs later from the dashboard (Manage APIs) or by asking the AI.';

/** The `list-org-console-apis` handler response envelope. */
interface ListApisResult {
    success: boolean;
    data?: { apis: ApiAccessOption[] };
    error?: string;
}

type FetchStatus = 'loading' | 'error' | 'ready';

export interface ApiAccessStageProps {
    /** Selected integration ids — the handler derives the locked set from them. */
    componentIds: string[];
    /** Curated suggestion codes (catalog `suggestedApis`) for the picked entry. */
    suggested?: string[];
    /** The user's free picks for THIS integration (draft-local). */
    selected: string[];
    /** Toggle a free pick by code. */
    onToggle: (code: string) => void;
}

/**
 * The fetch-once API-access stage body.
 *
 * @param props - selected integration ids, curated suggestions, picks + toggle
 * @returns loading row, inline error + Retry, or the grouped picker
 */
export function ApiAccessStage({
    componentIds,
    suggested,
    selected,
    onToggle,
}: ApiAccessStageProps): React.ReactElement {
    const [status, setStatus] = useState<FetchStatus>('loading');
    const [apis, setApis] = useState<ApiAccessOption[]>([]);
    const [error, setError] = useState<string | undefined>(undefined);

    // The latest ids, read at request time — a rerender must not refetch.
    const idsRef = useRef(componentIds);
    idsRef.current = componentIds;
    const fetchedOnce = useRef(false);

    const fetchApis = useCallback((): void => {
        setStatus('loading');
        setError(undefined);
        webviewClient
            .request<ListApisResult>('list-org-console-apis', {
                componentIds: idsRef.current,
            })
            .then((result) => {
                if (result.success && result.data) {
                    setApis(result.data.apis);
                    setStatus('ready');
                } else {
                    setError(result.error ?? 'Could not load Adobe APIs.');
                    setStatus('error');
                }
            })
            .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : String(err));
                setStatus('error');
            });
    }, []);

    useEffect(() => {
        if (fetchedOnce.current) return;
        fetchedOnce.current = true;
        fetchApis();
    }, [fetchApis]);

    if (status === 'loading') {
        return (
            <div className="intflow-api-stage" data-testid="api-access-stage">
                <LoadingDisplay size="M" message="Loading Adobe APIs…" />
            </div>
        );
    }
    if (status === 'error') {
        return (
            <div className="intflow-api-stage" data-testid="api-access-stage">
                <div className="intflow-api-error" role="alert">
                    <span className="intflow-api-error-message">{error}</span>
                    <ActionButton isQuiet onPress={fetchApis}>
                        Retry
                    </ActionButton>
                </div>
            </div>
        );
    }
    return (
        <div className="intflow-api-stage" data-testid="api-access-stage">
            <ApiAccessPicker
                apis={apis}
                suggested={suggested}
                selected={selected}
                onToggle={onToggle}
                helperText={API_ACCESS_HELPER}
            />
        </div>
    );
}
