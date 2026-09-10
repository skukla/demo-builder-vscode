/**
 * The harness both AddIntegrationFlowAdapter suites use.
 *
 * The adapter lets the dashboard surface render the WIZARD's Add Integration
 * modal instead of a second, diverging picker. Both suites pin the adapter's own
 * wiring — the props it shapes from the live project and what its commit
 * callbacks do — with the wizard modal stubbed to capture them. The modal's own
 * journey (stages, gates, labels) is the wizard's suite to pin, not these.
 *
 * This file owns the mock wall AND the component import, because `jest.mock`
 * hoists above the imports of the module it appears in and not across modules
 * (webview-test-authoring §3). A spec that imported the adapter itself would bind
 * it to the real modal.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render } from '@testing-library/react';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';
import '@testing-library/jest-dom';

/** Capture the props the adapter hands the wizard modal. */
let captured: Record<string, any> | undefined;
jest.mock(
    '@/features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal',
    () => ({
        AddIntegrationFlowModal: (props: any) => {
            captured = props;
            return <div data-testid="flow-modal" />;
        },
    })
);

// Below the mocks on purpose — see the file comment. `import/first` is not a
// registered rule here, so there is nothing to disable.
import { AddIntegrationFlowAdapter } from '@/features/dashboard/ui/integrationsSurface/AddIntegrationFlowAdapter';
import type { AddIntegrationFlowAdapterProps } from '@/features/dashboard/ui/integrationsSurface/AddIntegrationFlowAdapter';

/** The props the modal was last rendered with. Undefined before the first render. */
export function modalProps(): Record<string, any> {
    if (!captured) throw new Error('The flow modal has not rendered yet.');
    return captured;
}

export function resetCaptured(): void {
    captured = undefined;
}

export const CATALOG: AppBuilderComponentCatalogEntry[] = [
    {
        id: 'erp-sync',
        name: 'ERP Sync',
        description: 'd',
        kind: 'integration',
        source: { owner: 'acme', repo: 'erp-sync', branch: 'main' },
    },
    {
        id: 'app-builder-shell',
        name: 'Custom Integration',
        description: 'd',
        kind: 'integration',
        blank: true,
        source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
    },
    {
        id: 'commerce-paas-mesh',
        name: 'API Mesh',
        description: 'd',
        kind: 'mesh',
        source: { owner: 'acme', repo: 'mesh', branch: 'main' },
    },
];

export const INTEGRATION: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    source: { owner: 'acme', repo: 'order-flow' },
};

export const MESH: AppBuilderComponentState = { ...INTEGRATION, kind: 'mesh' };

/** A committed destination the pickers can write over. */
export const PROJECT_TWO = { id: 'proj-2', name: 'P2', title: 'Team Meeting' };
export const WORKSPACE_TWO = { id: 'ws-2', name: 'Production', title: 'Production' };

function adapterProps(
    overrides: Partial<AddIntegrationFlowAdapterProps>
): AddIntegrationFlowAdapterProps {
    return {
        isOpen: true,
        onClose: jest.fn(),
        catalog: CATALOG,
        appBuilderComponents: {},
        adobeProjectId: 'proj-1',
        adobeWorkspaceId: 'ws-1',
        adobeProjectTitle: 'My Demo Project',
        adobeWorkspaceTitle: 'Stage',
        adobeOrgId: 'org-1',
        ...overrides,
    };
}

/**
 * Render the adapter, with `rerenderWith` for the cases that matter only when a
 * prop CHANGES after the first render — a component landing on the live project,
 * a stack-filtered catalog narrowing, the surface switching journeys.
 */
export function renderAdapter(overrides: Partial<AddIntegrationFlowAdapterProps> = {}) {
    const view = render(<AddIntegrationFlowAdapter {...adapterProps(overrides)} />);
    return {
        ...view,
        rerenderWith: (next: Partial<AddIntegrationFlowAdapterProps>): void =>
            view.rerender(
                <AddIntegrationFlowAdapter {...adapterProps({ ...overrides, ...next })} />
            ),
    };
}
