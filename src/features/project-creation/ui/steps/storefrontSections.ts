/**
 * storefrontSections — the Storefront area's sub-step model (mirrors commerceSections).
 *
 * The Storefront area is walked one sub-step at a time, the same way Commerce is:
 *   1. `accounts`        — connect GitHub + DA.live (two independent, parallel sign-ins).
 *   2. `repository`      — pick/create the GitHub repo.
 *   3. `code-sync`       — install the AEM Code Sync GitHub App (existing repos pass).
 *   4. `block-libraries` — the optional EDS block-library picker (terminal).
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
    'code-sync': 'Code Sync',
    'block-libraries': 'Block Libraries',
};

/** The full ordered Storefront sub-step ids (canonical walk + nav order). */
const STOREFRONT_SECTION_ORDER: StorefrontSectionId[] = [
    'accounts',
    'repository',
    'code-sync',
    'block-libraries',
];

/**
 * The Storefront sub-steps for the current state.
 *
 * `code-sync` used to be filtered out for an existing repo, on the premise that only a
 * new repo has an app gate here — the existing-repo check was deferred to
 * StorefrontSetup, which runs after the pipeline has already written to the repository.
 * That deferral was removed on 2026-08-06: the check now runs at repo selection for
 * both modes.
 *
 * The step must therefore be VISIBLE in both. `isStorefrontConfigured` has always
 * required `storefrontCodeSyncValid` regardless of mode, so hiding the sub-step never
 * removed the gate — it removed the explanation, leaving an existing-repo user with a
 * Storefront area that silently refused to complete and no step to look at.
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
 * Every step is present in BOTH repo modes — {@link storefrontSectionOrder} returns
 * the full list unconditionally, and its docblock explains why the old filtering was
 * removed. What differs is whether `code-sync` can HOLD you: `computeCodeSyncValid`
 * demands a verified app install for a new repo, and is satisfied by any selected
 * repo for an existing one. So the same step is a gate in one mode and an
 * explanation in the other.
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
 * the repo reported valid; code-sync → the app gate reported valid; block-libraries →
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
        case 'code-sync':
            return state.storefrontCodeSyncValid === true;
        case 'block-libraries':
            return true;
    }
}
