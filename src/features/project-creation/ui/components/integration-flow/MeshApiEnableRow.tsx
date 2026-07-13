/**
 * MeshApiEnableRow — the "API access" status row on the mesh {@link IntegrationResultRow}.
 *
 * The provisioning ITSELF now runs in the Add Integration modal on Add (see
 * useIntegrationFlow — a complete "add + enable" action). This row ADOPTS that
 * outcome via `initialResult` (shows the finished ✓ without re-running). It only
 * auto-runs the idempotent `ensure-mesh-api-subscribed` request as a fallback —
 * a mesh that never walked the modal (e.g. an existing mesh loaded in Edit) — so
 * the ✓ genuinely means "provisioned". `onResult`/`onRunningChange` remain for a
 * consumer that wants to observe an auto-run.
 *
 * Behavior:
 *   - runs once per payload (a ref holds the last-issued composite key of all
 *     payload fields, so an unrelated rerender does not re-issue, while ANY payload
 *     change — org/project/workspace or a stack's backend/frontend — re-issues once);
 *   - a per-run cancellation token ignores a stale resolve after the payload
 *     changed, so the latest payload's status wins;
 *   - running → spinner "Checking…"; success → ✓ the subscribed API names joined
 *     with " · " (falling back to "Enabled" when the handler sends no list);
 *     failure → ⚠ "Failed" plus a quiet "Retry". There is NO "Change" affordance
 *     in any state;
 *   - an optional `initialResult` (a parent flow already ran the subscribe) is
 *     adopted once instead of auto-running — no duplicate request; Retry and any
 *     later run-key change issue real requests.
 *
 * Visual parity: shares the `.int-chosen` row markup used across the module.
 *
 * @module features/project-creation/ui/components/integration-flow/MeshApiEnableRow
 */

import { ActionButton, ProgressCircle } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/vscode-api';

/** A subscribed API as reported by the handler (code + display name when known). */
interface SubscribedApi {
    code: string;
    name?: string;
}

/** Result shape returned by the `ensure-mesh-api-subscribed` handler. */
export interface EnsureResult {
    success: boolean;
    error?: string;
    code?: string;
    /** On success: the resolved+subscribed APIs. */
    data?: { apis: SubscribedApi[] };
}

export interface MeshApiEnableRowProps {
    orgId?: string;
    projectId?: string;
    workspaceId?: string;
    backendId?: string;
    frontendId?: string;
    /** Row label; defaults to "API access". Lets a future integration card override it. */
    label?: string;
    /**
     * A pre-resolved result from a parent flow that already ran the subscribe.
     * Adopted once (for the run-key current when it is consumed) instead of
     * auto-running — prevents a duplicate subscribe. A later run-key change
     * auto-runs normally; Retry always issues a real request.
     */
    initialResult?: EnsureResult;
    /**
     * Reports every applied result — a run's resolution (including a rejected
     * request, synthesized as `{success: false, error}`) or an adopted
     * initialResult. Lets the Add Integration modal capture the outcome and
     * hand it to the result row as `initialResult`.
     */
    onResult?: (result: EnsureResult) => void;
    /**
     * Reports run-in-flight transitions: true when a request is issued, false
     * when a result is applied. Wired to the flow's phaseRunning so the modal
     * footer waits for the enable to settle (success OR failure).
     */
    onRunningChange?: (running: boolean) => void;
}

type EnableStatus = 'running' | 'enabled' | 'failed';

/** The value text shown for each status; enabled lists the API names when known. */
function statusText(status: EnableStatus, apis?: SubscribedApi[]): string {
    if (status === 'enabled') {
        if (apis && apis.length > 0) {
            return apis.map((api) => api.name ?? api.code).join(' · ');
        }
        return 'Enabled';
    }
    if (status === 'failed') return 'Failed';
    // "Enabling…" not "Checking…": the run actually provisions (credential +
    // subscription), it isn't a quick status read.
    return 'Enabling…';
}

/** The leading status glyph/spinner (mirrors the ChosenRow check). */
function StatusIcon({
    status,
    label,
}: {
    status: EnableStatus;
    label: string;
}): React.ReactElement {
    if (status === 'enabled') {
        return (
            <span className="int-chosen-check" aria-hidden="true">
                ✓
            </span>
        );
    }
    if (status === 'failed') {
        return (
            <span className="int-chosen-warn" aria-hidden="true">
                ⚠
            </span>
        );
    }
    return <ProgressCircle size="S" isIndeterminate aria-label={`Checking ${label}`} />;
}

