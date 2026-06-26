/**
 * storefrontSections tests — the Storefront area's sub-step model (mirrors
 * commerceSections): storefront setup (gates on isStorefrontConfigured) then the
 * optional block-libraries picker (locked until configured, then always passable).
 */

import {
    storefrontSectionStates,
    isStorefrontStepComplete,
} from '@/features/project-creation/ui/steps/storefrontSections';
import type { WizardState } from '@/types/webview';

/** A fully-configured storefront (github + dalive auth + valid repo). */
const CONFIGURED = {
    storefrontRepoValid: true,
    edsConfig: {
        repoName: 'my-repo',
        githubAuth: { isAuthenticated: true },
        daLiveAuth: { isAuthenticated: true },
    },
} as unknown as WizardState;

const UNCONFIGURED = {} as WizardState;

describe('storefrontSectionStates', () => {
    it('starts on the storefront setup with block-libraries locked', () => {
        const states = storefrontSectionStates(UNCONFIGURED);
        expect(states.map(s => s.id)).toEqual(['storefront', 'block-libraries']);
        expect(states[0].status).toBe('current');
        expect(states[1].status).toBe('locked');
        expect(states[1].lockReason).toMatch(/storefront/i);
    });

    it('marks storefront done and unlocks block-libraries once configured', () => {
        const states = storefrontSectionStates(CONFIGURED);
        expect(states[0].status).toBe('done');
        expect(states[1].status).toBe('current');
        expect(states[1].lockReason).toBeUndefined();
    });
});

describe('isStorefrontStepComplete', () => {
    it('gates the storefront sub-step on full configuration', () => {
        expect(isStorefrontStepComplete(UNCONFIGURED, 'storefront')).toBe(false);
        expect(isStorefrontStepComplete(CONFIGURED, 'storefront')).toBe(true);
    });

    it('treats block-libraries as always complete (optional/terminal)', () => {
        expect(isStorefrontStepComplete(UNCONFIGURED, 'block-libraries')).toBe(true);
        expect(isStorefrontStepComplete(CONFIGURED, 'block-libraries')).toBe(true);
    });
});
