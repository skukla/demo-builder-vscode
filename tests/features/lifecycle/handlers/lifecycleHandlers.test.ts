/**
 * lifecycleHandlers Tests
 *
 * Tests for the lifecycle feature handler map.
 * Verifies all required message types are present.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import { lifecycleHandlers } from '@/features/lifecycle/handlers/lifecycleHandlers';
import { hasHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';

describe('lifecycleHandlers', () => {
    describe('handler registration', () => {
        it('should be defined as an object', () => {
            // Given: lifecycleHandlers object
            // When: Checking type
            // Then: Should be a non-null object
            expect(lifecycleHandlers).toBeDefined();
            expect(typeof lifecycleHandlers).toBe('object');
            expect(lifecycleHandlers).not.toBeNull();
        });

        it('should include core lifecycle handlers', () => {
            // Given: lifecycleHandlers object
            // When: Checking for core message types
            // Then: Core handlers present
            expect(hasHandler(lifecycleHandlers, 'ready')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'cancel')).toBe(true);
        });

        it('should include cancellation handlers', () => {
            // Given: lifecycleHandlers object
            // When: Checking for cancellation message types
            // Then: Cancellation handlers present
            expect(hasHandler(lifecycleHandlers, 'cancel-project-creation')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'cancel-mesh-creation')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'cancel-auth-polling')).toBe(true);
        });

        it('should include project action handlers', () => {
            // Given: lifecycleHandlers object
            // When: Checking for project action message types
            // Then: Project action handlers present
            expect(hasHandler(lifecycleHandlers, 'openProject')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'browseFiles')).toBe(true);
        });

        it('should include utility handlers', () => {
            // Given: lifecycleHandlers object
            // When: Checking for utility message types
            // Then: Utility handlers present
            expect(hasHandler(lifecycleHandlers, 'log')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'open-adobe-console')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'show-logs')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'openExternal')).toBe(true);
        });

        it('should have exactly 11 handlers', () => {
            // Given: lifecycleHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(lifecycleHandlers);

            // Then: Exactly 11 handlers
            expect(types).toHaveLength(11);
        });

        it('should have handlers as functions', () => {
            // Given: lifecycleHandlers object
            // When: Checking handler types
            // Then: All handlers should be functions
            const types = getRegisteredTypes(lifecycleHandlers);
            for (const type of types) {
                expect(typeof lifecycleHandlers[type]).toBe('function');
            }
        });
    });
});
