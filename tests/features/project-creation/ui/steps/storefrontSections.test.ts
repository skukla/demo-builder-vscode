/**
 * storefrontSections tests — the Storefront area's 4 sub-step model: connect
 * Accounts (GitHub + DA.live), pick/create the repo, install AEM Code Sync, then
 * the optional block-libraries picker. Sequential lock: the first not-done step is
 * `current`, later ones `locked`, earlier done ones `done`.
 */

import {

    storefrontSectionStates,
    isStorefrontStepComplete,
    STOREFRONT_SECTION_TITLES,
} from '@/features/project-creation/ui/steps/storefrontSections';
import type { WizardState } from '@/types/webview';

/** A fully-configured storefront (github + dalive auth + valid repo + code sync). */
const CONFIGURED = {
    storefrontRepoValid: true,
    edsConfig: {
        repoName: 'my-repo',
        githubAuth: { isAuthenticated: true },
        daLiveAuth: { isAuthenticated: true },
    },
} as unknown as WizardState;

const UNCONFIGURED = {} as WizardState;

/** Both accounts connected but nothing else (so `repository` is the first not-done step). */
const ACCOUNTS_DONE = {
    edsConfig: {
        githubAuth: { isAuthenticated: true },
        daLiveAuth: { isAuthenticated: true },
    },
} as unknown as WizardState;

/** A NEW-repo flow — the only case where the Code Sync sub-step applies. */
const NEW_REPO = { edsConfig: { repoMode: 'new' } } as unknown as WizardState;

describe('STOREFRONT_SECTION_TITLES', () => {
    it('titles each of the 3 sub-steps', () => {
        expect(STOREFRONT_SECTION_TITLES).toEqual({
            accounts: 'Accounts',
            repository: 'Repository',
            'block-libraries': 'Block Libraries',
        });
    });
});

describe('storefrontSectionStates', () => {
    it('lists the 3 sub-steps for an existing repo', () => {
        // Changed 2026-08-06: Code Sync is present in BOTH modes. The existing-repo
        // check moved from mid-pipeline (after the repo had been written to) to repo
        const states = storefrontSectionStates(UNCONFIGURED);
        expect(states.map(s => s.id)).toEqual([
            'accounts',
            'repository',
            'block-libraries',
        ]);
    });

    it('lists the same 3 sub-steps for a NEW repo', () => {
        const states = storefrontSectionStates(NEW_REPO);
        expect(states.map(s => s.id)).toEqual([
            'accounts',
            'repository',
            'block-libraries',
        ]);
    });

    it('starts on accounts as current with the next required step locked', () => {
        const states = storefrontSectionStates(UNCONFIGURED);
        expect(states[0].status).toBe('current'); // accounts
        expect(states[1].status).toBe('locked'); // repository
        expect(states[1].lockReason).toMatch(/previous step/i);
    });

    it('marks accounts done and advances current to repository once both are authed', () => {
        const states = storefrontSectionStates(ACCOUNTS_DONE);
        expect(states[0].status).toBe('done'); // accounts
        expect(states[1].status).toBe('current'); // repository
        expect(states[1].lockReason).toBeUndefined();
    });

    it('marks every step done when fully configured', () => {
        const states = storefrontSectionStates(CONFIGURED);
        expect(states.every(s => s.status === 'done')).toBe(true);
    });
});

describe('isStorefrontStepComplete', () => {
    it('gates accounts on BOTH GitHub and DA.live auth', () => {
        expect(isStorefrontStepComplete(UNCONFIGURED, 'accounts')).toBe(false);
        // GitHub-only is NOT enough — both must be connected.
        const githubOnly = {
            edsConfig: { githubAuth: { isAuthenticated: true } },
        } as unknown as WizardState;
        expect(isStorefrontStepComplete(githubOnly, 'accounts')).toBe(false);
        expect(isStorefrontStepComplete(ACCOUNTS_DONE, 'accounts')).toBe(true);
        expect(isStorefrontStepComplete(CONFIGURED, 'accounts')).toBe(true);
    });

    it('gates repository on storefrontRepoValid', () => {
        expect(isStorefrontStepComplete(UNCONFIGURED, 'repository')).toBe(false);
        expect(
            isStorefrontStepComplete({ storefrontRepoValid: true } as WizardState, 'repository'),
        ).toBe(true);
    });

    it('treats block-libraries as always complete (optional/terminal)', () => {
        expect(isStorefrontStepComplete(UNCONFIGURED, 'block-libraries')).toBe(true);
        expect(isStorefrontStepComplete(CONFIGURED, 'block-libraries')).toBe(true);
    });
});
