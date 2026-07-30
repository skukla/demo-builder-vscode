/**
 * IntegrationsBlock Component (D2 Track B — Step 05; mesh-unified by ADR-011
 * D3 Step 08; card grid by integrations-grid Step 07)
 *
 * Thin wrapper that renders the {@link IntegrationsGrid} inside the dashboard
 * grid container. Its props surface is UNCHANGED from the stacked-rows era —
 * the screen wiring never moved — but the mesh now arrives as descriptor
 * INPUTS (statusDisplay + status + disabled + callbacks) rather than a
 * pre-built row ReactNode, because the grid derives the mesh peer card from
 * the same model as the integration cards.
 *
 * Extracted from ProjectDashboardScreen to keep that component within the size
 * limit.
 *
 * @module features/dashboard/ui/components/IntegrationsBlock
 */

import React from 'react';
import type { StatusDisplay, MeshStatus } from '../hooks/useDashboardStatus';
import { IntegrationsGrid } from './integrations/IntegrationsGrid';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';

/** Module-level stable empty catalog — avoids a new array ref each render. */
const EMPTY_CATALOG: AppBuilderComponentCatalogEntry[] = [];

export interface IntegrationsBlockProps {
    /** Render gate: the add affordance needs an Adobe workspace to deploy into. */
    hasAdobeContext?: boolean;
    appBuilderComponents?: Record<string, AppBuilderComponentState>;
    catalog?: AppBuilderComponentCatalogEntry[];
    /**
     * Live mesh status display. Non-null ⇒ the mesh card renders (mirrors the
     * retired badge's visibility: loading / any resolved mesh status); null ⇒
     * the project has no mesh surface.
     */
    meshStatusDisplay?: StatusDisplay | null;
    /** Raw mesh status — drives the mesh card's action. */
    meshStatus?: MeshStatus;
    /** Disables the mesh card's actions while an operation is in flight. */
    isMeshActionDisabled?: boolean;
    /** The existing mesh deploy path (posts 'deployMesh'). */
    onDeployMesh?: () => void;
    /** User-initiated re-auth for the mesh needs-auth state. */
    onReAuthenticate?: () => void;
}

export function IntegrationsBlock({
    hasAdobeContext,
    appBuilderComponents,
    catalog,
    meshStatusDisplay,
    meshStatus,
    isMeshActionDisabled,
    onDeployMesh,
    onReAuthenticate,
}: IntegrationsBlockProps) {
    if (!hasAdobeContext) {
        return null;
    }

    // The mesh card needs BOTH callbacks to be actionable — same gate the
    // retired meshRow slot applied, so a half-wired screen shows no mesh card.
    const hasMeshSurface = Boolean(meshStatusDisplay && onDeployMesh && onReAuthenticate);

    return (
        <div className="dashboard-grid-container">
            <IntegrationsGrid
                appBuilderComponents={appBuilderComponents}
                catalog={catalog ?? EMPTY_CATALOG}
                meshStatusDisplay={hasMeshSurface ? meshStatusDisplay : null}
                meshStatus={meshStatus}
                isMeshActionDisabled={isMeshActionDisabled}
                onDeployMesh={onDeployMesh}
                onReAuthenticate={onReAuthenticate}
            />
        </div>
    );
}
