/**
 * Helper functions for WizardContainer component (SOP §3, §4 compliance)
 */

import type { WizardStep, ComponentSelection } from '@/types/webview';

/**
 * Determine next button text based on wizard state
 *
 * Extracts nested ternary (SOP §3):
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

/**
 * Check if mesh component is selected in wizard state
 *
 * Extracts deep optional chaining (SOP §4):
 * `state.components?.dependencies?.includes('commerce-mesh') ?? false`
 */
export function hasMeshComponentSelected(components: ComponentSelection | undefined): boolean {
    return components?.dependencies?.includes('commerce-mesh') ?? false;
}

/**
 * Get indices of completed steps in the wizard step array
 *
 * Extracts inline array operations (SOP §4):
 * `completedSteps.map(s => WIZARD_STEPS.findIndex(ws => ws.id === s))`
 */
export function getCompletedStepIndices(
    completedSteps: WizardStep[],
    wizardSteps: Array<{ id: WizardStep; name: string }>
): number[] {
    return completedSteps.map(stepId => wizardSteps.findIndex(ws => ws.id === stepId));
}

/**
 * Filter and map wizard steps to only enabled steps
 *
 * Extracts filter+map chain (SOP §4):
 * `wizardSteps.filter(step => step.enabled).map(step => ({ id: step.id as WizardStep, name: step.name }))`
 */
export function getEnabledWizardSteps(
    wizardSteps: Array<{ id: string; name: string; enabled: boolean }> | undefined
): Array<{ id: WizardStep; name: string }> {
    if (!wizardSteps || wizardSteps.length === 0) {
        return [];
    }
    return wizardSteps
        .filter(step => step.enabled)
        .map(step => ({ id: step.id as WizardStep, name: step.name }));
}
