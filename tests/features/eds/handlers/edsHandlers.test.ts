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
        });

        it('should include DA.live handlers', () => {
            // Given: edsHandlers object
            // When: Checking for DA.live message types
            // Then: DA.live handlers present
            expect(hasHandler(edsHandlers, 'check-dalive-auth')).toBe(true);
            expect(hasHandler(edsHandlers, 'open-dalive-login')).toBe(true);
            expect(hasHandler(edsHandlers, 'store-dalive-token')).toBe(true);
            expect(hasHandler(edsHandlers, 'store-dalive-token-with-org')).toBe(true);
            expect(hasHandler(edsHandlers, 'clear-dalive-auth')).toBe(true);
        });

        it('should include ACCS handlers', () => {
            // Given: edsHandlers object
            // When: Checking for ACCS message types
            // Then: ACCS handlers present
            expect(hasHandler(edsHandlers, 'discover-store-structure')).toBe(true);
        });

        it('should include storefront setup handlers', () => {
            // Given: edsHandlers object
            // When: Checking for storefront setup message types
            // Then: Storefront setup handlers present
            expect(hasHandler(edsHandlers, 'storefront-setup-start')).toBe(true);
            expect(hasHandler(edsHandlers, 'storefront-setup-cancel')).toBe(true);
            expect(hasHandler(edsHandlers, 'storefront-setup-resume')).toBe(true);
        });

        it('should include the agent-facing refresh-block-library handler', () => {
            // Given: edsHandlers object
            // When: Checking for the headless block-library rebuild type
            // Then: Present (behind the refresh_block_library MCP tool)
            expect(hasHandler(edsHandlers, 'refresh-block-library')).toBe(true);
        });

        it('should have exactly 20 handlers', () => {
            // Given: edsHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(edsHandlers);

            // Then: Exactly 20 handlers (6 GitHub + 8 DA.live + 2 ACCS/Store +
            // 3 Storefront Setup + 1 refresh-block-library)
            // 20 → 15: five superseded handlers removed 2026-08-05 (nothing sent them).
            expect(types).toHaveLength(15);
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
