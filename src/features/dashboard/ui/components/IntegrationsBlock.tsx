/**
 * IntegrationsBlock Component (D2 Track B — Step 05)
 *
 * Thin wrapper that renders the {@link DeployablesList} inside the dashboard
 * grid container. A SEPARATE surface beside the App Builder card / mesh badge
 * (D3 owns mesh unification): each row drives the live D1 runner; the mesh keeps
 * its own badge and is excluded inside DeployablesList. Extracted from
 * ProjectDashboardScreen to keep that component within the size limit.
 *
 * @module features/dashboard/ui/components/IntegrationsBlock
 */

import React from 'react';
import { DeployablesList } from './DeployablesList';
import type { Project } from '@/types';
import type { DeployableState } from '@/types/base';
import type { DeployableCatalogEntry } from '@/types/deployables';

/** Module-level stable empty catalog — avoids a new array ref each render. */
const EMPTY_CATALOG: DeployableCatalogEntry[] = [];

export interface IntegrationsBlockProps {
    /** Render gate: the add affordance needs an Adobe workspace to deploy into. */
    hasAdobeContext?: boolean;
    deployables?: Record<string, DeployableState>;
    catalog?: DeployableCatalogEntry[];
}

export function IntegrationsBlock({ hasAdobeContext, deployables, catalog }: IntegrationsBlockProps) {
    if (!hasAdobeContext) {
        return null;
    }
    return (
        <div className="dashboard-grid-container">
            <DeployablesList project={{ deployables } as Project} catalog={catalog ?? EMPTY_CATALOG} />
        </div>
    );
}
