/**
 * AddIntegrationFlowAdapter — the props it shapes and the commits it posts.
 *
 * The load-bearing difference from the wizard: the wizard STAGES a selection to
 * be built at project creation; here every commit deploys immediately via
 * `addAppBuilderComponent`.
 *
 * Persisting a destination change lives in the `-destination` sibling.
 */

import { act } from '@testing-library/react';
import { mockPostMessage, mockRequest } from '../../../../helpers/webviewClientMock';
import {
    CATALOG,
    INTEGRATION,
    MESH,
    modalProps,
    renderAdapter,
    resetCaptured,
} from './AddIntegrationFlowAdapter.testUtils';
import { buildReservedIds } from '@/features/project-creation/ui/components/integration-flow/instanceId';

beforeEach(() => {
    jest.clearAllMocks();
    resetCaptured();
});

describe('AddIntegrationFlowAdapter', () => {
    it('renders the wizard flow modal in add mode', () => {
        renderAdapter();

        expect(modalProps().mode).toBe('add');
        expect(modalProps().isOpen).toBe(true);
    });

    describe('state shaped from the live project', () => {
        it('reports the committed destination so the stages collapse to the summary', () => {
            renderAdapter();

            // deriveStageOrder reads these as booleans (projectCommitted /
            // workspaceCommitted) — real ids, not placeholders.
            expect(modalProps().state.adobeProject?.id).toBe('proj-1');
            expect(modalProps().state.adobeWorkspace?.id).toBe('ws-1');
        });

        // REGRESSION: deriveStageOrder only reads the ids as booleans, but the
        // dest-summary STAGE renders `adobeProject.title`. Supplying ids alone
        // left the user staring at two labelled rows with no values — the same
        // mistake as shaping state for the stage MACHINE without checking what
        // the stage RENDERS.
        it('carries the destination TITLES, which the summary actually renders', () => {
            renderAdapter();

            expect(modalProps().state.adobeProject?.title).toBe('My Demo Project');
            expect(modalProps().state.adobeWorkspace?.title).toBe('Stage');
        });

        it('lists ALL keyed ids including the mesh', () => {
            // Not integrations-only: the id list also drives `meshSelected` and
            // `hasIntegrations`, and a mesh-only project must still report that
            // SOMETHING references the destination.
            renderAdapter({
                appBuilderComponents: {
                    'order-flow': { ...INTEGRATION },
                    'commerce-paas-mesh': { ...MESH },
                },
            });

            expect(modalProps().state.selectedAppBuilderComponents).toEqual([
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

            // The WHOLE block, not just isAuthenticated: a live project is not
            // mid-check, and `isChecking: true` puts the flow back on a spinner.
            expect(modalProps().state.adobeAuth).toEqual({
                isAuthenticated: true,
                isChecking: false,
            });
            expect(modalProps().state.adobeOrg).toEqual({ id: 'org-1' });
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

            act(() => modalProps().updateState({ projectsCache: projects }));

            expect(modalProps().state.projectsCache).toEqual(projects);
        });

        it('a workspacesCache write comes back as state', () => {
            renderAdapter();
            const workspaces = [{ id: 'w-1', name: 'Stage' }];

            act(() => modalProps().updateState({ workspacesCache: workspaces }));

            expect(modalProps().state.workspacesCache).toEqual(workspaces);
        });

        it('still round-trips the API picks', () => {
            renderAdapter();

            act(() => modalProps().updateState({ selectedConsoleApis: { 'erp-sync': ['a'] } }));

            expect(modalProps().state.selectedConsoleApis).toEqual({ 'erp-sync': ['a'] });
        });

        it('a destination change overrides the value derived from the live project', () => {
            renderAdapter();

            act(() =>
                modalProps().updateState({ adobeProject: { id: 'p-2', name: 'two', title: 'Two' } })
            );

            expect(modalProps().state.adobeProject).toEqual({
                id: 'p-2',
                name: 'two',
                title: 'Two',
            });
        });

        it('leaves the derived destination alone until something writes over it', () => {
            renderAdapter();

            act(() => modalProps().updateState({ projectsCache: [] }));

            expect(modalProps().state.adobeProject?.id).toBe('proj-1');
            expect(modalProps().state.adobeWorkspace?.id).toBe('ws-1');
        });
    });

    describe('kind picker inputs', () => {
        it('offers the mesh when the project has none', () => {
            renderAdapter({ appBuilderComponents: { 'order-flow': { ...INTEGRATION } } });

            expect(modalProps().meshComponent?.id).toBe('commerce-paas-mesh');
        });

        it('still passes the mesh component once one exists — the id list gates the option', () => {
            // Withholding the component would zero meshAvailable too, which also
            // broke `hasIntegrations`.
            renderAdapter({ appBuilderComponents: { 'commerce-paas-mesh': { ...MESH } } });

            expect(modalProps().meshComponent?.id).toBe('commerce-paas-mesh');
            expect(modalProps().state.selectedAppBuilderComponents).toContain('commerce-paas-mesh');
        });

        // A project keys its mesh by COMPONENT id (`eds-accs-mesh`), and since
        // mesh catalog ids ARE registry component ids, `isMeshSelected` finds it
        // in selectedAppBuilderComponents — the single mesh authority (D3). The
        // retired legacy `selectedOptionalDependencies` mirror is gone.
        it('marks the mesh added when the project keys it by COMPONENT id', () => {
            renderAdapter({ appBuilderComponents: { 'eds-accs-mesh': { ...MESH } } });

            expect(modalProps().state.selectedAppBuilderComponents).toContain('eds-accs-mesh');
        });

        it('passes the blank starter for the "build custom" kind', () => {
            renderAdapter();

            expect(modalProps().blankComponent?.id).toBe('app-builder-shell');
        });

        it('offers no mesh kind when the stack-filtered catalog has none', () => {
            renderAdapter({ catalog: CATALOG.filter((entry) => entry.kind !== 'mesh') });

            expect(modalProps().meshComponent).toBeUndefined();
        });

        it('offers no blank starter when the stack-filtered catalog has none', () => {
            renderAdapter({ catalog: CATALOG.filter((entry) => entry.blank !== true) });

            expect(modalProps().blankComponent).toBeUndefined();
        });

        // The surface renders BEFORE the catalog arrives — IntegrationsScreen falls
        // back to a stable empty array until it does. Both kind options have to
        // appear when it lands, not stay frozen at whatever the first render saw.
        it('picks up the mesh option when the catalog finishes loading', () => {
            const view = renderAdapter({ catalog: [] });
            expect(modalProps().meshComponent).toBeUndefined();

            view.rerenderWith({ catalog: CATALOG });

            expect(modalProps().meshComponent?.id).toBe('commerce-paas-mesh');
        });

        it('picks up the blank starter when the catalog finishes loading', () => {
            const view = renderAdapter({ catalog: [] });
            expect(modalProps().blankComponent).toBeUndefined();

            view.rerenderWith({ catalog: CATALOG });

            expect(modalProps().blankComponent?.id).toBe('app-builder-shell');
        });
    });

    /**
     * The collision domain a blank instance name is checked against.
     *
     * Asserted as the WHOLE set against `buildReservedIds` driven with the inputs
     * the adapter is supposed to hand it — so a missing input, a spare one, or an
     * unfiltered id list all fail here. Asserting `has(...)` one id at a time
     * cannot see any of those.
     */
    describe('reserved ids', () => {
        it('reserves the catalog plus the project INTEGRATION ids, and nothing else', () => {
            renderAdapter({
                appBuilderComponents: {
                    'order-flow': { ...INTEGRATION },
                    'eds-accs-mesh': { ...MESH },
                },
            });

            expect(modalProps().reservedIds).toEqual(
                buildReservedIds({
                    // The mesh is deliberately absent: this list is the integration
                    // naming domain, and `.filter(kind === 'integration')` is what
                    // keeps it so.
                    selectedIntegrationIds: ['order-flow'],
                    sourceIds: ['order-flow'],
                    catalogIds: CATALOG.map((entry) => entry.id),
                    selectedAddons: [],
                })
            );
        });

        // Before the catalog lands, the project's own components are the ONLY
        // source of ids — which is where the integration filter becomes visible.
        // A mesh keyed by a catalog id outside MESH_COMPONENT_IDS is not reserved;
        // the three standard mesh ids are, but `buildReservedIds` bakes those in
        // itself and would hide the difference.
        it('reserves only the project INTEGRATION ids while the catalog is still loading', () => {
            renderAdapter({
                catalog: [],
                appBuilderComponents: {
                    'order-flow': { ...INTEGRATION },
                    'commerce-paas-mesh': { ...MESH },
                },
            });

            expect(modalProps().reservedIds).toEqual(
                buildReservedIds({
                    selectedIntegrationIds: ['order-flow'],
                    sourceIds: ['order-flow'],
                    catalogIds: [],
                    selectedAddons: [],
                })
            );
        });

        it('re-reserves once a component lands on the live project', () => {
            const view = renderAdapter({ appBuilderComponents: {} });
            expect(modalProps().reservedIds.has('order-flow')).toBe(false);

            view.rerenderWith({ appBuilderComponents: { 'order-flow': { ...INTEGRATION } } });

            expect(modalProps().reservedIds.has('order-flow')).toBe(true);
        });
    });

    it('reflects a component that lands on the live project after the first render', () => {
        const view = renderAdapter({ appBuilderComponents: { 'order-flow': { ...INTEGRATION } } });

        view.rerenderWith({
            appBuilderComponents: {
                'order-flow': { ...INTEGRATION },
                'erp-sync': { ...INTEGRATION },
            },
        });

        expect(modalProps().state.selectedAppBuilderComponents).toEqual(['order-flow', 'erp-sync']);
    });

    describe('commits deploy against the LIVE project', () => {
        it('a catalog/mesh pick posts addAppBuilderComponent with the id', () => {
            renderAdapter();

            modalProps().builder.onAppBuilderComponentToggle('erp-sync', true);

            expect(mockPostMessage).toHaveBeenCalledWith('addAppBuilderComponent', {
                id: 'erp-sync',
            });
        });

        it('a DESELECT posts nothing (there is no staged draft to un-stage here)', () => {
            renderAdapter();

            modalProps().builder.onAppBuilderComponentToggle('erp-sync', false);

            expect(mockPostMessage).not.toHaveBeenCalled();
        });

        it('a custom source posts addAppBuilderComponent with the source', () => {
            renderAdapter();

            modalProps().builder.onAddCustomAppBuilderComponent({
                owner: 'acme',
                repo: 'custom-app',
            });

            expect(mockPostMessage).toHaveBeenCalledWith('addAppBuilderComponent', {
                source: { owner: 'acme', repo: 'custom-app' },
            });
        });

        // REGRESSION: sending only the name let the id fall back to
        // `${owner}-${repo}`, so a shell the user named came back titled
        // "skukla-app-builder-shell" (reported 2026-07-31). Both halves of the
        // instance identity have to travel.
        it('a named blank instance carries its display name AND its instance id', () => {
            renderAdapter();

            modalProps().builder.onAddCustomAppBuilderComponent(
                { owner: 'skukla', repo: 'app-builder-shell' },
                { id: 'firefly-gen', name: 'Firefly Gen' }
            );

            expect(mockPostMessage).toHaveBeenCalledWith('addAppBuilderComponent', {
                source: { owner: 'skukla', repo: 'app-builder-shell' },
                name: 'Firefly Gen',
                instanceId: 'firefly-gen',
            });
        });
    });

    /**
     * The API picks are mirrored into a ref because `commitSelection` records them
     * and posts in the SAME tick — a setState-backed read would still be a render
     * behind. These pin that the picks reach the post, and survive a later write
     * that carries none.
     */
    describe('the API picks travel with the add', () => {
        it('sends the picks recorded before a catalog toggle', () => {
            renderAdapter();

            act(() =>
                modalProps().updateState({ selectedConsoleApis: { 'erp-sync': ['AdobeIOEvents'] } })
            );
            modalProps().builder.onAppBuilderComponentToggle('erp-sync', true);

            expect(mockPostMessage).toHaveBeenCalledWith('addAppBuilderComponent', {
                id: 'erp-sync',
                apis: ['AdobeIOEvents'],
            });
        });

        it('keeps them when a later write carries no picks at all', () => {
            renderAdapter();

            act(() =>
                modalProps().updateState({ selectedConsoleApis: { 'erp-sync': ['AdobeIOEvents'] } })
            );
            act(() => modalProps().updateState({ projectsCache: [] }));
            modalProps().builder.onAppBuilderComponentToggle('erp-sync', true);

            expect(mockPostMessage).toHaveBeenCalledWith('addAppBuilderComponent', {
                id: 'erp-sync',
                apis: ['AdobeIOEvents'],
            });
        });

        // Picks for a NAMED blank key under the instance id, not the owner-repo
        // slug — the same key useIntegrationFlow just wrote them under.
        it('keys a named blank instance picks under the instance id', () => {
            renderAdapter();

            act(() =>
                modalProps().updateState({
                    selectedConsoleApis: { 'firefly-gen': ['AdobeIORuntime'] },
                })
            );
            modalProps().builder.onAddCustomAppBuilderComponent(
                { owner: 'skukla', repo: 'app-builder-shell' },
                { id: 'firefly-gen', name: 'Firefly Gen' }
            );

            expect(mockPostMessage).toHaveBeenCalledWith('addAppBuilderComponent', {
                source: { owner: 'skukla', repo: 'app-builder-shell' },
                name: 'Firefly Gen',
                instanceId: 'firefly-gen',
                apis: ['AdobeIORuntime'],
            });
        });
    });

    /**
     * The DASHBOARD webview registers `reAuthenticate`, not the wizard's
     * `authenticate` — it awaits the browser sign-in and returns when it is done,
     * so the picker can re-fetch straight after.
     */
    describe('sign-in', () => {
        it('asks the dashboard to reAuthenticate', async () => {
            mockRequest.mockResolvedValue(undefined);
            renderAdapter();

            await modalProps().onSignIn();

            expect(mockRequest).toHaveBeenCalledWith('reAuthenticate');
        });

        it('swallows a failed sign-in rather than rejecting into the modal', async () => {
            mockRequest.mockRejectedValue(new Error('the browser was closed'));
            renderAdapter();

            await expect(modalProps().onSignIn()).resolves.toBeUndefined();
        });
    });
});
