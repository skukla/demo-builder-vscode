/**
 * AddIntegrationFlowAdapter Tests
 *
 * The adapter lets the dashboard surface render the WIZARD's Add Integration
 * modal instead of a second, diverging picker. These tests pin the adapter's
 * own wiring — the props it shapes from the live project and what its commit
 * callbacks do — with the wizard modal stubbed to capture them. The modal's own
 * journey (stages, gates, labels) is the wizard's suite to pin, not this one.
 *
 * The load-bearing difference from the wizard: the wizard STAGES a selection to
 * be built at project creation; here every commit deploys immediately via
 * `addAppBuilderComponent`.
 */

import React from 'react';
import { render } from '@testing-library/react';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { postMessage: jest.fn() },
}));

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

import { AddIntegrationFlowAdapter } from '@/features/dashboard/ui/integrationsSurface/AddIntegrationFlowAdapter';

function getClient() {
    const { webviewClient } = require('@/core/ui/utils/WebviewClient');
    return webviewClient as { postMessage: jest.Mock };
}

const CATALOG: AppBuilderComponentCatalogEntry[] = [
    {
        id: 'erp-sync',
        name: 'ERP Sync',
        description: 'd',
        kind: 'integration',
        source: { owner: 'acme', repo: 'erp-sync' },
    },
    {
        id: 'app-builder-shell',
        name: 'Custom Integration',
        description: 'd',
        kind: 'integration',
        blank: true,
        source: { owner: 'skukla', repo: 'app-builder-shell' },
    },
    {
        id: 'commerce-paas-mesh',
        name: 'API Mesh',
        description: 'd',
        kind: 'mesh',
        source: { owner: 'acme', repo: 'mesh' },
    },
];

const INTEGRATION: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    source: { owner: 'acme', repo: 'order-flow' },
};

function renderAdapter(appBuilderComponents: Record<string, AppBuilderComponentState> = {}): void {
    render(
        <AddIntegrationFlowAdapter
            isOpen
            onClose={jest.fn()}
            catalog={CATALOG}
            appBuilderComponents={appBuilderComponents}
            adobeProjectId="proj-1"
            adobeWorkspaceId="ws-1"
            adobeOrgId="org-1"
        />
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    captured = undefined;
});

describe('AddIntegrationFlowAdapter', () => {
    it('renders the wizard flow modal in add mode', () => {
        renderAdapter();

        expect(captured?.mode).toBe('add');
        expect(captured?.isOpen).toBe(true);
    });

    describe('state shaped from the live project', () => {
        it('reports the committed destination so the stages collapse to the summary', () => {
            renderAdapter();

            // deriveStageOrder reads these as booleans (projectCommitted /
            // workspaceCommitted) — real ids, not placeholders.
            expect(captured?.state.adobeProject).toEqual({ id: 'proj-1' });
            expect(captured?.state.adobeWorkspace).toEqual({ id: 'ws-1' });
        });

        it('lists ALL keyed ids including the mesh', () => {
            // Not integrations-only: the id list also drives `meshSelected` and
            // `hasIntegrations`, and a mesh-only project must still report that
            // SOMETHING references the destination.
            renderAdapter({
                'order-flow': { ...INTEGRATION },
                'commerce-paas-mesh': { ...INTEGRATION, kind: 'mesh' },
            });

            expect(captured?.state.selectedAppBuilderComponents).toEqual([
                'order-flow',
                'commerce-paas-mesh',
            ]);
        });

        // REGRESSION: without adobeAuth + adobeOrg, isAdobeSignedIn() is false and
        // the flow walks dest-signin → dest-project → dest-workspace, mounting the
        // wizard's AdobeAuthStep and blanking the webview. The project id alone is
        // NOT what that test reads.
        it('reports a signed-in Adobe session so the destination stages collapse', () => {
            renderAdapter();

            expect(captured?.state.adobeAuth?.isAuthenticated).toBe(true);
            expect(captured?.state.adobeOrg).toEqual({ id: 'org-1' });
        });
    });

    describe('kind picker inputs', () => {
        it('offers the mesh when the project has none', () => {
            renderAdapter({ 'order-flow': { ...INTEGRATION } });

            expect(captured?.meshComponent?.id).toBe('commerce-paas-mesh');
        });

        it('still passes the mesh component once one exists — the id list hides the option', () => {
            // meshKindOffered = meshAvailable && !meshSelected. Withholding the
            // component would zero BOTH, which also broke `hasIntegrations`.
            renderAdapter({ 'commerce-paas-mesh': { ...INTEGRATION, kind: 'mesh' } });

            expect(captured?.meshComponent?.id).toBe('commerce-paas-mesh');
            expect(captured?.state.selectedAppBuilderComponents).toContain('commerce-paas-mesh');
        });

        it('passes the blank starter for the "build custom" kind', () => {
            renderAdapter();

            expect(captured?.blankComponent?.id).toBe('app-builder-shell');
        });

        it('reserves existing integration ids so a blank instance cannot collide', () => {
            renderAdapter({ 'order-flow': { ...INTEGRATION } });

            expect(captured?.reservedIds.has('order-flow')).toBe(true);
            expect(captured?.reservedIds.has('erp-sync')).toBe(true);
        });
    });

    describe('commits deploy against the LIVE project', () => {
        it('a catalog/mesh pick posts addAppBuilderComponent with the id', () => {
            renderAdapter();

            captured?.builder.onAppBuilderComponentToggle('erp-sync', true);

            expect(getClient().postMessage).toHaveBeenCalledWith('addAppBuilderComponent', {
                id: 'erp-sync',
            });
        });

        it('a DESELECT posts nothing (there is no staged draft to un-stage here)', () => {
            renderAdapter();

            captured?.builder.onAppBuilderComponentToggle('erp-sync', false);

            expect(getClient().postMessage).not.toHaveBeenCalled();
        });

        it('a custom source posts addAppBuilderComponent with the source', () => {
            renderAdapter();

            captured?.builder.onAddCustomAppBuilderComponent({
                owner: 'acme',
                repo: 'custom-app',
            });

            expect(getClient().postMessage).toHaveBeenCalledWith('addAppBuilderComponent', {
                source: { owner: 'acme', repo: 'custom-app' },
            });
        });

        it('a named blank instance carries its display name', () => {
            renderAdapter();

            captured?.builder.onAddCustomAppBuilderComponent(
                { owner: 'skukla', repo: 'app-builder-shell' },
                { id: 'firefly-gen', name: 'Firefly Gen' }
            );

            expect(getClient().postMessage).toHaveBeenCalledWith('addAppBuilderComponent', {
                source: { owner: 'skukla', repo: 'app-builder-shell' },
                name: 'Firefly Gen',
            });
        });
    });
});
