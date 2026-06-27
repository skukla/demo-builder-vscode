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

    it('lists the 4 sub-steps in order, active = first open', () => {
        const s = state({});
        expect(driver.subSteps(s).map(x => x.id)).toEqual([
            'accounts',
            'repository',
            'code-sync',
            'block-libraries',
        ]);
        expect(driver.active(s)).toBe('accounts'); // repository..code-sync are locked
        expect(driver.next(s)).toBe('repository');
        expect(driver.prev(s)).toBeNull();
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

    it('lists only "deployables" until a deployable is selected', () => {
        const s = state({});
        expect(driver.subSteps(s).map(x => x.id)).toEqual(['deployables']);
        expect(driver.active(s)).toBe('deployables');
        expect(driver.next(s)).toBeNull();
        expect(driver.prev(s)).toBeNull();
    });

    it('adds the "target" sub-step once a deployable is selected', () => {
        const s = state({ selectedAppBuilderComponents: ['commerce-paas-mesh'] });
        expect(driver.subSteps(s).map(x => x.id)).toEqual(['deployables', 'target']);
        // deployables is always done → target is the first OPEN (current) step.
        expect(driver.active(s)).toBe('target');
        expect(driver.next(state({ selectedAppBuilderComponents: ['x'], activeIntegrationsStep: 'deployables' }))).toBe('target');
        expect(driver.prev(state({ selectedAppBuilderComponents: ['x'], activeIntegrationsStep: 'target' }))).toBe('deployables');
    });

    it('also counts a mesh dual-flowed via selectedOptionalDependencies', () => {
        const s = state({ selectedOptionalDependencies: ['eds-commerce-mesh'] });
        expect(driver.subSteps(s).map(x => x.id)).toEqual(['deployables', 'target']);
    });

    it('uses the activeIntegrationsStep state key for active + setActive', () => {
        const s = state({ selectedAppBuilderComponents: ['x'], activeIntegrationsStep: 'deployables' });
        expect(driver.active(s)).toBe('deployables');
        expect(driver.setActive('target')).toEqual({ activeIntegrationsStep: 'target' });
    });

    it('gates deployables open, target on project + workspace', () => {
        expect(driver.isComplete(state({}), 'deployables')).toBe(true);
        expect(driver.isComplete(state({}), 'target')).toBe(false);
        expect(
            driver.isComplete(
                state({ adobeProject: { id: 'p' }, adobeWorkspace: { id: 'w' } } as Partial<WizardState>),
                'target',
            ),
        ).toBe(true);
    });

    it('enters at the first OPEN sub-step (or last when atEnd)', () => {
        const s = state({ selectedAppBuilderComponents: ['x'] });
        expect(driver.entry(s, false)).toEqual({ activeIntegrationsStep: 'target' });
        expect(driver.entry(s, true)).toEqual({ activeIntegrationsStep: 'target' });
        // Nothing selected → only deployables.
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
