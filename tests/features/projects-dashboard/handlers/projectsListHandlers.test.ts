/**
 * projectsListHandlers Tests
 *
 * Tests for the projects-dashboard feature handler map.
 * Verifies all required message types are present.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import { projectsListHandlers } from '@/features/projects-dashboard/handlers/projectsListHandlers';
import { hasHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';

describe('projectsListHandlers', () => {
    describe('handler registration', () => {
        it('should be defined as an object', () => {
            // Given: projectsListHandlers object
            // When: Checking type
            // Then: Should be a non-null object
            expect(projectsListHandlers).toBeDefined();
            expect(typeof projectsListHandlers).toBe('object');
            expect(projectsListHandlers).not.toBeNull();
        });

        it('should include project loading handlers', () => {
            // Given: projectsListHandlers object
            // When: Checking for project loading message types
            // Then: Loading handlers present
            expect(hasHandler(projectsListHandlers, 'getProjects')).toBe(true);
        });

        it('should include project selection handler', () => {
            // Given: projectsListHandlers object
            // When: Checking for selection message types
            // Then: Selection handler present
            expect(hasHandler(projectsListHandlers, 'selectProject')).toBe(true);
        });

        it('should include project creation handler', () => {
            // Given: projectsListHandlers object
            // When: Checking for creation message types
            // Then: Creation handler present
            expect(hasHandler(projectsListHandlers, 'createProject')).toBe(true);
        });

        it('should include settings import/export handlers', () => {
            // Given: projectsListHandlers object
            // When: Checking for settings message types
            // Then: Settings handlers present
            expect(hasHandler(projectsListHandlers, 'importFromFile')).toBe(true);
            expect(hasHandler(projectsListHandlers, 'copyFromExisting')).toBe(true);
            expect(hasHandler(projectsListHandlers, 'exportProject')).toBe(true);
        });

        it('should include project deletion handler', () => {
            // Given: projectsListHandlers object
            // When: Checking for deletion message types
            // Then: Deletion handler present
            expect(hasHandler(projectsListHandlers, 'deleteProject')).toBe(true);
        });

        it('should include demo control handlers', () => {
            // Given: projectsListHandlers object
            // When: Checking for demo control message types
            // Then: Demo control handlers present
            expect(hasHandler(projectsListHandlers, 'startDemo')).toBe(true);
            expect(hasHandler(projectsListHandlers, 'stopDemo')).toBe(true);
            expect(hasHandler(projectsListHandlers, 'openBrowser')).toBe(true);
        });

        it('should include project edit handler', () => {
            // Given: projectsListHandlers object
            // When: Checking for edit message types
            // Then: Edit handler present
            expect(hasHandler(projectsListHandlers, 'editProject')).toBe(true);
        });

        it('should include utility handlers', () => {
            // Given: projectsListHandlers object
            // When: Checking for utility message types
            // Then: Utility handlers present
            expect(hasHandler(projectsListHandlers, 'openHelp')).toBe(true);
            expect(hasHandler(projectsListHandlers, 'openSettings')).toBe(true);
        });

        it('should include view mode handler', () => {
            // Given: projectsListHandlers object
            // When: Checking for view mode message types
            // Then: View mode handler present
            expect(hasHandler(projectsListHandlers, 'setViewModeOverride')).toBe(true);
        });

        it('should include the project reset handler', () => {
            expect(hasHandler(projectsListHandlers, 'resetProject')).toBe(true);
        });

        /**
         * The projects list routes NO per-component deploy.
         *
         * Each of these three retired the same way: the kebab item it served
         * moved to the surface that owns the component, leaving the message with
         * no sender. `redeployApp` went first (2026-08-04) when its items became
         * one route to the Integrations page. `redeployMesh` and
         * `republishContent` followed once the tile collapsed to a single
         * deployment line — the mesh's Redeploy already sat on the integrations
         * grid, and Republish Content already sat on the project dashboard's
         * ActionGrid.
         *
         * Registering one again means a deploy is being fired from a grid of
         * OTHER projects, with no log and no progress. Route to the owning
         * surface instead.
         */
        it.each(['redeployMesh', 'redeployApp', 'republishContent'])(
            'does not route %s',
            (type) => {
                expect(hasHandler(projectsListHandlers, type)).toBe(false);
            }
        );

        it('no longer routes copy-project-path', () => {
            // Copy Path left the project-card kebab — a developer affordance on a
            // grid used to PICK a demo, with the path one click away on the
            // dashboard — so the message has no sender.
            expect(hasHandler(projectsListHandlers, 'copy-project-path')).toBe(false);
        });

        it('should include openAi handler (E3)', () => {
            expect(hasHandler(projectsListHandlers, 'openAi')).toBe(true);
        });

        it('should include openAdminPanel handler', () => {
            expect(hasHandler(projectsListHandlers, 'openAdminPanel')).toBe(true);
        });

        it('does not register a setAuthoringExperience handler (relocated to Configure)', () => {
            expect(hasHandler(projectsListHandlers, 'setAuthoringExperience')).toBe(false);
        });

        it('should have exactly 21 handlers', () => {
            const types = getRegisteredTypes(projectsListHandlers) as Array<keyof typeof projectsListHandlers>;
            expect(types).toHaveLength(21);
        });

        it('should have handlers as functions', () => {
            // Given: projectsListHandlers object
            // When: Checking handler types
            // Then: All handlers should be functions
            const types = getRegisteredTypes(projectsListHandlers) as Array<keyof typeof projectsListHandlers>;
            for (const type of types) {
                expect(typeof projectsListHandlers[type]).toBe('function');
            }
        });
    });
});
