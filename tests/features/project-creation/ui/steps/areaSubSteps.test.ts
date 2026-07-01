/**
 * areaSubSteps tests — the per-area sub-step DRIVER registry that generalizes the
 * Commerce-only walk so Commerce, Storefront (and later Integrations) share it.
 */

import { areaSubSteps } from '@/features/project-creation/ui/steps/areaSubSteps';
import type { WizardState } from '@/types/webview';

const state = (partial: Partial<WizardState>): WizardState => partial as WizardState;

const CONFIGURED_STOREFRONT = {
    storefrontRepoValid: true,
    storefrontCodeSyncValid: true,
    edsConfig: {
        repoName: 'my-repo',
        githubAuth: { isAuthenticated: true },
        daLiveAuth: { isAuthenticated: true },
    },
} as unknown as WizardState;

describe('areaSubSteps registry', () => {
    it('returns a driver for commerce, storefront and integrations, null otherwise', () => {
        expect(areaSubSteps('commerce')).not.toBeNull();
        expect(areaSubSteps('storefront')).not.toBeNull();
        expect(areaSubSteps('integrations')).not.toBeNull();
        expect(areaSubSteps('nope')).toBeNull();
        expect(areaSubSteps(undefined)).toBeNull();
    });
});

describe('storefront driver', () => {
    const driver = areaSubSteps('storefront')!;

    it('lists the sub-steps for an existing repo (no Code Sync), active = first open', () => {
        const s = state({});
        expect(driver.subSteps(s).map(x => x.id)).toEqual([
            'accounts',
            'repository',
            'block-libraries',
        ]);
        expect(driver.active(s)).toBe('accounts'); // repository is locked
        expect(driver.next(s)).toBe('repository');
        expect(driver.prev(s)).toBeNull();
    });

    it('includes the Code Sync sub-step only for a NEW repo', () => {
        const s = state({ edsConfig: { repoMode: 'new' } } as Partial<WizardState>);
        expect(driver.subSteps(s).map(x => x.id)).toEqual([
            'accounts',
            'repository',
            'code-sync',
            'block-libraries',
        ]);
    });

    it('uses the activeStorefrontStep state key for active + setActive', () => {
        expect(driver.active(state({ activeStorefrontStep: 'block-libraries' }))).toBe('block-libraries');
        expect(driver.setActive('repository')).toEqual({ activeStorefrontStep: 'repository' });
    });

    it('gates each required sub-step but lets block-libraries pass', () => {
        expect(driver.isComplete(state({}), 'accounts')).toBe(false);
        expect(driver.isComplete(CONFIGURED_STOREFRONT, 'accounts')).toBe(true);
        expect(driver.isComplete(state({}), 'repository')).toBe(false);
        expect(driver.isComplete(CONFIGURED_STOREFRONT, 'repository')).toBe(true);
        expect(driver.isComplete(state({}), 'code-sync')).toBe(false);
        expect(driver.isComplete(CONFIGURED_STOREFRONT, 'code-sync')).toBe(true);
        expect(driver.isComplete(state({}), 'block-libraries')).toBe(true);
    });

    it('enters at the first OPEN sub-step (or last when atEnd)', () => {
        const fresh = state({}); // accounts is current/open, later required steps locked
        expect(driver.entry(fresh, false)).toEqual({ activeStorefrontStep: 'accounts' });
        expect(driver.entry(fresh, true)).toEqual({ activeStorefrontStep: 'block-libraries' });
    });

    it('has no commit-gating (no-op commit/uncommit)', () => {
        expect(driver.commit(state({}), 'accounts')).toEqual({});
        expect(driver.uncommit(state({}), ['accounts', 'block-libraries'], 'accounts')).toEqual({});
    });
});

describe('integrations driver', () => {
    const driver = areaSubSteps('integrations')!;

    it('is a single "deployables" screen (no sub-step tabs)', () => {
        const s = state({ selectedAppBuilderComponents: ['commerce-paas-mesh'] });
        expect(driver.subSteps(s).map(x => x.id)).toEqual(['deployables']);
        expect(driver.active(s)).toBe('deployables');
        // One sub-step → nothing to walk; Continue advances the area.
        expect(driver.next(s)).toBeNull();
        expect(driver.prev(s)).toBeNull();
    });

    it('uses the activeIntegrationsStep state key for active + setActive', () => {
        const s = state({ selectedAppBuilderComponents: ['x'], activeIntegrationsStep: 'deployables' });
        expect(driver.active(s)).toBe('deployables');
        expect(driver.setActive('deployables')).toEqual({ activeIntegrationsStep: 'deployables' });
    });

    it('gates the area on the deployables destination (project + workspace once selected)', () => {
        // Nothing selected → complete (optional).
        expect(driver.isComplete(state({}), 'deployables')).toBe(true);
        // A deployable selected without a full destination → incomplete.
        expect(
            driver.isComplete(state({ selectedAppBuilderComponents: ['x'] }), 'deployables'),
        ).toBe(false);
        // Signed in + project + workspace → complete.
        expect(
            driver.isComplete(
                state({
                    selectedAppBuilderComponents: ['x'],
                    adobeAuth: { isAuthenticated: true, isChecking: false },
                    adobeOrg: { id: 'o', name: 'Acme' },
                    adobeProject: { id: 'p' },
                    adobeWorkspace: { id: 'w' },
                } as unknown as Partial<WizardState>),
                'deployables',
            ),
        ).toBe(true);
    });

    it('enters at the single deployables sub-step', () => {
        const s = state({ selectedAppBuilderComponents: ['x'], selectedBackend: 'adobe-commerce-accs' });
        expect(driver.entry(s, false)).toEqual({ activeIntegrationsStep: 'deployables' });
        expect(driver.entry(s, true)).toEqual({ activeIntegrationsStep: 'deployables' });
        expect(driver.entry(state({}), false)).toEqual({ activeIntegrationsStep: 'deployables' });
    });

    it('has no commit-gating (no-op commit/uncommit)', () => {
        expect(driver.commit(state({}), 'deployables')).toEqual({});
        expect(driver.uncommit(state({}), ['deployables', 'target'], 'deployables')).toEqual({});
    });
});

describe('commerce driver', () => {
    const driver = areaSubSteps('commerce')!;

    it('uses activeCommerceStep + commits via committedCommerceSteps', () => {
        const s = state({ selectedBackend: 'adobe-commerce-paas' });
        expect(driver.subSteps(s).map(x => x.id)).toEqual([
            'backend',
            'connection',
            'business-structure',
            'catalog',
        ]);
        expect(driver.setActive('connection')).toEqual({ activeCommerceStep: 'connection' });
        expect(driver.commit(s, 'backend')).toEqual({ committedCommerceSteps: ['backend'] });
    });
});
