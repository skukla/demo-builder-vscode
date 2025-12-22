/**
 * Step Filtering
 *
 * Utility functions for filtering wizard steps based on stack requirements.
 * Used to show/hide conditional steps like GitHub auth and DA.live setup.
 */

import type { Stack } from '@/types/stacks';

/**
 * Condition for showing a wizard step
 */
export interface StepCondition {
    /**
     * Stack property that must be truthy for this step to be shown.
     * Maps to Stack properties like 'requiresGitHub' or 'requiresDaLive'.
     */
    stackRequires?: 'requiresGitHub' | 'requiresDaLive';

    /**
     * Array of stack properties where at least ONE must be truthy.
     * Used for combined steps that should show when GitHub OR DA.live is required.
     */
    stackRequiresAny?: Array<'requiresGitHub' | 'requiresDaLive'>;

    /**
     * If true, this step is only shown when NO predefined stack is selected.
     * Used for steps like Component Selection that are hidden when a stack
     * already determines the components, but should appear for a future
     * "Custom" option where users manually select components.
     *
     * NOTE: This condition is deliberately kept for future extensibility.
     * When a "Custom" brand option is added, it won't set selectedStack,
     * allowing this step to appear for manual component configuration.
     */
    showWhenNoStack?: boolean;
}

/**
 * Wizard step with optional condition for filtering
 */
export interface WizardStepWithCondition {
    /** Unique step identifier */
    id: string;

    /** Display name for the step */
    name: string;

    /** Optional condition for showing this step */
    condition?: StepCondition;
}

/**
 * Filter wizard steps based on stack requirements
 *
 * Returns only the steps that should be shown for the given stack.
 * - Steps without conditions are always included
 * - Steps with conditions are included only if the stack has the required property set to true
 * - If no stack is selected, only unconditional steps are returned
 *
 * @param steps - Array of wizard steps with optional conditions
 * @param stack - The selected stack, or undefined if none selected
 * @returns Filtered array of steps to show
 */
export function filterStepsForStack(
    steps: WizardStepWithCondition[],
    stack: Stack | undefined,
): WizardStepWithCondition[] {
    // If no stack selected, show:
    // - Steps without conditions (always shown)
    // - Steps with showWhenNoStack: true (for manual component selection)
    // Hide steps that require specific stack properties (requiresGitHub, etc.)
    if (!stack) {
        return steps.filter(step => {
            if (!step.condition) return true;
            if (step.condition.showWhenNoStack) return true;
            return false;
        });
    }

    return steps.filter(step => {
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
            return stackRequiresAny.some(prop => Boolean(stack[prop]));
        }

        return true;
    });
}
