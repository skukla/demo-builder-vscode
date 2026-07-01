/**
 * integrationsSections — the Integrations area's sub-step model.
 *
 * The Integrations area is a SINGLE screen ("Services"): the deployable list. The stack's
 * API Mesh renders as a card that, when added, expands inline to host its Adobe I/O
 * destination (sign-in gate → project + workspace) — so the former separate `signin` /
 * `target` sub-steps are dissolved into the card. Only `deployables` remains.
 *
 * Pure logic only (no React) so the footer walk, the gate, and the shared driver can all
 * derive from it. Because a deployable's destination is configured IN the card, the
 * area's Continue/Finish gate lives here: `deployables` is complete unless a deployable
 * is selected without a fully-chosen Adobe I/O destination.
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

/** Sub-step titles for the area nav. Only the single "Services" screen remains. */
export const INTEGRATIONS_SECTION_TITLES: Record<IntegrationsSectionId, string> = {
    deployables: 'Services',
};

/** The ordered Integrations sub-step ids — a single "Services" screen. */
function integrationsSectionOrder(_state: WizardState): IntegrationsSectionId[] {
    return ['deployables'];
}

/**
 * The ordered Integrations section states. With a single sub-step, `deployables` is the
 * `current` step until its gate is satisfied, then `done`.
 *
 * @param state - Wizard state (selections + the chosen Adobe I/O destination)
 * @returns the ordered sections with status
 */
export function integrationsSectionStates(state: WizardState): IntegrationsSectionState[] {
    return integrationsSectionOrder(state).map((id) => ({
        id,
        status: isIntegrationsStepComplete(state, id) ? ('done' as const) : ('current' as const),
    }));
}

/**
 * The Integrations Continue/Finish gate. `deployables` is complete when nothing is
 * deployed (optional) OR the selected deployable's Adobe I/O destination is fully set up:
 * signed in to Adobe with an org AND a project AND a workspace chosen (all configured in
 * the mesh card).
 *
 * @param state - Wizard state
 * @param stepId - The sub-step to evaluate (always `deployables`)
 * @returns true when the sub-step is complete
 */
export function isIntegrationsStepComplete(
    state: WizardState,
    stepId: IntegrationsSectionId,
): boolean {
    switch (stepId) {
        case 'deployables':
            if (!anyDeployableSelected(state)) return true;
            return (
                isAdobeSignedIn(state) &&
                Boolean(state.adobeProject?.id) &&
                Boolean(state.adobeWorkspace?.id)
            );
    }
}
