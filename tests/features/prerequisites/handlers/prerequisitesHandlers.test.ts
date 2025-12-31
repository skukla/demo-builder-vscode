/**
 * prerequisitesHandlers Tests
 *
 * Tests for the prerequisites feature handler map.
 * Verifies all required message types are present.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import { prerequisitesHandlers } from '@/features/prerequisites/handlers/prerequisitesHandlers';
import { hasHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';

describe('prerequisitesHandlers', () => {
    describe('handler registration', () => {
        it('should be defined as an object', () => {
            // Given: prerequisitesHandlers object
            // When: Checking type
            // Then: Should be a non-null object
            expect(prerequisitesHandlers).toBeDefined();
            expect(typeof prerequisitesHandlers).toBe('object');
            expect(prerequisitesHandlers).not.toBeNull();
        });

        it('should include all required message types', () => {
            // Given: prerequisitesHandlers object
            // When: Checking for required message types
            // Then: All 3 handlers present
            expect(hasHandler(prerequisitesHandlers, 'check-prerequisites')).toBe(true);
            expect(hasHandler(prerequisitesHandlers, 'continue-prerequisites')).toBe(true);
            expect(hasHandler(prerequisitesHandlers, 'install-prerequisite')).toBe(true);
        });

        it('should have exactly 3 handlers', () => {
            // Given: prerequisitesHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(prerequisitesHandlers);

            // Then: Exactly 3 handlers
            expect(types).toHaveLength(3);
        });

        it('should have handlers as functions', () => {
            // Given: prerequisitesHandlers object
            // When: Checking handler types
            // Then: All handlers should be functions
            expect(typeof prerequisitesHandlers['check-prerequisites']).toBe('function');
            expect(typeof prerequisitesHandlers['continue-prerequisites']).toBe('function');
            expect(typeof prerequisitesHandlers['install-prerequisite']).toBe('function');
        });
    });
});
