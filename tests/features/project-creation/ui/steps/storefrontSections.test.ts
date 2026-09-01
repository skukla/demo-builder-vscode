/**
 * storefrontSections tests — the Storefront area's 4 sub-step model: connect
 * Accounts (GitHub + DA.live), pick/create the repo, install AEM Code Sync, then
 * the optional block-libraries picker. Sequential lock: the first not-done step is
 * `current`, later ones `locked`, earlier done ones `done`.
 */

import {
    storefrontSectionOrder,
    storefrontSectionStates,
    isStorefrontStepComplete,
    STOREFRONT_SECTION_TITLES,
} from '@/features/project-creation/ui/steps/storefrontSections';
import type { WizardState } from '@/types/webview';

/** A fully-configured storefront (github + dalive auth + valid repo + code sync). */
const CONFIGURED = {
    storefrontRepoValid: true,
    storefrontCodeSyncValid: true,
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
    it('titles each of the 4 sub-steps', () => {
        expect(STOREFRONT_SECTION_TITLES).toEqual({
            accounts: 'Accounts',
            repository: 'Repository',
            'code-sync': 'Code Sync',
            'block-libraries': 'Block Libraries',
        });
    });
});

describe('storefrontSectionStates', () => {
    it('lists 4 sub-steps for an existing repo — Code Sync included', () => {
        // Changed 2026-08-06: Code Sync is present in BOTH modes. The existing-repo
        // check moved from mid-pipeline (after the repo had been written to) to repo
        // selection, and isStorefrontConfigured always required storefrontCodeSyncValid
        // — so hiding the step never removed the gate, only the explanation.
        const states = storefrontSectionStates(UNCONFIGURED);
        expect(states.map(s => s.id)).toEqual([
            'accounts',
            'repository',
            'code-sync',
            'block-libraries',
        ]);
    });

    it('includes Code Sync for a NEW repo too (4 sub-steps)', () => {
        const states = storefrontSectionStates(NEW_REPO);
        expect(states.map(s => s.id)).toEqual([
            'accounts',
            'repository',
            'code-sync',
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

    it('gates code-sync on storefrontCodeSyncValid', () => {
        expect(isStorefrontStepComplete(UNCONFIGURED, 'code-sync')).toBe(false);
        expect(
            isStorefrontStepComplete({ storefrontCodeSyncValid: true } as WizardState, 'code-sync'),
        ).toBe(true);
    });

    it('treats block-libraries as always complete (optional/terminal)', () => {
        expect(isStorefrontStepComplete(UNCONFIGURED, 'block-libraries')).toBe(true);
        expect(isStorefrontStepComplete(CONFIGURED, 'block-libraries')).toBe(true);
    });
});

/**
 * The code-sync sub-step must be reachable for EXISTING repos too (2026-08-06).
 *
 * It was filtered out when repoMode !== 'new', on the premise that an existing repo has
 * no app gate here — that gate was deferred to StorefrontSetup, after the pipeline had
 * already written to the repo. The selection-time check now runs for existing repos and
 * feeds `storefrontCodeSyncValid`, which `isStorefrontConfigured` requires in BOTH modes.
 *
 * So with the step hidden, an existing-repo user whose App is missing gets a Storefront
 * area that silently never completes, with no sub-step to explain it. Worse than a
 * blocked button: a blocked button with nowhere to look.
 */
describe('code-sync sub-step is present for existing repos too (2026-08-06)', () => {
    const withMode = (repoMode: string) =>
        ({ edsConfig: { repoMode } }) as unknown as Parameters<typeof storefrontSectionOrder>[0];

    it('appears for an existing repo', () => {
        expect(storefrontSectionOrder(withMode('existing'))).toContain('code-sync');
    });

    it('still appears for a new repo', () => {
        expect(storefrontSectionOrder(withMode('new'))).toContain('code-sync');
    });

    it('keeps its position in the order', () => {
        const order = storefrontSectionOrder(withMode('existing'));
        expect(order.indexOf('code-sync')).toBeGreaterThan(order.indexOf('repository'));
        expect(order.indexOf('code-sync')).toBeLessThan(order.indexOf('block-libraries'));
    });

    it('gates the area in both modes, which is why it must be visible in both', () => {
        // isStorefrontConfigured requires storefrontCodeSyncValid regardless of mode.
        // Hiding the step did not remove the gate — it removed the explanation.
        for (const mode of ['new', 'existing'] as const) {
            expect(
                isStorefrontStepComplete(
                    { ...withMode(mode), storefrontCodeSyncValid: false },
                    'code-sync',
                )
            ).toBe(false);
        }
    });
});
