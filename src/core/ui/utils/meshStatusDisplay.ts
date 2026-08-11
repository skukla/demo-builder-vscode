/**
 * Mesh Status Display
 *
 * The persisted-mesh-vocabulary view of {@link statusVocabulary}, which is the
 * one table. This module no longer holds a table of its own — it adapts the
 * shared entry into the `{ text, color, variant }` shape its two callers want:
 * the projects-list card (`projectStatusUtils`) and the dashboard header badge
 * (`useDashboardStatus`).
 *
 * Aliases collapse in `normalizeDisplayStatus`, not here: `config-changed` was a
 * runtime-only spelling of `stale` that round-tripped back to `stale`, and
 * `update-declined` reads identically to `stale` now that the labels are shared.
 */

import {
    getStatusDisplay,
    severityToColor,
    severityToVariant,
    type StatusColor,
    type StatusVariant,
} from './statusVocabulary';

export type MeshStatusColor = StatusColor;

export type MeshStatusVariant = StatusVariant;

export interface MeshStatusDisplay {
    text: string;
    color: MeshStatusColor;
    variant: MeshStatusVariant;
}

/**
 * Get mesh status display for a given status key.
 * Returns null for unknown/undefined statuses (mesh section should be hidden).
 */
export function getMeshStatusDisplay(status: string | undefined): MeshStatusDisplay | null {
    const entry = getStatusDisplay(status);
    if (!entry) return null;

    return {
        text: entry.label,
        color: severityToColor(entry.severity),
        variant: severityToVariant(entry.severity),
    };
}
