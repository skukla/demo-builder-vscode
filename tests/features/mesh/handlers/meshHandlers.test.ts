/**
 * meshHandlers Tests
 *
 * Tests for the mesh feature handler map.
 * Verifies all required message types are present.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';
import { handleEnsureMeshApiSubscribed } from '@/features/mesh/handlers/subscribeHandler';
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
            // Then: All handlers present
            expect(hasHandler(meshHandlers, 'check-api-mesh')).toBe(true);
            expect(hasHandler(meshHandlers, 'delete-api-mesh')).toBe(true);
            expect(hasHandler(meshHandlers, 'deploy-api-mesh')).toBe(true);
            expect(hasHandler(meshHandlers, 'ensure-mesh-api-subscribed')).toBe(true);
        });

        it('should have exactly 4 handlers', () => {
            // Given: meshHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(meshHandlers);

            // Then: check/delete/deploy/ensure-subscribe = 4. 'create-api-mesh'
            // was removed 2026-08-05 — a second mesh-creation implementation that
            // no webview ever sent; the wizard runs the wrapped deployNewMesh.
            expect(types).toHaveLength(4);
        });

        it('should have handlers as functions', () => {
            // Given: meshHandlers object
            // When: Checking handler types
            // Then: All handlers should be functions
            expect(typeof meshHandlers['check-api-mesh']).toBe('function');
            expect(typeof meshHandlers['delete-api-mesh']).toBe('function');
            expect(typeof meshHandlers['ensure-mesh-api-subscribed']).toBe('function');
        });

        it('should wire ensure-mesh-api-subscribed to handleEnsureMeshApiSubscribed', () => {
            expect(meshHandlers['ensure-mesh-api-subscribed']).toBe(handleEnsureMeshApiSubscribed);
        });
    });
});
