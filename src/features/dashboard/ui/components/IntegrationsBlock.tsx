/**
 * IntegrationsBlock Component (D2 Track B — Step 05; wired + mesh-unified by
 * ADR-011 D3 Step 08)
 *
 * Thin wrapper that renders the {@link AppBuilderComponentsList} inside the dashboard
 * grid container, composing the mesh's {@link MeshComponentRow} into the list's
 * meshRow slot (Step 08 retired the masthead mesh badge and the Deploy Mesh
 * tile — this list is the one App Builder surface, mesh included). Each
 * integration row drives the live D1 runner; the mesh row drives the existing
 * 'deployMesh' path. Extracted from ProjectDashboardScreen to keep that
 * component within the size limit.
 *
 * @module features/dashboard/ui/components/IntegrationsBlock
 */

import React from 'react';
import type { StatusDisplay, MeshStatus } from '../hooks/useDashboardStatus';
import { AppBuilderComponentsList } from './AppBuilderComponentsList';
import { MeshComponentRow } from './MeshComponentRow';
import type { Project } from '@/types';
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
     * Live mesh status display. Non-null ⇒ the mesh row renders (mirrors the
     * retired badge's visibility: loading / any resolved mesh status); null ⇒
     * the project has no mesh surface.
     */
    meshStatusDisplay?: StatusDisplay | null;
    /** Raw mesh status — drives the mesh row's action. */
    meshStatus?: MeshStatus;
    /** Disables the mesh row's deploy action while an operation is in flight. */
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

    const meshRow =
        meshStatusDisplay && onDeployMesh && onReAuthenticate ? (
            <MeshComponentRow
                statusDisplay={meshStatusDisplay}
                status={meshStatus}
                isActionDisabled={Boolean(isMeshActionDisabled)}
                onDeploy={onDeployMesh}
                onReAuthenticate={onReAuthenticate}
            />
        ) : undefined;

    return (
        <div className="dashboard-grid-container">
            <AppBuilderComponentsList
                project={{ appBuilderComponents } as Project}
                catalog={catalog ?? EMPTY_CATALOG}
                meshRow={meshRow}
            />
        </div>
    );
}
