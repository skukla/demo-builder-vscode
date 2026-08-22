/**
 * Step Filtering
 *
 * Utility functions for filtering wizard steps based on stack requirements.
 * Used to show/hide conditional steps like GitHub auth and DA.live setup.
 */

import type { Stack } from '@/types/stacks';
import type { StepCondition } from '@/types/wizard';

/**
 * Wizard step with optional condition for filtering
 */
export interface WizardStepWithCondition {
    /** Unique step identifier */
    id: string;

    /** Display name for the step */
    name: string;

    /** Optional description for the step */
    description?: string;

    /** Optional condition for showing this step */
    condition?: StepCondition;
}

/**
 * Filter options for step filtering
 */
export interface FilterOptions {
    /** Whether the wizard is in edit mode (editing existing project) */
    isEditMode?: boolean;
}

/**
 * Filter wizard steps based on stack requirements and wizard mode
 *
 * Returns only the steps that should be shown for the given stack.
 * - Steps without conditions are always included
 * - Steps with conditions are included only if the stack has the required property set to true
 * - If no stack is selected, only unconditional steps are returned
 * - Steps with createModeOnly are hidden in edit mode
 *
 * @param steps - Array of wizard steps with optional conditions
 * @param stack - The selected stack, or undefined if none selected
 * @param options - Additional filter options (isEditMode, etc.)
 * @returns Filtered array of steps to show
 */
export function filterStepsForStack(
    steps: WizardStepWithCondition[],
    stack: Stack | undefined,
    options: FilterOptions = {},
): WizardStepWithCondition[] {
    const { isEditMode = false } = options;

    // Helper to check if step should be hidden due to createModeOnly in edit mode
    const isHiddenInEditMode = (step: WizardStepWithCondition): boolean => {
        return isEditMode && step.condition?.createModeOnly === true;
    };

    // If no stack selected, show:
    // - Steps without conditions (always shown)
    // - Steps with showWhenNoStack: true (for manual component selection)
    // Hide steps that require specific stack properties (requiresGitHub, etc.)
    // Hide createModeOnly steps in edit mode
    if (!stack) {
        return steps.filter((step) => {
            if (isHiddenInEditMode(step)) return false;
            if (!step.condition) return true;
            if (step.condition.showWhenNoStack) return true;
            return false;
        });
    }

    return steps.filter((step) => {
        // Hide createModeOnly steps in edit mode
        if (isHiddenInEditMode(step)) {
            return false;
        }

        // Steps without conditions are always shown
        if (!step.condition) {
            return true;
        }

        const { stackRequires, stackRequiresAny, showWhenNoStack } = step.condition;

        // Steps with showWhenNoStack are only shown when no stack is selected
        // (already handled above - if we get here, a stack IS selected, so hide it)
        if (showWhenNoStack) {
            return false;
        }

        // Check if the stack has the required property set to true
        if (stackRequires) {
            return Boolean(stack[stackRequires]);
        }

        // Check if ANY of the listed stack properties is true
        if (stackRequiresAny && stackRequiresAny.length > 0) {
            return stackRequiresAny.some((prop) => Boolean(stack[prop]));
        }

        return true;
    });
}
