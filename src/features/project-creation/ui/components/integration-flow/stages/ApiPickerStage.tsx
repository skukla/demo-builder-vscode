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
import { LoadingDisplay, StatusDisplay } from '@/core/ui/components/feedback';
import { ApiAccessPicker, type ApiAccessOption } from '@/core/ui/components/selection';
import { webviewClient } from '@/core/ui/utils/vscode-api';

/** The `list-org-console-apis` handler response (rows are already picker-shaped). */
interface ListOrgApisResponse {
    success: boolean;
    error?: string;
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
}: ApiPickerStageProps): React.ReactElement {
    const [apis, setApis] = useState<ApiAccessOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | undefined>(undefined);
    const [reloadKey, setReloadKey] = useState(0);

    /** Re-fire the list (from the error view's Retry). */
    const retry = useCallback(() => setReloadKey((key) => key + 1), []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(undefined);
        webviewClient
            .request<ListOrgApisResponse>('list-org-console-apis', { componentIds })
            .then((res) => {
                if (cancelled) return;
                if (res.success && res.data) setApis(res.data.apis);
                else setError(res.error ?? 'Could not list Adobe APIs.');
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

    // Loading and error fill the reserved stage body and center on both axes —
    // full width, not the left-aligned .intflow-api-info content band (a retryable
    // failure, not dead-end red text). The picker/summary keep that top-aligned band.
    if (loading) {
        return (
            <div className="intflow-api-center" data-testid="api-picker-stage">
                <LoadingDisplay size="L" message="Loading Adobe APIs…" />
            </div>
        );
    }
    if (error) {
        return (
            <div className="intflow-api-center" data-testid="api-picker-stage">
                <StatusDisplay
                    variant="error"
                    height="100%"
                    title="Couldn't load Adobe APIs"
                    message={error}
                    actions={[{ label: 'Retry', variant: 'accent', onPress: retry }]}
                />
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
