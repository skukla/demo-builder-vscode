/**
 * IntegrationsSummaryTile — the dashboard's whole integrations footprint.
 *
 * The card grid moved to its own surface (integrations-surface plan), so the
 * dashboard keeps only this: the WORST status across every card, opening the
 * surface on press. That is what keeps integrations legible at a glance despite
 * being one click away, and it means the dashboard no longer grows with
 * integration count.
 *
 * There is deliberately NO count. It answered a question nobody asks from the
 * dashboard — "how many?" is idle trivia next to "is anything broken?" — while
 * adding a second number to a tile row whose neighbours carry none.
 *
 * Supersedes IntegrationsBlock, which hosted the grid inline.
 *
 * @module features/dashboard/ui/components/IntegrationsSummaryTile
 */

import { ActionButton, Text } from '@adobe/react-spectrum';
import Data from '@spectrum-icons/workflow/Data';
import React from 'react';
import type { MeshStatus } from '../hooks/useDashboardStatus';
import { toMeshCardStatus } from './integrations/integrationCardModel';
import type { StatusDotVariant } from '@/core/ui/components/ui/StatusDot';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AppBuilderComponentState } from '@/types/base';

export interface IntegrationsSummaryTileProps {
    /** Render gate: integrations need an Adobe workspace to deploy into. */
    hasAdobeContext?: boolean;
    /** Keyed persisted component map. */
    appBuilderComponents?: Record<string, AppBuilderComponentState>;
    /** Whether the project has a mesh — it counts as a peer card on the surface. */
    hasMesh?: boolean;
    /**
     * Live mesh status. The mesh is a peer card on the surface, so its health
     * has to reach this dot too — otherwise a broken mesh is invisible on the
     * dashboard, which is exactly what the tile exists to prevent.
     */
    meshStatus?: MeshStatus;
}

/**
 * Worst-status precedence, most alarming first. The tile shows one dot, so a
 * single failing integration must not be hidden behind four healthy ones.
 */
const SEVERITY: Array<{ status: string; variant: StatusDotVariant }> = [
    { status: 'error', variant: 'error' },
    { status: 'stale', variant: 'warning' },
    { status: 'deploying', variant: 'info' },
    { status: 'not-deployed', variant: 'neutral' },
    { status: 'deployed', variant: 'success' },
];

/** The most alarming status present, or success when there is nothing to report. */
export function worstStatusVariant(statuses: string[]): StatusDotVariant {
    const match = SEVERITY.find((entry) => statuses.includes(entry.status));
    return match?.variant ?? 'success';
}

export function IntegrationsSummaryTile({
    hasAdobeContext,
    appBuilderComponents,
    hasMesh,
    meshStatus,
}: IntegrationsSummaryTileProps): React.ReactElement | null {
    if (!hasAdobeContext) {
        return null;
    }

    // Integrations only — a `kind: 'mesh'` entry in the keyed map is the mesh's
    // persisted record, not an integration; the mesh counts via `hasMesh`.
    const integrations = Object.values(appBuilderComponents ?? {}).filter(
        (entry) => entry.kind === 'integration',
    );
    // The mesh folds in through the SAME mapping the mesh card uses, so the dot
    // can never disagree with the card the surface shows. 'checking' is not a
    // health signal, so it is excluded rather than reported as neutral.
    const meshCardStatus = hasMesh ? toMeshCardStatus(meshStatus) : undefined;
    const reportable = [
        ...integrations.map((entry) => entry.status),
        ...(meshCardStatus && meshCardStatus !== 'checking' ? [meshCardStatus] : []),
    ];
    // The dot reports HEALTH, so with nothing deployed there is nothing to report
    // and the tile carries no dot at all. worstStatusVariant falls back to
    // 'success' on an empty list, which painted an empty project green — "all
    // good" about nothing. The tile still renders: it is the way in to add the
    // first integration.
    const variant = reportable.length > 0 ? worstStatusVariant(reportable) : undefined;

    // Shaped like its build-zone neighbours (icon above label) so the row reads
    // as one bar; the dot rides the icon as a small overlay rather than widening
    // the tile, which is what made it wrap onto its own line before.
    return (
        <ActionButton
            isQuiet
            UNSAFE_className="dashboard-action-button integrations-tile"
            data-action="integrations"
            onPress={() => webviewClient.postMessage('openIntegrations')}
        >
            <Data size="L" />
            <Text UNSAFE_className="icon-label">Integrations</Text>
            {variant && (
                <span
                    // `tile-status-dot` is the marker exempting it from the tile's
                    // blanket "no descendant backgrounds on hover" rule, which would
                    // otherwise blank the dot exactly when the pointer is on it.
                    className={`integrations-tile-dot tile-status-dot status-dot--${variant}`}
                    data-testid="integrations-tile-dot"
                    data-variant={variant}
                />
            )}
        </ActionButton>
    );
}
