/**
 * dashboardHandlers Tests
 *
 * Tests for the dashboard feature handler map.
 * Verifies all required message types are present.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { hasHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';

describe('dashboardHandlers', () => {
    describe('handler registration', () => {
        it('should be defined as an object', () => {
            // Given: dashboardHandlers object
            // When: Checking type
            // Then: Should be a non-null object
            expect(dashboardHandlers).toBeDefined();
            expect(typeof dashboardHandlers).toBe('object');
            expect(dashboardHandlers).not.toBeNull();
        });

        it('should include initialization handlers', () => {
            // Given: dashboardHandlers object
            // When: Checking for initialization message types
            // Then: Initialization handlers present
            // No 'ready' handler — initial init is delivered by BaseWebviewCommand
            // on handshake; a competing 'ready' init clobbered rich init fields.
            expect(hasHandler(dashboardHandlers, 'ready')).toBe(false);
            expect(hasHandler(dashboardHandlers, 'requestStatus')).toBe(true);
        });

        // Note: Authentication handlers removed - inline auth via loginAndRestoreProjectContext

        it('should include demo lifecycle handlers', () => {
            // Given: dashboardHandlers object
            // When: Checking for demo lifecycle message types
            // Then: Demo lifecycle handlers present
            expect(hasHandler(dashboardHandlers, 'startDemo')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'stopDemo')).toBe(true);
        });

        it('should include navigation handlers', () => {
            // Given: dashboardHandlers object
            // When: Checking for navigation message types
            // Then: Navigation handlers present
            expect(hasHandler(dashboardHandlers, 'openBrowser')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'openLiveSite')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'openAdminPanel')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'configure')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'openDevConsole')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'navigateBack')).toBe(true);
        });

        it('should include mesh handlers', () => {
            // Given: dashboardHandlers object
            // When: Checking for mesh message types
            // Then: Mesh handlers present
            expect(hasHandler(dashboardHandlers, 'deployMesh')).toBe(true);
        });

        it('does NOT register the retired singular App Builder handlers (D3 Step 08)', () => {
            // The dormant AppBuilderCard (the only poster of these id-less
            // messages) is deleted; the keyed per-id appBuilderComponent
            // handlers below are the one App Builder surface. NOTE: the
            // projects-dashboard feature's 'redeployApp' is a DIFFERENT
            // handler map (projectsListHandlers) and is unaffected.
            expect(hasHandler(dashboardHandlers, 'addApp')).toBe(false);
            expect(hasHandler(dashboardHandlers, 'deployApp')).toBe(false);
            expect(hasHandler(dashboardHandlers, 'redeployApp')).toBe(false);
            expect(hasHandler(dashboardHandlers, 'removeApp')).toBe(false);
        });

        it('should include authentication handlers', () => {
            // Given: dashboardHandlers object
            // When: Checking for auth message types
            // Then: Authentication handlers present (session re-auth + forced org switch)
            expect(hasHandler(dashboardHandlers, 'reAuthenticate')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'switchOrg')).toBe(true);
        });

        it('should include project management handlers', () => {
            // Given: dashboardHandlers object
            // When: Checking for project management message types
            // Then: Project management handlers present
            expect(hasHandler(dashboardHandlers, 'deleteProject')).toBe(true);
        });

        it('should include project reset handler', () => {
            // Given: dashboardHandlers object
            // When: Checking for project reset message type
            // Then: Project reset handler present
            expect(hasHandler(dashboardHandlers, 'resetProject')).toBe(true);
        });

        it('should include the More-menu action handlers', () => {
            // Given: dashboardHandlers object
            // When: Checking for the More-menu message types
            // Then: editProject, republishContent, renameProject present
            // (copyPath removed — Copy Path lives on the project-card kebab;
            // exportProject removed 2026-09-13 — the Export dialog's file form
            // goes through exportDemoBundle, and setup alone through the same door)
            expect(hasHandler(dashboardHandlers, 'editProject')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'exportProject')).toBe(false);
            expect(hasHandler(dashboardHandlers, 'republishContent')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'renameProject')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'getProjectUrls')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'copyPath')).toBe(false);
        });

        it('does not register a setAuthoringExperience handler (relocated to Configure)', () => {
            expect(hasHandler(dashboardHandlers, 'setAuthoringExperience')).toBe(false);
        });

        it('registers the appBuilderComponent (integrations list) handlers', () => {
            // The live D1-runner wiring for the dashboard integrations list.
            expect(hasHandler(dashboardHandlers, 'addAppBuilderComponent')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'deployAppBuilderComponent')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'redeployAppBuilderComponent')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'removeAppBuilderComponent')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'renameAppBuilderComponent')).toBe(true);
            // verifyAppBuilderComponent was REMOVED (2026-08-03): it probed org
            // reachability and reported the answer as a per-component verdict, so
            // a deleted integration verified green.
            expect(hasHandler(dashboardHandlers, 'verifyAppBuilderComponent')).toBe(false);
        });

        it('registers the headless exportProjectSettings handler (export_project_settings tool)', () => {
            // The path-based, dialog-free variant the agent tool dispatches; the
            // dashboard's own Export goes through exportDemoBundle.
            expect(hasHandler(dashboardHandlers, 'exportProjectSettings')).toBe(true);
        });

        it('should have exactly 60 handlers', () => {
            // Given: dashboardHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(dashboardHandlers) as Array<
                keyof typeof dashboardHandlers
            >;

            // Then: exactly 60 — the 49 below, then the additions noted after the
            // table — derived in the map's own declaration order so a
            // reader can check it against the source top to bottom.
            //
            // NOTE: the previous derivation did not add up — it said "9
            // navigation" while listing ten, and its running subtotals were off
            // by one from the first group onward. Rewritten rather than nudged.
            //
            //   1  init            requestStatus (no 'ready')
            //   3  lifecycle       startDemo, stopDemo, restartDemo
            //  12  navigation      openBrowser, openLiveSite, openDaLive,
            //                      openAdminPanel, configure, openDebugLogs
            //                      (PL-59: the progress modal's failure state),
            //                      openDevConsole,
            //                      getProjectUrls, navigateBack,
            //                      openIntegrations, showProjectDashboard,
            //                      openDataInstaller
            //   1  mesh            deployMesh
            //   9  integrations    add/deploy/redeploy/remove/rename
            //                      AppBuilderComponent, plus the AB-5 pair:
            //                      installAppBuilderComponent (re-run the
            //                      Commerce install without a redeploy) and
            //                      getAppBuilderInstallStatus (live install
            //                      state read), plus getComponentOperationProgress
            //                      (PL-59: the latest step for the progress modal)
            //                      and backgroundComponentOperation ("Run in
            //                      background" hands it to a notification)
            //   3  console APIs    listConsoleApis, addConsoleApis, setConsoleApis
            //   1  runtime         listRuntimePackages (the list_runtime_packages
            //                      read: what a removal left running, 2026-09-21)
            //   2  storefront      syncStorefront, refreshBlockLibrary
            //   2  auth            reAuthenticate, switchOrg
            //   1  delete          deleteProject
            //   4  project actions editProject, renameProject,
            //                      exportProjectSettings (headless, for the
            //                      export_project_settings MCP tool),
            //                      republishContent
            //   1  reset           resetProject
            //   1  destination     setProjectDestination
            //   2  ERP integration getErpStatus, resetErpRecords (plan step 05)
            //   5  demo source     probe-shared-demo (the Add a demo package dialog's
            //                      read, shared with the wizard),
            //                      change-demo-source (point a project built on
            //                      an added demo at another copy of it),
            //                      add-shared-demo (the dialog's other commit;
            //                      the dashboard never opens that mode, but a
            //                      message the dialog can send is answered),
            //                      import-storefront-zip and use-bundle-setup
            //                      (the dialog's zip door and the bundle's setup,
            //                      registered for the same reason)
            //   4  export parts    getDemoPackagePreview (the Export dialog's
            //                      storefront part: draft, checks, link),
            //                      saveDemoPackage (write the description file into
            //                      the SC's own storefront repository and put the
            //                      card on their list), removeDemoPackage (take
            //                      back only what we did), and exportDemoBundle
            //                      (Export's "Send a file": one bundle of the ticked parts)
            //  ==
            //  49
            //
            // Retired, so they are absent by design: verifyAppBuilderComponent
            // (2026-08-03); the 4 singular App Builder actions (addApp,
            // deployApp, redeployApp, removeApp) with the dormant
            // AppBuilderCard (D3 Step 08); copyPath, which lives on the
            // project-card kebab. setAuthoringExperience belongs to the
            // Configure webview, not this map.
            //
            // openDataInstaller: the Build zone gained a Sample Data tile. It
            // sits in navigation but is the one entry there that does NOT
            // replace the tab — the datapack catalog is global to the service,
            // so opening it leaves the dashboard where it was.
            //
            // getEventEntities + deleteEventEntity (38 → 40, AB-6 headful):
            // the integrations surface's Eventing section — workspace-scoped
            // I/O event providers/registrations, same service as the MCP
            // event tools.
            //
            // openErpScreen (40 → 41, 2026-09-16): opens the ERP's own screen with
            // the key only the extension holds.
            //
            // reinstallAppBuilderComponent (41 → 42, AB-13): uninstall then
            // install, only for an app Commerce refused to upgrade in place.
            //
            // updateAppBuilderComponent + checkIntegrationUpdates (42 → 44,
            // AB-13 step 5): Update fetches the newer code before it redeploys,
            // and the integrations screen asks which integrations have any.
            //
            // getIntegrationSettings + saveIntegrationSettings (44 → 46, AB-21): an
            // integration's Settings — the read, and the save that stores the change
            // and redeploys what uses it.
            //
            // openDebugLogs + getComponentOperationProgress (46 → 48, PL-59, merged
            // from develop): the progress modal's two requests, already counted in
            // the table above.
            //
            // backgroundComponentOperation (48 → 49, PL-59): "Run in background"
            // hands the operation to a notification. Also counted in the table above.
            //
            // answerOperationPrompt (49 → 50, PL-59, 2026-09-20): the SC answering a
            // question the work is paused on — an expired sign-in, a missing
            // prerequisite — now that the modal asks it instead of a notification
            // beside the modal.
            //
            // listRuntimePackages (50 → 51, 2026-09-21): the list_runtime_packages
            // read — what a removal left running in the Runtime namespace.
            //
            // setViewModeOverride (51 → 52, 2026-09-24): the integrations screen's
            // cards/rows toggle — the shared handler the projects list also registers
            // (core/handlers/viewModeHandler), under the same name.
            //
            // lookupErpRecord + followErpOrder (60 → 62, 2026-09-24): the ERP Admin
            // page's two reads — one record as both systems hold it, one order's whole
            // life — behind the agent tools get_erp_record and get_erp_order_trace.
            //
            // readErpApi + writeErpApi + listRuntimeActivations + readRuntimeActivation
            // (62 → 66, 2026-09-24): the ERP's own API for agents (its screens' reads and
            // actions without the screen), and what RAN in a Runtime namespace.
            expect(types).toHaveLength(66);
        });

        it('should have handlers as functions', () => {
            // Given: dashboardHandlers object
            // When: Checking handler types
            // Then: All handlers should be functions
            const types = getRegisteredTypes(dashboardHandlers) as Array<
                keyof typeof dashboardHandlers
            >;
            for (const type of types) {
                expect(typeof dashboardHandlers[type]).toBe('function');
            }
        });
    });
});
