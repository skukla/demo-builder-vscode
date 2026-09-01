/**
 * ApiPickerStage — the INTERACTIVE api-access step for a custom/import app.
 *
 * Unlike mesh/catalog (deterministic, fixed APIs), a custom "Build custom" or
 * imported repo app can need ANY Adobe API the user is entitled to — and the user
 * often knows which up front (e.g. building Commerce ↔ Firefly Services, you need
 * the Firefly Services APIs). So this step fetches the org's subscribable services
 * (`list-org-console-apis`, entitlement-filtered, with the baseline + APIs other
 * integrations already cover flagged `locked`) and lets the user pick freely via
 * the shared {@link ApiAccessPicker}. Picks are recorded on the flow draft and
 * subscribed at the rebuild; nothing is forced (the baseline is always covered).
 *
 * @module features/project-creation/ui/components/integration-flow/stages/ApiPickerStage
 */

import React, { useCallback, useEffect, useState } from 'react';
import { renderApiCatalogFeedback } from '@/core/ui/components/feedback/ApiCatalogFeedback';
import { ApiAccessPicker, type ApiAccessOption } from '@/core/ui/components/selection/ApiAccessPicker';
import {
    useElapsedStage,
    ORG_SERVICES_LOADING_STAGES,
} from '@/core/ui/hooks/useElapsedStage';
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

export interface ApiPickerStageProps {
    /**
     * The integrations ALREADY in the project — their required APIs (+ the
     * baseline) come back flagged `locked` (already covered, not re-pickable).
     */
    componentIds: string[];
    /** The user's free picks so far (from the flow draft). */
    selected: string[];
    /** Toggle a free pick by code. */
    onToggle: (code: string) => void;
    /**
     * Start a user-initiated Adobe sign-in and resolve when it finishes.
     *
     * HOST-PROVIDED because this stage renders in both webviews and they register
     * DIFFERENT messages for it — the wizard `authenticate`, the dashboard
     * `reAuthenticate`. Hardcoding either breaks the other host. Omitted → the
     * signed-out view shows the reason with no action rather than a dead button.
     */
    onSignIn?: () => Promise<unknown>;
}

/** Stable empty default so an omitted `selected` never churns the picker. */
const NO_SELECTED: string[] = [];

const HELPER = 'Pick the Adobe APIs this app needs — change them anytime in Manage APIs.';

/**
 * The interactive API-access step for custom/import apps.
 *
 * @param props - the already-covered integration ids, current picks, and toggle
 * @returns the fetched picker (with loading/error states)
 */
export function ApiPickerStage({
    componentIds,
    selected = NO_SELECTED,
    onToggle,
    onSignIn,
}: ApiPickerStageProps): React.ReactElement {
    const [apis, setApis] = useState<ApiAccessOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | undefined>(undefined);
    /** Set when the failure is "not signed in" — a DIFFERENT view, not a retryable error. */
    const [needsSignIn, setNeedsSignIn] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    const loadingStage = useElapsedStage(loading, ORG_SERVICES_LOADING_STAGES);

    /** Re-fire the list (from the error view's Retry). */
    const retry = useCallback(() => setReloadKey((key) => key + 1), []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(undefined);
        setNeedsSignIn(false);
        webviewClient
            .request<ListOrgApisResponse>('list-org-console-apis', { componentIds })
            .then((res) => {
                if (cancelled) return;
                if (res.success && res.data) {
                    setApis(res.data.apis);
                } else {
                    setNeedsSignIn(res.code === ErrorCode.AUTH_REQUIRED);
                    setError(res.error ?? 'Could not list Adobe APIs.');
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : String(err));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [componentIds, reloadKey]);

    // The three non-picker views are shared with the Manage APIs modal
    // (renderApiCatalogFeedback) — same fetch, same states. Only the wrapper differs:
    // this band is full-bleed and carries the stage's test id.
    const feedback = renderApiCatalogFeedback({
        loading,
        loadingStage,
        needsSignIn,
        error,
        onSignIn,
        onRetry: retry,
        signInPurpose: 'choose the APIs this app needs',
    });
    if (feedback) {
        return (
            <div className="intflow-api-center" data-testid="api-picker-stage">
                {feedback}
            </div>
        );
    }

    // The interactive picker (filter, category chips, API list) uses the full modal
    // width — the extra room lets more chips and the list breathe.
    return (
        <div className="intflow-api-info intflow-api-info--full" data-testid="api-picker-stage">
            <ApiAccessPicker
                apis={apis}
                selected={selected}
                onToggle={onToggle}
                helperText={HELPER}
            />
        </div>
    );
}
