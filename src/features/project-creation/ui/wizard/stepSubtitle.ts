/**
 * The step name shown in the wizard's header, in the mode's own words.
 *
 * Edit's last step is named for Create in wizard-steps.json, so an Edit that only
 * saved read "Edit Project — Create Project" (owner, 2026-10-17).
 *
 * @module features/project-creation/ui/wizard/stepSubtitle
 */

import type { WizardState } from '@/types/webview';

/**
 * @param stepId - the current step's id
 * @param stepName - its name from wizard-steps.json
 * @param mode - create, import or edit
 * @returns the name to show
 */
export function stepSubtitle(
    stepId: string,
    stepName: string | undefined,
    mode: WizardState['wizardMode'],
): string | undefined {
    if (mode === 'edit' && stepId === 'create-project') return 'Save Changes';
    return stepName;
}
