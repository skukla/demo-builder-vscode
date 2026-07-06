/**
 * integrationsSections — the Integrations area's sub-step model.
 *
 * The Integrations area is TWO sub-steps, mirroring Commerce:
 *   1. `deployables` ("Services") — the deployable list (mesh card + addable integrations).
 *   2. `adobe-io` ("Adobe I/O") — the shared Adobe I/O project + workspace (sign-in gate →
 *      project → workspace pick) every deployable reads.
 *
 * `adobe-io` is CONDITIONAL: it appears only once a deployable is selected, so an empty
 * Integrations area is just "Services" and is skippable. Because the workspace requirement
 * moved out of the Services list into its own sub-step, the area's Continue/Finish gate lives
 * on `adobe-io`: complete unless a deployable is selected without a fully-chosen Adobe I/O
 * project + workspace (committed OR pending). `deployables` is always valid.
 *
 * Pure logic only (no React) so the footer walk, the gate, and the shared driver can all
 * derive from it.
 *
 * @module features/project-creation/ui/steps/integrationsSections
 */

import { anyDeployableSelected, isAdobeSignedIn } from './tileStatus';
import type { IntegrationsSectionId, WizardState } from '@/types/webview';

export type { IntegrationsSectionId };

/** Completion / lock status of an Integrations section (no open/active highlight). */
export type IntegrationsSectionStatus = 'current' | 'done' | 'upcoming' | 'locked';

/** One ordered Integrations section's derived state. */
export interface IntegrationsSectionState {
    id: IntegrationsSectionId;
    status: IntegrationsSectionStatus;
    /** One-line reason shown on a `locked` section. */
    lockReason?: string;
}

/** Sub-step titles for the area nav. */
export const INTEGRATIONS_SECTION_TITLES: Record<IntegrationsSectionId, string> = {
    deployables: 'Services',
    'adobe-io': 'Adobe I/O',
};

/**
 * The ordered Integrations sub-step ids. Adobe I/O appears only once a deployable is
 * selected, so an empty Integrations area is just "Services".
 *
 * @param state - Wizard state (selections)
 * @returns the ordered sub-step ids
 */
function integrationsSectionOrder(state: WizardState): IntegrationsSectionId[] {
    return anyDeployableSelected(state) ? ['deployables', 'adobe-io'] : ['deployables'];
}

/**
 * The ordered Integrations section states. No locks — each sub-step is `done` when its
 * completion predicate holds, else `current`.
 *
 * @param state - Wizard state (selections + the chosen Adobe I/O project + workspace)
 * @returns the ordered sections with status
 */
export function integrationsSectionStates(state: WizardState): IntegrationsSectionState[] {
    return integrationsSectionOrder(state).map((id) => ({
        id,
        status: isIntegrationsStepComplete(state, id) ? ('done' as const) : ('current' as const),
    }));
}

/**
 * The per-sub-step completion predicate (the footer Continue/Finish gate):
 *   - `deployables` — always complete (the deployable list is always valid; the workspace
 *     requirement moved to the Adobe I/O sub-step).
 *   - `adobe-io` — complete when nothing is deployed (optional) OR the selected deployable's
 *     Adobe I/O target is fully set up: signed in to Adobe AND a project AND a workspace
 *     chosen (a COMMITTED `adobeWorkspace` OR a PENDING `pendingAdobeWorkspace`, so Continue
 *     enables while the default is still pending).
 *
 * NOTE: this predicate also drives the rail ✓ (via `integrationsSectionStates`), so a
 * pending workspace reads the step as done — intended (Continue commits the pending default).
 *
 * @param state - Wizard state
 * @param stepId - The sub-step to evaluate
 * @returns true when the sub-step is complete
 */
export function isIntegrationsStepComplete(
    state: WizardState,
    stepId: IntegrationsSectionId,
): boolean {
    switch (stepId) {
        case 'deployables':
            return true;
        case 'adobe-io':
            if (!anyDeployableSelected(state)) return true;
            return (
                isAdobeSignedIn(state) &&
                Boolean(state.adobeProject?.id) &&
                (Boolean(state.adobeWorkspace?.id) || Boolean(state.pendingAdobeWorkspace?.id))
            );
    }
}
