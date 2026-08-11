/**
 * Validation State
 *
 * Maps a field's error + confirmed-good signal onto Spectrum's `validationState` prop,
 * so the tri-state lives in one place instead of a nested ternary at each TextField.
 *
 * Promoted to core on 2026-08-10: this existed THREE times — here (under
 * `features/eds/ui/helpers`, imported by nothing but its own test), as a closure inside
 * `VerifiedField`, and again in the Configure screen. Same five lines each time.
 * `WelcomeStep.getProjectNameValidationState` is deliberately NOT folded in: it derives
 * the error itself and treats "defined but untouched" as valid, which is a different rule.
 *
 * @module core/ui/utils/validationState
 */

/**
 * Get the Spectrum TextField validationState.
 *
 * - error truthy → 'invalid'
 * - else isValid truthy → 'valid'
 * - else undefined (neutral — the field has not earned either mark yet)
 *
 * @param error - Error message (truthy = has error)
 * @param isValid - Whether the field is confirmed good (verified, or touched-and-clean)
 * @returns 'invalid', 'valid', or undefined for Spectrum TextField validationState
 */
export function getValidationState(
    error: string | undefined,
    isValid: boolean | undefined,
): 'invalid' | 'valid' | undefined {
    if (error) {
        return 'invalid';
    }
    if (isValid) {
        return 'valid';
    }
    return undefined;
}
