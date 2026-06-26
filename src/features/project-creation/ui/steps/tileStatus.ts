/**
 * Config-tile status predicates (R1b — group-paced steps)
 *
 * Pure, side-effect-free predicates that decide whether a group-step config tile
 * is "configured" (✓) or still "needs setup" (⚠). They derive from PERSISTED
 * wizard state so a tile's badge and the step's Continue gate stay correct when
 * the modal is closed and across back/forward navigation.
 *
 * Each predicate combines persisted selections with the authoritative validity
 * verdict the modal body reports — `commerceConnectValid` (ConnectStoreStepContent's
 * onValidationChange) and `storefrontRepoValid` (RepoSelectionInline's
 * onValidityChange). The modal bodies own the live, fine-grained validation; these
 * predicates are the single source for the tile badge AND the step canProceed.
 *
 * This module also exposes `isAdobeSignedIn`, derived from the same persisted
 * state, used by the Commerce step's guided accordion gating.
 *
 * @module features/project-creation/ui/steps/tileStatus
 */

import type { WizardState } from '@/types/webview';

/**
 * Whether the Commerce area (architecture + connection) is fully configured.
 *
 * @param state - Wizard state
 * @returns true when a stack is selected AND the connect form reported valid
 */
export function isCommerceConfigured(state: WizardState): boolean {
    return Boolean(state.selectedStack) && state.commerceConnectValid === true;
}

/**
 * Whether the user is signed in to Adobe with an organization selected.
 *
 * @param state - Wizard state
 * @returns true when Adobe auth reports authenticated AND an org is selected
 */
export function isAdobeSignedIn(state: WizardState): boolean {
    return state.adobeAuth?.isAuthenticated === true && Boolean(state.adobeOrg);
}

/**
 * Whether the Storefront step's Storefront tile is fully configured.
 *
 * @param state - Wizard state
 * @returns true when GitHub + DA.live are authenticated AND both the repo and the
 *   AEM Code Sync app reported valid
 */
export function isStorefrontConfigured(state: WizardState): boolean {
    const eds = state.edsConfig;
    return (
        Boolean(eds?.githubAuth?.isAuthenticated) &&
        Boolean(eds?.daLiveAuth?.isAuthenticated) &&
        state.storefrontRepoValid === true &&
        state.storefrontCodeSyncValid === true
    );
}
