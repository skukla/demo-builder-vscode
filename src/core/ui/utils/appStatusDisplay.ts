/**
 * Integration Status Display
 *
 * The DOT VARIANT for a project card's integrations line — its text lives with
 * the counts in `projectStatusUtils.getAppStatusText`, because the line names how
 * many integrations are in the state ("1 of 2 integrations failed") and a
 * status→string map cannot count.
 *
 * Sibling of {@link import('./meshStatusDisplay').getMeshStatusDisplay}, which
 * still owns its own text — a project has exactly one mesh, so there is nothing
 * to count there.
 */

import type { MeshStatusColor, MeshStatusDisplay, MeshStatusVariant } from './meshStatusDisplay';

export type AppStatusColor = MeshStatusColor;
export type AppStatusVariant = MeshStatusVariant;
export type AppStatusDisplay = Pick<MeshStatusDisplay, 'color' | 'variant'>;

/**
 * Colour mapping per worst-integration status. `stale` is included for parity
 * with the mesh model, though no staleness detector sets it on an integration yet.
 */
const APP_STATUS_DISPLAY: Record<string, AppStatusDisplay> = {
    deployed: { color: 'green', variant: 'success' },
    stale: { color: 'yellow', variant: 'warning' },
    error: { color: 'red', variant: 'error' },
    'not-deployed': { color: 'gray', variant: 'neutral' },
};

/**
 * Get the app status display for a given status key.
 * Returns null for unknown/undefined statuses (app section should be hidden).
 */
export function getAppStatusDisplay(status: string | undefined): AppStatusDisplay | null {
    if (!status) return null;
    return APP_STATUS_DISPLAY[status] ?? null;
}
