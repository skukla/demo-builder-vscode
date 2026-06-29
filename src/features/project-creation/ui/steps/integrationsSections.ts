/**
 * integrationsSections — the Integrations area's sub-step model (mirrors storefrontSections).
 *
 * The Integrations area is walked one sub-step at a time, the same way Commerce and
 * Storefront are:
 *   1. `deployables` — the deployable list ("Services"): the stack's API Mesh (toggle) +
 *                      a dashed "add an integration" affordance. Optional/terminal
 *                      selection — never gates Continue.
 *   2. `signin`      — Adobe sign-in ("Sign in"). CONDITIONAL: only for backends with no
 *                      earlier sign-in (i.e. NOT ACCS, which signs in at Commerce), and
 *                      only once a deployable is selected. Gate: signed in.
 *   3. `target`      — the ONE shared Adobe I/O destination ("Destination": project +
 *                      workspace) for every deployable. CONDITIONAL: only once a
 *                      deployable is selected ({@link anyDeployableSelected}); gate: both chosen.
 *
 * Pure logic only (no React) so the footer walk, the gate, and the VerticalStepList
 * nav can all derive from it. The active sub-step is `state.activeIntegrationsStep`.
 * `deployables` is always "done" (optional, like Commerce's catalog / Storefront's
 * block-libraries terminal step), so the sequential lock makes `signin` (or `target`)
 * the `current` one whenever it applies.
 *
 * @module features/project-creation/ui/steps/integrationsSections
 */

import { anyDeployableSelected, isAdobeSignedIn } from './tileStatus';
import type { IntegrationsSectionId, WizardState } from '@/types/webview';

export type { IntegrationsSectionId };

/** Backend whose flow signs in earlier (Commerce's `signin` sub-step). */
const ACCS_BACKEND = 'adobe-commerce-accs';

/** Completion / lock status of an Integrations section (no open/active highlight). */
export type IntegrationsSectionStatus = 'current' | 'done' | 'upcoming' | 'locked';

/** One ordered Integrations section's derived state. */
export interface IntegrationsSectionState {
    id: IntegrationsSectionId;
    status: IntegrationsSectionStatus;
    /** One-line reason shown on a `locked` section. */
    lockReason?: string;
}

/** Sub-step titles for the vertical step list nav. (Internal ids stay deployables/target.) */
export const INTEGRATIONS_SECTION_TITLES: Record<IntegrationsSectionId, string> = {
    deployables: 'Services',
    signin: 'Sign in',
    target: 'Destination',
};

/**
 * The ordered Integrations sub-step ids.
 *  - `signin`/`target` are omitted until a deployable is selected (nothing deploys → no
 *    Adobe I/O target needed yet).
 *  - `signin` is inserted before `target` ONLY for backends with no earlier Adobe
 *    sign-in: ACCS signs in at the Commerce `signin` sub-step, so it's skipped here;
 *    PaaS (and others) sign in here. Presence keys off the STABLE backend, NOT
 *    `signedIn`, so the step never vanishes mid-flow (which would break the footer
 *    next()/prev() walk past it).
 */
function integrationsSectionOrder(state: WizardState): IntegrationsSectionId[] {
    if (!anyDeployableSelected(state)) return ['deployables'];
    const needsSignin = state.selectedBackend !== ACCS_BACKEND;
    return needsSignin ? ['deployables', 'signin', 'target'] : ['deployables', 'target'];
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
 * Continue gate): deployables → always (optional, the selection list); signin → signed
 * in to Adobe with an org; target → BOTH an Adobe I/O project and a workspace are chosen.
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
        case 'signin':
            return isAdobeSignedIn(state);
        case 'target':
            return Boolean(state.adobeProject?.id) && Boolean(state.adobeWorkspace?.id);
    }
}
