/**
 * storefrontSections — the Storefront area's sub-step model (mirrors commerceSections).
 *
 * The Storefront area is walked one sub-step at a time, the same way Commerce is:
 *   1. `storefront`      — the setup (GitHub → DA.live → repo). Gates Continue on
 *                          {@link isStorefrontConfigured}.
 *   2. `block-libraries` — the optional EDS block-library picker. Locked until the
 *                          storefront is configured, then always passable (terminal).
 *
 * Pure logic only (no React) so the footer walk, the gate, and the VerticalStepList
 * nav can all derive from it. The active sub-step is `state.activeStorefrontStep`.
 *
 * @module features/project-creation/ui/steps/storefrontSections
 */

import { isStorefrontConfigured } from './tileStatus';
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
    storefront: 'Storefront',
    'block-libraries': 'Block Libraries',
};

/**
 * The ordered Storefront section states. `storefront` is current until the setup
 * is complete, then `done`; `block-libraries` is locked until then, then current.
 */
export function storefrontSectionStates(state: WizardState): StorefrontSectionState[] {
    const configured = isStorefrontConfigured(state);
    return [
        { id: 'storefront', status: configured ? 'done' : 'current' },
        configured
            ? { id: 'block-libraries', status: 'current' }
            : {
                id: 'block-libraries',
                status: 'locked',
                lockReason: 'Set up the storefront repository first',
            },
    ];
}

/**
 * Whether a single Storefront sub-step's done-condition is satisfied (the per-step
 * Continue gate): storefront → the setup is configured; block-libraries → always
 * (optional, terminal — Continue advances to the next area).
 */
export function isStorefrontStepComplete(state: WizardState, stepId: StorefrontSectionId): boolean {
    switch (stepId) {
        case 'storefront':
            return isStorefrontConfigured(state);
        case 'block-libraries':
            return true;
    }
}
