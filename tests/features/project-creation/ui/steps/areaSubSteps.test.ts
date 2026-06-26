/**
 * areaSubSteps tests — the per-area sub-step DRIVER registry that generalizes the
 * Commerce-only walk so Commerce, Storefront (and later Integrations) share it.
 */

import { areaSubSteps } from '@/features/project-creation/ui/steps/areaSubSteps';
import type { WizardState } from '@/types/webview';

const state = (partial: Partial<WizardState>): WizardState => partial as WizardState;

const CONFIGURED_STOREFRONT = {
    storefrontRepoValid: true,
    edsConfig: {
        repoName: 'my-repo',
        githubAuth: { isAuthenticated: true },
        daLiveAuth: { isAuthenticated: true },
    },
} as unknown as WizardState;

describe('areaSubSteps registry', () => {
    it('returns a driver for commerce and storefront, null otherwise', () => {
        expect(areaSubSteps('commerce')).not.toBeNull();
        expect(areaSubSteps('storefront')).not.toBeNull();
        expect(areaSubSteps('integrations')).toBeNull();
        expect(areaSubSteps(undefined)).toBeNull();
    });
});

describe('storefront driver', () => {
    const driver = areaSubSteps('storefront')!;

    it('lists the storefront + block-libraries sub-steps, active = first open', () => {
        const s = state({});
        expect(driver.subSteps(s).map(x => x.id)).toEqual(['storefront', 'block-libraries']);
        expect(driver.active(s)).toBe('storefront'); // block-libraries is locked
        expect(driver.next(s)).toBe('block-libraries');
        expect(driver.prev(s)).toBeNull();
    });

    it('uses the activeStorefrontStep state key for active + setActive', () => {
        expect(driver.active(state({ activeStorefrontStep: 'block-libraries' }))).toBe('block-libraries');
        expect(driver.setActive('block-libraries')).toEqual({ activeStorefrontStep: 'block-libraries' });
    });

    it('gates the storefront sub-step but lets block-libraries pass', () => {
        expect(driver.isComplete(state({}), 'storefront')).toBe(false);
        expect(driver.isComplete(CONFIGURED_STOREFRONT, 'storefront')).toBe(true);
        expect(driver.isComplete(state({}), 'block-libraries')).toBe(true);
    });

    it('enters at the first OPEN sub-step (or last when atEnd)', () => {
        const fresh = state({}); // storefront is current/open, block-libraries locked
        expect(driver.entry(fresh, false)).toEqual({ activeStorefrontStep: 'storefront' });
        expect(driver.entry(fresh, true)).toEqual({ activeStorefrontStep: 'block-libraries' });
    });

    it('has no commit-gating (no-op commit/uncommit)', () => {
        expect(driver.commit(state({}), 'storefront')).toEqual({});
        expect(driver.uncommit(state({}), ['storefront', 'block-libraries'], 'storefront')).toEqual({});
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
