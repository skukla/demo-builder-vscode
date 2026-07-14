/**
 * App Builder App Status Display
 *
 * Shared display text and color mappings for the App Builder app status, the
 * sibling of {@link import('./meshStatusDisplay').getMeshStatusDisplay}. Used by
 * the projects card grid to surface an app status dot beside the mesh one.
 *
 * The status key is the persisted `appStatusSummary` value.
 */

import type { MeshStatusColor, MeshStatusDisplay, MeshStatusVariant } from './meshStatusDisplay';

export type AppStatusColor = MeshStatusColor;
export type AppStatusVariant = MeshStatusVariant;
export type AppStatusDisplay = MeshStatusDisplay;

/**
 * Display mapping for persisted `appStatusSummary` values. `stale` is included for
 * parity with the mesh model, though no app-staleness detector sets it today.
 */
const APP_STATUS_DISPLAY: Record<string, AppStatusDisplay> = {
    deployed: { text: 'App Deployed', color: 'green', variant: 'success' },
    stale: { text: 'Redeploy App', color: 'yellow', variant: 'warning' },
    error: { text: 'App Error', color: 'red', variant: 'error' },
    'not-deployed': { text: 'Not Deployed', color: 'gray', variant: 'neutral' },
};

/**
 * Get the app status display for a given status key.
 * Returns null for unknown/undefined statuses (app section should be hidden).
 */
export function getAppStatusDisplay(status: string | undefined): AppStatusDisplay | null {
    if (!status) return null;
    return APP_STATUS_DISPLAY[status] ?? null;
}
