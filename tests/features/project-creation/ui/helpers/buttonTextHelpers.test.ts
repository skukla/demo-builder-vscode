/**
 * Button Text Helpers Tests
 *
 * Tests for getCancelButtonText helper that eliminates nested ternary operators.
 * Follows TDD methodology - tests written BEFORE implementation.
 *
 * This helper determines the appropriate button text based on the creation phase.
 */

import { getCancelButtonText } from '@/features/project-creation/ui/helpers/buttonTextHelpers';

describe('buttonTextHelpers', () => {
    describe('getCancelButtonText', () => {
        it('should return "Back" when checking mesh', () => {
            // Given: Currently in the mesh checking phase
            const isCheckingMesh = true;
            const isCancelling = false;

            // When: Getting the cancel button text
            const result = getCancelButtonText(isCheckingMesh, isCancelling);

            // Then: Should return 'Back'
            expect(result).toBe('Back');
        });

        it('should return "Back" when checking mesh even if cancelling', () => {
            // Given: In mesh checking phase AND cancelling (edge case)
            const isCheckingMesh = true;
            const isCancelling = true;

            // When: Getting the cancel button text
            const result = getCancelButtonText(isCheckingMesh, isCancelling);

            // Then: Should return 'Back' (mesh check takes precedence)
            expect(result).toBe('Back');
        });

        it('should return "Cancelling..." when not checking mesh and is cancelling', () => {
            // Given: Not in mesh check phase and cancellation in progress
            const isCheckingMesh = false;
            const isCancelling = true;

            // When: Getting the cancel button text
            const result = getCancelButtonText(isCheckingMesh, isCancelling);

            // Then: Should return 'Cancelling...'
            expect(result).toBe('Cancelling...');
        });

        it('should return "Cancel" when not checking mesh and not cancelling', () => {
            // Given: Active creation phase (not mesh check, not cancelling)
            const isCheckingMesh = false;
            const isCancelling = false;

            // When: Getting the cancel button text
            const result = getCancelButtonText(isCheckingMesh, isCancelling);

            // Then: Should return 'Cancel'
            expect(result).toBe('Cancel');
        });

        it('should handle undefined values as falsy', () => {
            // Given: Both values are undefined (treated as falsy)
            const isCheckingMesh = undefined as unknown as boolean;
            const isCancelling = undefined as unknown as boolean;

            // When: Getting the cancel button text
            const result = getCancelButtonText(isCheckingMesh, isCancelling);

            // Then: Should return 'Cancel' (both falsy)
            expect(result).toBe('Cancel');
        });
    });
});