/**
 * The auto-running API-access enablement row.
 *
 * @param props - the Adobe destination ids + the selected stack's backend/frontend
 * @returns the status row, or null when there is no committed workspace
 */
export function MeshApiEnableRow({
    orgId,
    projectId,
    workspaceId,
    backendId,
    frontendId,
    label = 'API access',
    initialResult,
    onResult,
    onRunningChange,
}: MeshApiEnableRowProps): React.ReactElement | null {
    const [status, setStatus] = useState<EnableStatus>('running');
    const [error, setError] = useState<string | undefined>(undefined);
    const [apis, setApis] = useState<SubscribedApi[] | undefined>(undefined);

    // Callback refs keep `run`/`applyResult` stable even when a parent passes
    // inline callbacks (an identity change must not re-issue the request).
    const onResultRef = useRef(onResult);
    onResultRef.current = onResult;
    const onRunningChangeRef = useRef(onRunningChange);
    onRunningChangeRef.current = onRunningChange;

    // The composite payload key a request was last issued for (dedupes re-renders;
    // re-issues once whenever ANY payload field changes).
    const lastRunKey = useRef<string | undefined>(undefined);
    // The current run's cancellation token; a stale resolve checks its own token.
    const activeToken = useRef<{ cancelled: boolean } | null>(null);
    // Whether a request is currently in flight — the unmount cleanup must
    // release the parent's phaseRunning gate (Back mid-enable would otherwise
    // strand it true and deadlock later stages' Continue).
    const inFlight = useRef(false);
    // Whether a provided initialResult was already adopted (adopt at most once).
    const initialResultConsumed = useRef(false);

    const applyResult = useCallback((result: EnsureResult): void => {
        inFlight.current = false;
        if (result.success) {
            setStatus('enabled');
            setApis(result.data?.apis);
        } else {
            setStatus('failed');
            setError(result.error);
        }
        onResultRef.current?.(result);
        onRunningChangeRef.current?.(false);
    }, []);

    const run = useCallback((): void => {
        if (!workspaceId) return;
        if (activeToken.current) activeToken.current.cancelled = true;
        const token = { cancelled: false };
        activeToken.current = token;
        setStatus('running');
        setError(undefined);
        setApis(undefined);
        inFlight.current = true;
        onRunningChangeRef.current?.(true);

        webviewClient
            .request<EnsureResult>('ensure-mesh-api-subscribed', {
                orgId,
                projectId,
                workspaceId,
                backendId,
                frontendId,
            })
            .then((result) => {
                if (token.cancelled) return;
                applyResult(result);
            })
            .catch((err: unknown) => {
                if (token.cancelled) return;
                applyResult({
                    success: false,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
    }, [orgId, projectId, workspaceId, backendId, frontendId, applyResult]);

    useEffect(() => {
        if (!workspaceId) return undefined;
        const runKey = `${orgId}|${projectId}|${workspaceId}|${backendId}|${frontendId}`;
        if (lastRunKey.current === runKey) return undefined;
        lastRunKey.current = runKey;
        if (initialResult && !initialResultConsumed.current) {
            // A parent flow already ran the subscribe — adopt its result once
            // instead of issuing a duplicate request.
            initialResultConsumed.current = true;
            applyResult(initialResult);
            return undefined;
        }
        run();
        return () => {
            if (activeToken.current) activeToken.current.cancelled = true;
            // Unmounting (or re-keying) mid-flight: the cancelled resolve will
            // never call applyResult, so release the running gate here.
            if (inFlight.current) {
                inFlight.current = false;
                onRunningChangeRef.current?.(false);
            }
        };
    }, [orgId, projectId, workspaceId, backendId, frontendId, initialResult, applyResult, run]);

    const retry = useCallback((): void => {
        run();
    }, [run]);

    if (!workspaceId) return null;

    const isFailed = status === 'failed';
    return (
        <>
            <div className="int-chosen">
                <StatusIcon status={status} label={label} />
                <span className="int-chosen-label">{label}</span>
                <span className="int-chosen-value int-chosen-value--apis">
                    {statusText(status, apis)}
                </span>
                {isFailed && (
                    <ActionButton isQuiet onPress={retry}>
                        Retry
                    </ActionButton>
                )}
            </div>
            {isFailed && error && <div className="int-enable-error">{error}</div>}
        </>
    );
}
