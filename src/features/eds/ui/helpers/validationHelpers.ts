/**
 * Validation Helpers
 *
 * Utility functions for converting validation state to Spectrum TextField validationState.
 * These helpers eliminate nested ternary operators for cleaner, more readable code.
 */

/**
 * Get the Spectrum TextField validationState based on error and verified status.
 *
 * Logic:
 * - If error is truthy, return 'invalid'
 * - If verified is truthy, return 'valid'
 * - Otherwise, return undefined (neutral state)
 *
 * @param error - Error message (truthy = has error)
 * @param verified - Whether the field has been successfully verified
 * @returns 'invalid', 'valid', or undefined for Spectrum TextField validationState
 */
export function getValidationState(
    error: string | undefined,
    verified: boolean | undefined,
): 'invalid' | 'valid' | undefined {
    if (error) {
        return 'invalid';
    }
    if (verified) {
        return 'valid';
    }
    return undefined;
}
