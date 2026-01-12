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

        it('should include authentication handlers', () => {
            // Given: dashboardHandlers object
            // When: Checking for authentication message types
            // Then: Authentication handlers present
            expect(hasHandler(dashboardHandlers, 're-authenticate')).toBe(true);
        });

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
            expect(hasHandler(dashboardHandlers, 'viewLogs')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'viewDebugLogs')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'configure')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'openDevConsole')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'navigateBack')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'viewComponents')).toBe(true);
        });

        it('should include mesh handlers', () => {
            // Given: dashboardHandlers object
            // When: Checking for mesh message types
            // Then: Mesh handlers present
            expect(hasHandler(dashboardHandlers, 'deployMesh')).toBe(true);
        });

        it('should include project management handlers', () => {
            // Given: dashboardHandlers object
            // When: Checking for project management message types
            // Then: Project management handlers present
            expect(hasHandler(dashboardHandlers, 'deleteProject')).toBe(true);
        });

        it('should include EDS handlers', () => {
            // Given: dashboardHandlers object
            // When: Checking for EDS message types
            // Then: EDS handlers present
            expect(hasHandler(dashboardHandlers, 'publishEds')).toBe(true);
            expect(hasHandler(dashboardHandlers, 'resetEds')).toBe(true);
        });

        it('should have exactly 18 handlers', () => {
            // Given: dashboardHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(dashboardHandlers);

            // Then: Exactly 18 handlers
            // 2 init + 1 auth + 2 lifecycle + 9 navigation + 1 mesh + 1 project + 2 EDS = 18
            expect(types).toHaveLength(18);
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
