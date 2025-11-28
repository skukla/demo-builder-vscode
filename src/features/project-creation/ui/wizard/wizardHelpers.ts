/**
 * Helper functions for WizardContainer component (SOP §3 compliance)
 */

/**
 * Determine next button text based on wizard state
 *
 * Extracts nested ternary:
 * `isConfirmingSelection ? 'Continue' : (currentStepIndex === totalSteps - 2 ? 'Create Project' : 'Continue')`
 */
export function getNextButtonText(
    isConfirmingSelection: boolean,
    currentStepIndex: number,
    totalSteps: number
): string {
    if (isConfirmingSelection) return 'Continue';
    if (currentStepIndex === totalSteps - 2) return 'Create Project';
    return 'Continue';
}
