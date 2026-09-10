/**
 * Shared wizard-state fixtures for the areaSubSteps suites.
 *
 * The three Commerce shapes are the ones the generic walk helpers branch on, so both
 * suites need the same ones: a fresh project (the first sub-step is `current`), a
 * chosen backend (the first sub-step is `done` and the first OPEN one is later), and
 * a fully configured project (nothing is open, so the walk falls back to the last).
 */

import type { WizardState } from '@/types/webview';

/** Cast one partial state to the full shape the drivers read. */
export const state = (partial: Partial<WizardState>): WizardState => partial as WizardState;

export const PAAS_BACKEND = 'adobe-commerce-paas';
export const ACCS_BACKEND = 'adobe-commerce-accs';

/** Nothing chosen: `backend` is current, everything after it is upcoming or locked. */
export const FRESH = state({});

/** A backend is chosen: `backend` is done and `connection` is the first OPEN one. */
export const BACKEND_CHOSEN = state({ selectedBackend: PAAS_BACKEND });

/** Everything configured: every Commerce sub-step is done, so none is open. */
export const ALL_DONE = state({
    selectedBackend: PAAS_BACKEND,
    commerceConnectValid: true,
    commerceStoreViewChosen: true,
});

/** A storefront with both accounts connected, a repo picked and code sync valid. */
export const CONFIGURED_STOREFRONT = {
    storefrontRepoValid: true,
    storefrontCodeSyncValid: true,
    edsConfig: {
        repoName: 'my-repo',
        githubAuth: { isAuthenticated: true },
        daLiveAuth: { isAuthenticated: true },
    },
} as unknown as WizardState;
