/**
 * Shared harness for the integrationCardModel suites (integrations grid, Step 2).
 *
 * The matrices split across two spec files to stay under the 500-line limit —
 * integrationCardModel.test.ts (deriveIntegrationCard) and
 * integrationCardModel-mesh.test.ts (deriveMeshCard + buildIntegrationCards) —
 * so the catalog-loader fake and every fixture live here.
 *
 * This module owns the SUT import and re-exports it, which guarantees the
 * jest.mock call below is registered before the model module loads.
 */

import type { IdentifiedAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import type { StatusDisplay, MeshStatus } from '@/features/dashboard/ui/hooks/useDashboardStatus';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';

// ---------------------------------------------------------------------------
// Catalog loader mock — a faithful fake over a tiny fixed catalog. The REAL
// blank entry is skukla/app-builder-shell; the fake mirrors that shape so the
// fork-mismatch scenario (same repo, wrong owner) is meaningful.
// ---------------------------------------------------------------------------
const BLANK_SOURCE = { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' };

const FAKE_CATALOG: Record<string, AppBuilderComponentCatalogEntry> = {
    'sfdc-connector': {
        id: 'sfdc-connector',
        name: 'Salesforce CRM',
        description: 'Pre-built SFDC connector',
        kind: 'integration',
        source: { owner: 'adobe', repo: 'sfdc-connector', branch: 'main' },
        requiredApis: ['I/O Management API', 'Campaign'],
    },
    'no-apis-entry': {
        id: 'no-apis-entry',
        name: 'No APIs Entry',
        description: 'Catalog entry without requiredApis',
        kind: 'integration',
        source: { owner: 'adobe', repo: 'no-apis-entry', branch: 'main' },
    },
    'app-builder-shell': {
        id: 'app-builder-shell',
        name: 'Custom Integration',
        description: 'The blank shell',
        kind: 'integration',
        blank: true,
        source: BLANK_SOURCE,
    },
};

jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentEntry: jest.fn((id: string) => FAKE_CATALOG[id]),
    isBlankSource: jest.fn(
        (source: { owner: string; repo: string }) =>
            source.owner === 'skukla' && source.repo === 'app-builder-shell',
    ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const INTEGRATION_STATUSES = ['not-deployed', 'deploying', 'deployed', 'stale', 'error'] as const;

const MESH_STATUSES: (MeshStatus | undefined)[] = [
    'checking',
    'needs-auth',
    'not-deployed',
    'deploying',
    'deployed',
    'config-changed',
    'config-incomplete',
    'update-declined',
    'error',
    undefined,
];

function integration(
    over: Partial<IdentifiedAppBuilderComponent> = {},
): IdentifiedAppBuilderComponent {
    return {
        id: 'erp-sync',
        kind: 'integration',
        status: 'deployed',
        source: { owner: 'acme', repo: 'erp-sync' },
        ...over,
    };
}

function display(over: Partial<StatusDisplay> = {}): StatusDisplay {
    return { color: 'green', text: 'Deployed', ...over };
}

function meshEntry(over: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return {
        kind: 'mesh',
        status: 'deployed',
        source: { owner: 'skukla', repo: 'commerce-mesh' },
        endpoint: 'https://graph.adobe.io/api/demo/graphql',
        ...over,
    };
}


export {
    deriveIntegrationCard,
    deriveMeshCard,
    buildIntegrationCards,
} from '@/features/dashboard/ui/components/integrations/integrationCardModel';
export type {
    IntegrationCardModel,
    RowStatusOverride,
} from '@/features/dashboard/ui/components/integrations/integrationCardModel';
export type { IdentifiedAppBuilderComponent };
export type { StatusDisplay, MeshStatus };
export type { AppBuilderComponentState };
export { BLANK_SOURCE, FAKE_CATALOG, INTEGRATION_STATUSES, MESH_STATUSES };
export { integration, display, meshEntry };
