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
            // Removed 2026-08-06: the handler was a stub that always errored, and
            // the dialog's success path posted to it. Re-registering it without
            // implementing resume would restore a button that cannot work.
            expect(hasHandler(edsHandlers, 'storefront-setup-resume')).toBe(false);
        });

        it('should include the agent-facing refresh-block-library handler', () => {
            // Given: edsHandlers object
            // When: Checking for the headless block-library rebuild type
            // Then: Present (behind the refresh_block_library MCP tool)
            expect(hasHandler(edsHandlers, 'refresh-block-library')).toBe(true);
        });

        it('should include the agent-facing get-store-structure handler', () => {
            // Given: edsHandlers object
            // When: Checking for the headless store-structure read type
            // Then: Present (behind the get_store_structure MCP tool)
            expect(hasHandler(edsHandlers, 'get-store-structure')).toBe(true);
        });

        it('should have exactly 18 handlers', () => {
            // Given: edsHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(edsHandlers);

            // Then: 5 GitHub + 7 DA.live + 2 store discovery (wizard +
            // agent-facing get-store-structure) + 1 credential-service probe +
            // 2 Storefront Setup + 1 refresh-block-library = 18.
            // History: 20 → 14 when five superseded handlers were removed
            // 2026-08-05; 14 → 15 with get-store-structure; 15 → 16 with
            // check-credential-service; 16 → 18 with the DA.live clipboard
            // pair (check-dalive-clipboard, store-dalive-token-from-clipboard).
            expect(types).toHaveLength(18);
        });

        it('should have handlers as functions', () => {
            // Given: edsHandlers object
            // When: Checking handler types
            // Then: All handlers should be functions
            const types = getRegisteredTypes(edsHandlers) as Array<keyof typeof edsHandlers>;
            for (const type of types) {
                expect(typeof edsHandlers[type]).toBe('function');
            }
        });
    });
});
