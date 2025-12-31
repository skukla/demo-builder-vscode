/**
 * meshHandlers Tests
 *
 * Tests for the mesh feature handler map.
 * Verifies all required message types are present.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';
import { hasHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';

describe('meshHandlers', () => {
    describe('handler registration', () => {
        it('should be defined as an object', () => {
            // Given: meshHandlers object
            // When: Checking type
            // Then: Should be a non-null object
            expect(meshHandlers).toBeDefined();
            expect(typeof meshHandlers).toBe('object');
            expect(meshHandlers).not.toBeNull();
        });

        it('should include all required message types', () => {
            // Given: meshHandlers object
            // When: Checking for required message types
            // Then: All 3 handlers present
            expect(hasHandler(meshHandlers, 'check-api-mesh')).toBe(true);
            expect(hasHandler(meshHandlers, 'create-api-mesh')).toBe(true);
            expect(hasHandler(meshHandlers, 'delete-api-mesh')).toBe(true);
        });

        it('should have exactly 3 handlers', () => {
            // Given: meshHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(meshHandlers);

            // Then: Exactly 3 handlers
            expect(types).toHaveLength(3);
        });

        it('should have handlers as functions', () => {
            // Given: meshHandlers object
            // When: Checking handler types
            // Then: All handlers should be functions
            expect(typeof meshHandlers['check-api-mesh']).toBe('function');
            expect(typeof meshHandlers['create-api-mesh']).toBe('function');
            expect(typeof meshHandlers['delete-api-mesh']).toBe('function');
        });
    });
});
