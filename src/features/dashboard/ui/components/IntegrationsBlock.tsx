/**
 * IntegrationsBlock Component (D2 Track B — Step 05)
 *
 * Thin wrapper that renders the {@link AppBuilderComponentsList} inside the dashboard
 * grid container. A SEPARATE surface beside the App Builder card / mesh badge
 * (D3 owns mesh unification): each row drives the live D1 runner; the mesh keeps
 * its own badge and is excluded inside AppBuilderComponentsList. Extracted from
 * ProjectDashboardScreen to keep that component within the size limit.
 *
 * @module features/dashboard/ui/components/IntegrationsBlock
 */

import React from 'react';
import { AppBuilderComponentsList } from './AppBuilderComponentsList';
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
}

export function IntegrationsBlock({ hasAdobeContext, appBuilderComponents, catalog }: IntegrationsBlockProps) {
    if (!hasAdobeContext) {
        return null;
    }
    return (
        <div className="dashboard-grid-container">
            <AppBuilderComponentsList project={{ appBuilderComponents } as Project} catalog={catalog ?? EMPTY_CATALOG} />
        </div>
    );
}
