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
 * Transient dashboard-only states (checking, needs-auth, authenticating,
 * deploying) are handled separately in useDashboardStatus.
 */
const MESH_STATUS_DISPLAY: Record<string, MeshStatusDisplay> = {
    deployed:            { text: 'Mesh Deployed',   color: 'green',  variant: 'success' },
    stale:               { text: 'Redeploy Mesh',   color: 'yellow', variant: 'warning' },
    'config-incomplete': { text: 'Mesh Incomplete',  color: 'orange', variant: 'warning' },
    'update-declined':   { text: 'Redeploy Mesh',   color: 'orange', variant: 'warning' },
    error:               { text: 'Mesh Error',       color: 'red',    variant: 'error' },
    'not-deployed':      { text: 'Not Deployed',     color: 'gray',   variant: 'neutral' },
};

/**
 * Get mesh status display for a given status key.
 * Returns null for unknown/undefined statuses (mesh section should be hidden).
 */
export function getMeshStatusDisplay(status: string | undefined): MeshStatusDisplay | null {
    if (!status) return null;
    return MESH_STATUS_DISPLAY[status] ?? null;
}
