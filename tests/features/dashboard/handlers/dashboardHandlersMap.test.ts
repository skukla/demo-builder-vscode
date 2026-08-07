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

        it('should have exactly 34 handlers', () => {
            // Given: dashboardHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(dashboardHandlers);

            // Then: Exactly 34 handlers
            // 1 init (requestStatus only; no 'ready') + 2 lifecycle + 9 navigation
            // (openBrowser, openLiveSite, openDaLive, openAdminPanel, configure,
            // openDevConsole, getProjectUrls, navigateBack, openIntegrations +
            // showProjectDashboard — the summary tile's route to the dedicated
            // surface and the surface's route back) + 1 mesh + 1
            // syncStorefront + 1 refreshBlockLibrary + 2 auth (reAuthenticate +
            // switchOrg) + 1 project + 1 reset = 18, plus the 4 More-menu actions
            // (editProject, exportProject, republishContent, renameProject) = 22
            // (copyPath removed — Copy Path lives on the project-card kebab),
            // plus the 5 appBuilderComponent (integrations list) actions
            // (addAppBuilderComponent, deployAppBuilderComponent,
            // redeployAppBuilderComponent, removeAppBuilderComponent,
            // renameAppBuilderComponent — shell instancing Step 10) = 27,
            // plus the 3 console-API actions
            // (listConsoleApis, addConsoleApis, setConsoleApis) = 30, plus the
            // headless exportProjectSettings (export_project_settings MCP tool) = 33.
            // verifyAppBuilderComponent retired 2026-08-03 (see above).
            // The 4 singular App Builder actions (addApp, deployApp, redeployApp,
            // removeApp) retired with the dormant AppBuilderCard (D3 Step 08).
            // setAuthoringExperience lives in the Configure webview, not this map.
            expect(types).toHaveLength(34);
        });

        it('should have handlers as functions', () => {
            // Given: dashboardHandlers object
            // When: Checking handler types
            // Then: All handlers should be functions
            const types = getRegisteredTypes(dashboardHandlers);
            for (const type of types) {
                expect(typeof dashboardHandlers[type]).toBe('function');
            }
        });
    });
});
