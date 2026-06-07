/**
 * buildJoinModeState — seeds the gallery-less content-SC (repoless satellite) wizard
 * from a resolved JoinDescriptor (Step 4c, increment 1).
 *
 * Asserts the content-flow discriminators: flow:'content', the shared upstream, and
 * the inherited brand (selectedPackage). Inherited backend coords are seeded later
 * (Connect-Commerce / Step 5), not here.
 */

import { buildJoinModeState } from '@/features/project-creation/ui/wizard/hooks/useWizardState';
import type { JoinDescriptor } from '@/features/project-creation/services/resolveJoinLink';

const descriptor: JoinDescriptor = {
    upstream: { owner: 'commerce-sc', repo: 'citisignal-upstream' },
    packageId: 'citisignal',
    commerce: { endpoint: 'https://x/graphql', storeViewCode: 'citisignal_us' },
};

describe('buildJoinModeState', () => {
    it('seeds the content flow + shared upstream + inherited brand', () => {
        const state = buildJoinModeState('welcome', descriptor, undefined);

        expect(state.flow).toBe('content');
        expect(state.upstream).toEqual({ owner: 'commerce-sc', repo: 'citisignal-upstream' });
        expect(state.selectedPackage).toBe('citisignal');
        expect(state.selectedStack).toBe('eds-accs'); // architecture inherited (ACCS-first)
        expect(state.wizardMode).toBe('create');
        expect(state.currentStep).toBe('welcome');
    });

    it('seeds edsConfig with the upstream as the code source + clone repoUrl', () => {
        const state = buildJoinModeState('welcome', descriptor, undefined);
        expect(state.edsConfig?.upstream).toEqual({ owner: 'commerce-sc', repo: 'citisignal-upstream' });
        expect(state.edsConfig?.repoUrl).toBe('https://github.com/commerce-sc/citisignal-upstream');
        expect(state.edsConfig?.templateOwner).toBe('commerce-sc');
        expect(state.edsConfig?.templateRepo).toBe('citisignal-upstream');
    });

    it('leaves daLiveOrg/daLiveSite unset (the joiner fills their own DA.live)', () => {
        const state = buildJoinModeState('welcome', descriptor, undefined);
        expect(state.edsConfig?.daLiveOrg).toBeUndefined();
        expect(state.edsConfig?.daLiveSite).toBeUndefined();
    });

    it('seeds the inherited backend coords into componentConfigs (Step 5)', () => {
        const state = buildJoinModeState('welcome', descriptor, undefined);
        expect(state.componentConfigs).toEqual({
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: 'https://x/graphql',
                ACCS_STORE_VIEW_CODE: 'citisignal_us',
            },
        });
    });

    it('leaves componentConfigs empty when the descriptor carries no coords', () => {
        const state = buildJoinModeState('welcome', { ...descriptor, commerce: undefined }, undefined);
        expect(state.componentConfigs).toEqual({});
    });

    it('starts unauthenticated with an empty project name (joiner names their own site)', () => {
        const state = buildJoinModeState('welcome', descriptor, undefined);
        expect(state.projectName).toBe('');
        expect(state.adobeAuth).toEqual({ isAuthenticated: false, isChecking: false });
    });
});
