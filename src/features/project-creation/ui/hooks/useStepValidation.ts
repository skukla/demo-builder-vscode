/**
 * useStepValidation Hook
 *
 * Validates wizard steps based on the current wizard state.
 * Returns whether the step is valid and if the user can proceed.
 *
 * Note: This hook validates wizard step state (boolean existence checks),
 * NOT string field values. The core @/core/validation/Validator.ts validators
 * (url, pattern, required, etc.) are designed for string field validation.
 * The StepValidation type here serves a different purpose: determining
 * if a wizard step has been completed based on state conditions.
 *
 * @module features/project-creation/ui/hooks/useStepValidation
 */

import { useMemo } from 'react';
import type { WizardState } from '@/types/webview';

/**
 * Step validation result
 */
export interface StepValidation {
    /** Whether the step is valid */
    isValid: boolean;
    /** Whether the user can proceed to next step */
    canProceed: boolean;
}

/**
 * Validation functions for each step
 */
const STEP_VALIDATORS: Record<string, (state: WizardState) => boolean> = {
    'adobe-auth': (state) => state.adobeAuth?.isAuthenticated === true,
    'project-name': (state) => Boolean(state.projectName?.trim()),
    // Check for stack selection - stack is the source of truth for components
    'component-selection': (state) => Boolean(state.selectedStack),
    'adobe-project': (state) => Boolean(state.adobeProject),
    'adobe-workspace': (state) => Boolean(state.adobeWorkspace),
};

/**
 * Hook to validate wizard step based on state
 *
 * @param stepName - Name of the step to validate
 * @param state - Current wizard state
 * @returns StepValidation with isValid and canProceed flags
 *
 * @example
 * ```tsx
 * const { isValid, canProceed } = useStepValidation('adobe-auth', wizardState);
 *
 * return (
 *     <Button disabled={!canProceed}>Continue</Button>
 * );
 * ```
 */
export function useStepValidation(
    stepName: string,
    state: WizardState
): StepValidation {
    return useMemo(() => {
        const validator = STEP_VALIDATORS[stepName];

        // Unknown steps are considered valid by default
        if (!validator) {
            return { isValid: true, canProceed: true };
        }

        const isValid = validator(state);

        return {
            isValid,
            canProceed: isValid,
        };
    }, [stepName, state]);
}
