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

        it('should include EDS action handlers', () => {
            // Given: projectsListHandlers object
            // When: Checking for EDS action message types
            // Then: EDS action handlers present
            expect(hasHandler(projectsListHandlers, 'resetEds')).toBe(true);
            expect(hasHandler(projectsListHandlers, 'republishContent')).toBe(true);
        });

        it('should have exactly 19 handlers', () => {
            // Given: projectsListHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(projectsListHandlers);

            // Then: Exactly 19 handlers
            expect(types).toHaveLength(19);
        });

        it('should have handlers as functions', () => {
            // Given: projectsListHandlers object
            // When: Checking handler types
            // Then: All handlers should be functions
            const types = getRegisteredTypes(projectsListHandlers);
            for (const type of types) {
                expect(typeof projectsListHandlers[type]).toBe('function');
            }
        });
    });
});
