/**
 * storefrontSections — the Storefront area's sub-step model (mirrors commerceSections).
 *
 * The Storefront area is walked one sub-step at a time, the same way Commerce is:
 *   1. `accounts`        — connect GitHub + DA.live (two independent, parallel sign-ins).
 *   2. `repository`      — pick/create the GitHub repo.
 *   3. `block-libraries` — the optional EDS block-library picker (terminal).
 *
 * There is no Code Sync sub-step (removed 2026-09-25). Adobe's status endpoint reports on a
 * SITE, which nothing before setup creates, so before setup the App question has no answer
 * for a new repository and GitHub offers no other oracle to a user token. Setup asks it at
 * the two moments it can be answered (phase 1 before the first write, phase 3 after the site
 * is registered) and shows the install dialog there.
 *
 * Pure logic only (no React) so the footer walk, the gate, and the StepRail
 * nav can all derive from it. The active sub-step is `state.activeStorefrontStep`.
 * Lock is sequential: the first not-done step is `current`, every step after it is
 * `locked`, and every done step before it stays `done` (no commit-gating, no context).
 *
 * @module features/project-creation/ui/steps/storefrontSections
 */

import type { StorefrontSectionId, WizardState } from '@/types/webview';

export type { StorefrontSectionId };

/** Completion / lock status of a Storefront section (no open/active highlight). */
export type StorefrontSectionStatus = 'current' | 'done' | 'upcoming' | 'locked';

/** One ordered Storefront section's derived state. */
export interface StorefrontSectionState {
    id: StorefrontSectionId;
    status: StorefrontSectionStatus;
    /** One-line reason shown on a `locked` section. */
    lockReason?: string;
}

/** Sub-step titles for the vertical step list nav. */
export const STOREFRONT_SECTION_TITLES: Record<StorefrontSectionId, string> = {
    accounts: 'Accounts',
    repository: 'Repository',
    'block-libraries': 'Block Libraries',
};

/** The full ordered Storefront sub-step ids (canonical walk + nav order). */
const STOREFRONT_SECTION_ORDER: StorefrontSectionId[] = [
    'accounts',
    'repository',
    'block-libraries',
];

/**
 * The Storefront sub-steps for the current state — the same three in both repo modes.
 *
 * @param state - Wizard state
 * @returns the ordered sub-step ids
 */
export function storefrontSectionOrder(_state: WizardState): StorefrontSectionId[] {
    return [...STOREFRONT_SECTION_ORDER];
}

/**
 * The ordered Storefront section states with a sequential lock: each step is `done`
 * when its own complete-condition holds; otherwise the FIRST not-done step is
 * `current` and every step after it is `locked`. Done steps before the current one
 * stay `done`.
 *
 * @param state - Wizard state (persisted selections + validity verdicts)
 * @returns the ordered sections with status / lockReason
 */
export function storefrontSectionStates(state: WizardState): StorefrontSectionState[] {
    let currentReached = false;
    return storefrontSectionOrder(state).map((id) => {
        if (isStorefrontStepComplete(state, id)) {
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
 * Whether a single Storefront sub-step's done-condition is satisfied (the per-step
 * Continue gate): accounts → BOTH GitHub and DA.live are authenticated; repository →
 * the repo reported valid; block-libraries →
 * always (optional, terminal — Continue advances to the next area).
 *
 * @param state - Wizard state (persisted selections + validity verdicts)
 * @param stepId - The sub-step to evaluate
 * @returns true when the sub-step is complete
 */
export function isStorefrontStepComplete(state: WizardState, stepId: StorefrontSectionId): boolean {
    switch (stepId) {
        case 'accounts':
            return (
                Boolean(state.edsConfig?.githubAuth?.isAuthenticated) &&
                Boolean(state.edsConfig?.daLiveAuth?.isAuthenticated)
            );
        case 'repository':
            return state.storefrontRepoValid === true;
        case 'block-libraries':
            return true;
    }
}
