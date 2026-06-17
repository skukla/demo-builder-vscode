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
            expect(hasHandler(dashboardHandlers, 'ready')).toBe(true);
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

        it('should include the new More-menu action handlers', () => {
            // Given: dashboardHandlers object
            // When: Checking for the new More-menu message types
            // Then: copyPath, exportProject, republishContent, renameProject present
            expect(hasHandler(dashboardHandlers, 'copyPath')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'exportProject')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'republishContent')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'renameProject')).toBe(true);
        });

        it('does not register a setAuthoringExperience handler (relocated to Configure)', () => {
            expect(hasHandler(dashboardHandlers, 'setAuthoringExperience')).toBe(false);
        });

        it('should have exactly 21 handlers', () => {
            // Given: dashboardHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(dashboardHandlers);

            // Then: Exactly 21 handlers
            // 2 init + 2 lifecycle + 6 navigation + 1 mesh + 1 syncStorefront +
            // 1 refreshBlockLibrary + 2 auth (reAuthenticate + switchOrg) +
            // 1 project + 1 reset = 17, plus the 4 new More-menu actions
            // (copyPath, exportProject, republishContent, renameProject) = 21.
            // setAuthoringExperience lives in the Configure webview, not this map;
            // openAi was removed with the dashboard AI tile.
            expect(types).toHaveLength(21);
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
