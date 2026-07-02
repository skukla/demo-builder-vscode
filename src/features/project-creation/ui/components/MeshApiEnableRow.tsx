/**
 * MeshApiEnableRow — the self-contained "API access" provisioning row for the mesh card.
 *
 * Rendered inside the {@link MeshIntegrationCard} destination (after a workspace
 * commits), it auto-runs the shipped, idempotent `ensure-mesh-api-subscribed`
 * request so the card's ✓ genuinely means "provisioned" and a subscribe/permission
 * failure surfaces here — at selection time — instead of deep in project creation.
 *
 * Behavior:
 *   - runs once per payload (a ref holds the last-issued composite key of all
 *     payload fields, so an unrelated rerender does not re-issue, while ANY payload
 *     change — org/project/workspace or a stack's backend/frontend — re-issues once);
 *   - a per-run cancellation token ignores a stale resolve after the payload
 *     changed, so the latest payload's status wins;
 *   - running → spinner "Enabling…"; success → ✓ "Enabled"; failure → ⚠ "Failed"
 *     plus a quiet "Retry". There is NO "Change" affordance in any state.
 *
 * Visual parity: mirrors the `.int-chosen` markup used by the card's ChosenRow.
 *
 * @module features/project-creation/ui/components/MeshApiEnableRow
 */

import { ActionButton, ProgressCircle } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/vscode-api';

/** Result shape returned by the `ensure-mesh-api-subscribed` handler. */
interface EnsureResult {
    success: boolean;
    error?: string;
    code?: string;
}

export interface MeshApiEnableRowProps {
    orgId?: string;
    projectId?: string;
    workspaceId?: string;
    backendId?: string;
    frontendId?: string;
    /** Row label; defaults to "API access". Lets a future integration card override it. */
    label?: string;
}

type EnableStatus = 'running' | 'enabled' | 'failed';

/** The value text shown for each status. */
function statusText(status: EnableStatus): string {
    if (status === 'enabled') return 'Enabled';
    if (status === 'failed') return 'Failed';
    return 'Checking…';
}

/** The leading status glyph/spinner (mirrors the ChosenRow check). */
function StatusIcon({ status, label }: { status: EnableStatus; label: string }): React.ReactElement {
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
}: MeshApiEnableRowProps): React.ReactElement | null {
    const [status, setStatus] = useState<EnableStatus>('running');
    const [error, setError] = useState<string | undefined>(undefined);

    // The composite payload key a request was last issued for (dedupes re-renders;
    // re-issues once whenever ANY payload field changes).
    const lastRunKey = useRef<string | undefined>(undefined);
    // The current run's cancellation token; a stale resolve checks its own token.
    const activeToken = useRef<{ cancelled: boolean } | null>(null);

    const run = useCallback((): void => {
        if (!workspaceId) return;
        if (activeToken.current) activeToken.current.cancelled = true;
        const token = { cancelled: false };
        activeToken.current = token;
        setStatus('running');
        setError(undefined);

        webviewClient
            .request<EnsureResult>('ensure-mesh-api-subscribed', {
                orgId,
                projectId,
                workspaceId,
                backendId,
                frontendId,
            })
            .then(result => {
                if (token.cancelled) return;
                if (result.success) {
                    setStatus('enabled');
                } else {
                    setStatus('failed');
                    setError(result.error);
                }
            })
            .catch((err: unknown) => {
                if (token.cancelled) return;
                setStatus('failed');
                setError(err instanceof Error ? err.message : String(err));
            });
    }, [orgId, projectId, workspaceId, backendId, frontendId]);

    useEffect(() => {
        if (!workspaceId) return undefined;
        const runKey = `${orgId}|${projectId}|${workspaceId}|${backendId}|${frontendId}`;
        if (lastRunKey.current === runKey) return undefined;
        lastRunKey.current = runKey;
        run();
        return () => {
            if (activeToken.current) activeToken.current.cancelled = true;
        };
    }, [orgId, projectId, workspaceId, backendId, frontendId, run]);

    const retry = useCallback((): void => {
        run();
    }, [run]);

    if (!workspaceId) return null;

    return (
        <div className="int-chosen">
            <StatusIcon status={status} label={label} />
            <span className="int-chosen-label">{label}</span>
            <span className="int-chosen-value">{statusText(status)}</span>
            {status === 'failed' && error && <span className="int-enable-error">{error}</span>}
            {status === 'failed' && (
                <ActionButton isQuiet onPress={retry}>
                    Retry
                </ActionButton>
            )}
        </div>
    );
}
