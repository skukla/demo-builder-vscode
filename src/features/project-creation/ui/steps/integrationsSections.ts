/**
 * integrationsSections — the Integrations area's sub-step model (mirrors storefrontSections).
 *
 * The Integrations area is walked one sub-step at a time, the same way Commerce and
 * Storefront are:
 *   1. `deployables` — the deployable list: the stack's API Mesh (toggle) + a dashed
 *                      "add an integration" affordance. Optional/terminal selection —
 *                      never gates Continue.
 *   2. `target`      — the ONE shared Adobe I/O deployment target (project + workspace)
 *                      for every deployable. CONDITIONAL: only present once a deployable
 *                      is selected ({@link anyDeployableSelected}); gate: both chosen.
 *
 * Pure logic only (no React) so the footer walk, the gate, and the VerticalStepList
 * nav can all derive from it. The active sub-step is `state.activeIntegrationsStep`.
 * `deployables` is always "done" (optional, like Commerce's catalog / Storefront's
 * block-libraries terminal step), so the sequential lock makes `target` the `current`
 * one whenever it applies.
 *
 * @module features/project-creation/ui/steps/integrationsSections
 */

import { anyDeployableSelected } from './tileStatus';
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

/** Sub-step titles for the vertical step list nav. */
export const INTEGRATIONS_SECTION_TITLES: Record<IntegrationsSectionId, string> = {
    deployables: 'Deployables',
    target: 'Deployment target',
};

/**
 * The ordered Integrations sub-step ids. `target` is omitted until a deployable is
 * selected — there is nothing to deploy (and so no target to pick) before then.
 */
function integrationsSectionOrder(state: WizardState): IntegrationsSectionId[] {
    return anyDeployableSelected(state) ? ['deployables', 'target'] : ['deployables'];
}

/**
 * The ordered Integrations section states with a sequential lock: each step is `done`
 * when its own complete-condition holds; otherwise the FIRST not-done step is
 * `current` and every step after it is `locked`. (`deployables` is always done, so
 * `target` — when present and unconfigured — is the `current` step.)
 *
 * @param state - Wizard state (selections + the chosen Adobe I/O target)
 * @returns the ordered sections with status / lockReason
 */
export function integrationsSectionStates(state: WizardState): IntegrationsSectionState[] {
    let currentReached = false;
    return integrationsSectionOrder(state).map((id) => {
        if (isIntegrationsStepComplete(state, id)) {
            return { id, status: 'done' as const };
        }
        if (!currentReached) {
            currentReached = true;
            return { id, status: 'current' as const };
        }
        return { id, status: 'locked' as const, lockReason: 'Complete the previous step first' };
    });
}

/**
 * Whether a single Integrations sub-step's done-condition is satisfied (the per-step
 * Continue gate): deployables → always (optional, the selection list); target → BOTH
 * an Adobe I/O project and a workspace are chosen.
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
        case 'target':
            return Boolean(state.adobeProject?.id) && Boolean(state.adobeWorkspace?.id);
    }
}
