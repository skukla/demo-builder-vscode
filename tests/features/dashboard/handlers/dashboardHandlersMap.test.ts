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
            // Then: editProject, exportProject, republishContent, renameProject
            // present (copyPath removed — Copy Path lives on the project-card kebab)
            expect(hasHandler(dashboardHandlers, 'editProject')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'exportProject')).toBe(true);
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
            // Distinct from the UI 'exportProject' (save-dialog) More-menu action:
            // this is the path-based, dialog-free variant the agent tool dispatches.
            expect(hasHandler(dashboardHandlers, 'exportProjectSettings')).toBe(true);
        });

        it('should have exactly 38 handlers', () => {
            // Given: dashboardHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(dashboardHandlers) as Array<
                keyof typeof dashboardHandlers
            >;

            // Then: exactly 38, derived in the map's own declaration order so a
            // reader can check it against the source top to bottom.
            //
            // NOTE: the previous derivation did not add up — it said "9
            // navigation" while listing ten, and its running subtotals were off
            // by one from the first group onward. Rewritten rather than nudged.
            //
            //   1  init            requestStatus (no 'ready')
            //   3  lifecycle       startDemo, stopDemo, restartDemo
            //  11  navigation      openBrowser, openLiveSite, openDaLive,
            //                      openAdminPanel, configure, openDevConsole,
            //                      getProjectUrls, navigateBack,
            //                      openIntegrations, showProjectDashboard,
            //                      openDataInstaller
            //   1  mesh            deployMesh
            //   7  integrations    add/deploy/redeploy/remove/rename
            //                      AppBuilderComponent, plus the AB-5 pair:
            //                      installAppBuilderComponent (re-run the
            //                      Commerce install without a redeploy) and
            //                      getAppBuilderInstallStatus (live install
            //                      state read)
            //   3  console APIs    listConsoleApis, addConsoleApis, setConsoleApis
            //   2  storefront      syncStorefront, refreshBlockLibrary
            //   2  auth            reAuthenticate, switchOrg
            //   1  delete          deleteProject
            //   5  project actions editProject, renameProject, exportProject,
            //                      exportProjectSettings (headless twin, for the
            //                      export_project_settings MCP tool),
            //                      republishContent
            //   1  reset           resetProject
            //   1  destination     setProjectDestination
            //  ==
            //  38
            //
            // Retired, so they are absent by design: verifyAppBuilderComponent
            // (2026-08-03); the 4 singular App Builder actions (addApp,
            // deployApp, redeployApp, removeApp) with the dormant
            // AppBuilderCard (D3 Step 08); copyPath, which lives on the
            // project-card kebab. setAuthoringExperience belongs to the
            // Configure webview, not this map.
            //
            // openDataInstaller is the newest: the Build zone gained a Sample
            // Data tile. It sits in navigation but is the one entry there that
            // does NOT replace the tab — the datapack catalog is global to the
            // service, so opening it leaves the dashboard where it was.
            expect(types).toHaveLength(38);
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
