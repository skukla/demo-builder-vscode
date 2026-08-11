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
import { act, render } from '@testing-library/react';
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
            adobeProjectTitle="My Demo Project"
            adobeWorkspaceTitle="Stage"
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
            expect(captured?.state.adobeProject?.id).toBe('proj-1');
            expect(captured?.state.adobeWorkspace?.id).toBe('ws-1');
        });

        // REGRESSION: deriveStageOrder only reads the ids as booleans, but the
        // dest-summary STAGE renders `adobeProject.title`. Supplying ids alone
        // left the user staring at two labelled rows with no values — the same
        // mistake as shaping state for the stage MACHINE without checking what
        // the stage RENDERS.
        it('carries the destination TITLES, which the summary actually renders', () => {
            renderAdapter();

            expect(captured?.state.adobeProject?.title).toBe('My Demo Project');
            expect(captured?.state.adobeWorkspace?.title).toBe('Stage');
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

    // REGRESSION (2026-08-03): the adapter's updateState swallowed every write
    // except `selectedConsoleApis`, and its state memo had no cache keys at all.
    // The wizard components it hosts are STATE-BACKED: `useSelectionStep` stores
    // fetched items in `state[cacheKey]` and reads them straight back. So the
    // project picker fetched 726 projects, wrote them to a state that discarded
    // them, and rendered "No Projects Found" in the same instant. The wizard host
    // passes its real state store, which is why the identical picker works there.
    describe('state store — writes must round-trip', () => {
        it('a projectsCache write comes back as state (the empty-picker bug)', () => {
            renderAdapter();
            const projects = [{ id: 'p-1', name: 'one', title: 'One' }];

            act(() => captured?.updateState({ projectsCache: projects }));

            expect(captured?.state.projectsCache).toEqual(projects);
        });

        it('a workspacesCache write comes back as state', () => {
            renderAdapter();
            const workspaces = [{ id: 'w-1', name: 'Stage' }];

            act(() => captured?.updateState({ workspacesCache: workspaces }));

            expect(captured?.state.workspacesCache).toEqual(workspaces);
        });

        it('still round-trips the API picks', () => {
            renderAdapter();

            act(() => captured?.updateState({ selectedConsoleApis: { 'erp-sync': ['a'] } }));

            expect(captured?.state.selectedConsoleApis).toEqual({ 'erp-sync': ['a'] });
        });

        it('a destination change overrides the value derived from the live project', () => {
            renderAdapter();

            act(() =>
                captured?.updateState({ adobeProject: { id: 'p-2', name: 'two', title: 'Two' } })
            );

            expect(captured?.state.adobeProject).toEqual({
                id: 'p-2',
                name: 'two',
                title: 'Two',
            });
        });

        it('leaves the derived destination alone until something writes over it', () => {
            renderAdapter();

            act(() => captured?.updateState({ projectsCache: [] }));

            expect(captured?.state.adobeProject?.id).toBe('proj-1');
            expect(captured?.state.adobeWorkspace?.id).toBe('ws-1');
        });
    });

    describe('kind picker inputs', () => {
        it('offers the mesh when the project has none', () => {
            renderAdapter({ 'order-flow': { ...INTEGRATION } });

            expect(captured?.meshComponent?.id).toBe('commerce-paas-mesh');
        });

        it('still passes the mesh component once one exists — the id list gates the option', () => {
            // Withholding the component would zero meshAvailable too, which also
            // broke `hasIntegrations`.
            renderAdapter({ 'commerce-paas-mesh': { ...INTEGRATION, kind: 'mesh' } });

            expect(captured?.meshComponent?.id).toBe('commerce-paas-mesh');
            expect(captured?.state.selectedAppBuilderComponents).toContain('commerce-paas-mesh');
        });

        // The test above keys the project by the CATALOG id, which a real project
        // never does — and that is precisely why the bug survived it. A project
        // keys its mesh by COMPONENT id (`eds-accs-mesh`), and `isMeshSelected`
        // reaches that id only through `selectedOptionalDependencies`. With that
        // key unset, meshSelected was false on every real project and the picker
        // kept offering a second mesh.
        it('marks the mesh added when the project keys it by COMPONENT id', () => {
            renderAdapter({ 'eds-accs-mesh': { ...INTEGRATION, kind: 'mesh' } });

            expect(captured?.state.selectedOptionalDependencies).toContain('eds-accs-mesh');
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

        // REGRESSION: sending only the name let the id fall back to
        // `${owner}-${repo}`, so a shell the user named came back titled
        // "skukla-app-builder-shell" (reported 2026-07-31). Both halves of the
        // instance identity have to travel.
        it('a named blank instance carries its display name AND its instance id', () => {
            renderAdapter();

            captured?.builder.onAddCustomAppBuilderComponent(
                { owner: 'skukla', repo: 'app-builder-shell' },
                { id: 'firefly-gen', name: 'Firefly Gen' }
            );

            expect(getClient().postMessage).toHaveBeenCalledWith('addAppBuilderComponent', {
                source: { owner: 'skukla', repo: 'app-builder-shell' },
                name: 'Firefly Gen',
                instanceId: 'firefly-gen',
            });
        });
    });
});

/**
 * Committing a destination must PERSIST it (2026-08-07, live).
 *
 * The handler, the Change control and the migration all existed and were each
 * tested alone — and picking a new project and workspace still did nothing,
 * because nothing connected them. `updateState` wrote the choice to local React
 * state and the modal closed on it.
 *
 * Continue off `dest-workspace` commits `adobeWorkspace`; that is the terminal
 * signal, and it is where the post belongs.
 */
describe('AddIntegrationFlowAdapter — persisting a destination change', () => {
    function renderInDestinationMode(): void {
        render(
            <AddIntegrationFlowAdapter
                isOpen
                mode="destination"
                onClose={jest.fn()}
                catalog={CATALOG}
                appBuilderComponents={{}}
                adobeProjectId="proj-1"
                adobeWorkspaceId="ws-1"
                adobeProjectTitle="My Demo Project"
                adobeWorkspaceTitle="Stage"
                adobeOrgId="org-1"
            />,
        );
    }

    it('posts setProjectDestination when the workspace commit lands', () => {
        renderInDestinationMode();

        act(() => {
            captured.updateState({ adobeProject: { id: 'proj-2', name: 'P2', title: 'Team Meeting' } });
        });
        act(() => {
            captured.updateState({ adobeWorkspace: { id: 'ws-2', name: 'Production', title: 'Production' } });
        });

        expect(getClient().postMessage).toHaveBeenCalledWith('setProjectDestination', {
            project: { id: 'proj-2', name: 'P2', title: 'Team Meeting' },
            workspace: { id: 'ws-2', name: 'Production', title: 'Production' },
        });
    });

    it('does NOT post on the project commit alone — the destination is incomplete', () => {
        renderInDestinationMode();

        act(() => {
            captured.updateState({ adobeProject: { id: 'proj-2', name: 'P2', title: 'Team Meeting' } });
        });

        expect(getClient().postMessage).not.toHaveBeenCalled();
    });

    it('does NOT post in add mode — that journey deploys, it does not re-point', () => {
        renderAdapter();

        act(() => {
            captured.updateState({ adobeWorkspace: { id: 'ws-2', name: 'Production', title: 'Production' } });
        });

        expect(getClient().postMessage).not.toHaveBeenCalledWith(
            'setProjectDestination',
            expect.anything(),
        );
    });
});
