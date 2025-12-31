/**
 * edsHandlers Tests
 *
 * Tests for the EDS feature handler map.
 * Verifies all required message types are present.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import { hasHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';

describe('edsHandlers', () => {
    describe('handler registration', () => {
        it('should be defined as an object', () => {
            // Given: edsHandlers object
            // When: Checking type
            // Then: Should be a non-null object
            expect(edsHandlers).toBeDefined();
            expect(typeof edsHandlers).toBe('object');
            expect(edsHandlers).not.toBeNull();
        });

        it('should include GitHub handlers', () => {
            // Given: edsHandlers object
            // When: Checking for GitHub message types
            // Then: GitHub handlers present
            expect(hasHandler(edsHandlers, 'check-github-auth')).toBe(true);
            expect(hasHandler(edsHandlers, 'github-oauth')).toBe(true);
            expect(hasHandler(edsHandlers, 'github-change-account')).toBe(true);
            expect(hasHandler(edsHandlers, 'get-github-repos')).toBe(true);
            expect(hasHandler(edsHandlers, 'verify-github-repo')).toBe(true);
        });

        it('should include DA.live handlers', () => {
            // Given: edsHandlers object
            // When: Checking for DA.live message types
            // Then: DA.live handlers present
            expect(hasHandler(edsHandlers, 'check-dalive-auth')).toBe(true);
            expect(hasHandler(edsHandlers, 'dalive-oauth')).toBe(true);
            expect(hasHandler(edsHandlers, 'open-dalive-login')).toBe(true);
            expect(hasHandler(edsHandlers, 'store-dalive-token')).toBe(true);
            expect(hasHandler(edsHandlers, 'store-dalive-token-with-org')).toBe(true);
            expect(hasHandler(edsHandlers, 'clear-dalive-auth')).toBe(true);
            expect(hasHandler(edsHandlers, 'get-dalive-sites')).toBe(true);
            expect(hasHandler(edsHandlers, 'verify-dalive-org')).toBe(true);
        });

        it('should include ACCS handlers', () => {
            // Given: edsHandlers object
            // When: Checking for ACCS message types
            // Then: ACCS handlers present
            expect(hasHandler(edsHandlers, 'validate-accs-credentials')).toBe(true);
        });

        it('should have exactly 14 handlers', () => {
            // Given: edsHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(edsHandlers);

            // Then: Exactly 14 handlers (5 GitHub + 8 DA.live + 1 ACCS)
            expect(types).toHaveLength(14);
        });

        it('should have handlers as functions', () => {
            // Given: edsHandlers object
            // When: Checking handler types
            // Then: All handlers should be functions
            const types = getRegisteredTypes(edsHandlers);
            for (const type of types) {
                expect(typeof edsHandlers[type]).toBe('function');
            }
        });
    });
});
