/**
 * MeshApiEnableRow — the "API access" confirmation line on the mesh
 * {@link IntegrationResultRow}.
 *
 * PURELY VISUAL. The enable is owned entirely by the Add Integration modal (which
 * only commits a mesh on a SUCCESSFUL enable) and is re-subscribed idempotently at
 * deploy — so a committed mesh's APIs are always enabled. This row therefore NEVER
 * triggers a subscribe; it just shows ✓ "API access enabled" once a destination is
 * committed.
 *
 * (It used to auto-run a fallback subscribe when it had no pre-resolved result.
 * That re-fired every time the step re-mounted — e.g. Continue to the summary then
 * Back to the integrations list — "re-enabling" on a step that is only meant to
 * display state. Removed.)
 *
 * @module features/project-creation/ui/components/integration-flow/MeshApiEnableRow
 */

import React from 'react';

/** A subscribed API as reported by the `ensure-mesh-api-subscribed` handler. */
interface SubscribedApi {
    code: string;
    name?: string;
}

/**
 * Result shape returned by the `ensure-mesh-api-subscribed` handler. The enable is
 * run and consumed by the Add modal / creation flow; this type is the shared
 * contract for that result (the visual row no longer reads it).
 */
export interface EnsureResult {
    success: boolean;
    error?: string;
    code?: string;
    /** On success: the resolved+subscribed APIs. */
    data?: { apis: SubscribedApi[] };
}

export interface MeshApiEnableRowProps {
    /** Committed workspace id — the line shows only once a destination is set. */
    workspaceId?: string;
    /** Row label; defaults to "API access". Lets a future integration card override it. */
    label?: string;
}

/**
 * The mesh row's API-access confirmation line (a quiet ✓, no request).
 *
 * @param props - the committed workspace id (gate) and the row label
 * @returns the ✓ status line, or null when there is no committed workspace
 */
export function MeshApiEnableRow({
    workspaceId,
    label = 'API access',
}: MeshApiEnableRowProps): React.ReactElement | null {
    if (!workspaceId) return null;
    return (
        <div className="int-enable-status">
            <span className="int-chosen-check" aria-hidden="true">
                ✓
            </span>
            <span className="int-enable-status-text">{`${label} enabled`}</span>
        </div>
    );
}
