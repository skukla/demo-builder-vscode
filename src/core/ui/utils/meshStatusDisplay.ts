/**
 * Mesh Status Display
 *
 * Shared display text and color mappings for mesh status.
 * Used by both the card grid (projects-dashboard) and the project dashboard.
 *
 * The status key is the persisted `meshStatusSummary` value.
 * The dashboard translates its own status values before lookup
 * (e.g., 'config-changed' → 'stale').
 */

export type MeshStatusColor = 'green' | 'yellow' | 'orange' | 'red' | 'gray';

export type MeshStatusVariant = 'success' | 'warning' | 'error' | 'neutral';

export interface MeshStatusDisplay {
    text: string;
    color: MeshStatusColor;
    variant: MeshStatusVariant;
}

/**
 * Display mapping for persisted meshStatusSummary values.
 *
 * BARE STATE NAMES (2026-08-04), matching `INTEGRATION_STATUS_DISPLAY` word for
 * word — the two card kinds sit side by side in one grid. Callers add their own
 * context: the grid's mesh card is already headed "API Mesh", while the
 * projects-list card is headed with the project name and composes `Mesh · <state>`
 * itself (`projectStatusUtils.getMeshStatusText`).
 *
 * Descriptive, not imperative: "Redeploy Mesh" commanded a button this card no
 * longer has, and read identically to the kebab item of that name (which stays
 * imperative — it IS a button, and `configure.ts` compares the literal).
 *
 * Transient dashboard-only states (checking, needs-auth, authenticating,
 * deploying) are handled separately in useDashboardStatus.
 */
const MESH_STATUS_DISPLAY: Record<string, MeshStatusDisplay> = {
    deployed: { text: 'Deployed', color: 'green', variant: 'success' },
    stale: { text: 'Update available', color: 'yellow', variant: 'warning' },
    'config-incomplete': { text: 'Incomplete', color: 'orange', variant: 'warning' },
    'update-declined': { text: 'Update available', color: 'orange', variant: 'warning' },
    error: { text: 'Deploy failed', color: 'red', variant: 'error' },
    'not-deployed': { text: 'Not deployed', color: 'gray', variant: 'neutral' },
};

/**
 * Get mesh status display for a given status key.
 * Returns null for unknown/undefined statuses (mesh section should be hidden).
 */
export function getMeshStatusDisplay(status: string | undefined): MeshStatusDisplay | null {
    if (!status) return null;
    return MESH_STATUS_DISPLAY[status] ?? null;
}
