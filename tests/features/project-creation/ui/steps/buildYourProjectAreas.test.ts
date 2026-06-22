/**
 * buildYourProjectAreas model (Nested Builder — Slice 1, step 3)
 *
 * Pure derivation of the ordered, VISIBLE "Build Your Project" sub-step areas plus
 * each area's completion status. Visibility reuses the existing wizard condition
 * machinery (`filterStepsForStack` / `StepCondition`) — the storefront area carries
 * the same `stackRequiresAny: ['requiresGitHub','requiresDaLive']` vocabulary the
 * `storefront-setup` wizard step uses, so it appears for EDS stacks only. Status
 * reuses the per-area `isCommerceConfigured` / `isStorefrontConfigured` predicates.
 */

import { buildYourProjectAreas } from '@/features/project-creation/ui/steps/buildYourProjectAreas';
import type { WizardState } from '@/types/webview';
import type { Stack } from '@/types/stacks';

function state(overrides: Partial<WizardState> = {}): WizardState {
    return overrides as WizardState;
}

/** Minimal Stack fixture; only the fields filterStepsForStack reads matter. */
function stack(overrides: Partial<Stack> = {}): Stack {
    return {
        id: 'fixture-stack',
        name: 'Fixture Stack',
        description: '',
        frontend: 'headless-storefront',
        backend: 'adobe-commerce-paas',
        dependencies: [],
        ...overrides,
    };
}

const EDS_STACK = stack({
    id: 'eds-paas',
    frontend: 'eds-storefront',
    requiresGitHub: true,
    requiresDaLive: true,
});

const NON_EDS_STACK = stack({
    id: 'headless-paas',
    frontend: 'headless-storefront',
});

const STACKS: Stack[] = [EDS_STACK, NON_EDS_STACK];

function ids(state: WizardState, stacks: Stack[] = STACKS): string[] {
    return buildYourProjectAreas(state, stacks).map(a => a.id);
}

describe('buildYourProjectAreas — visibility', () => {
    it('shows [commerce, integrations] (storefront hidden) when no stack is selected', () => {
        expect(ids(state())).toEqual(['commerce', 'integrations']);
    });

    it('shows [commerce, storefront, integrations] for an EDS stack', () => {
        expect(ids(state({ selectedStack: 'eds-paas' }))).toEqual([
            'commerce',
            'storefront',
            'integrations',
        ]);
    });

    it('hides storefront for a non-EDS stack (no requiresGitHub/requiresDaLive)', () => {
        expect(ids(state({ selectedStack: 'headless-paas' }))).toEqual(['commerce', 'integrations']);
    });

    it('always keeps commerce < storefront < integrations order (EDS)', () => {
        const result = ids(state({ selectedStack: 'eds-paas' }));
        expect(result.indexOf('commerce')).toBeLessThan(result.indexOf('storefront'));
        expect(result.indexOf('storefront')).toBeLessThan(result.indexOf('integrations'));
    });
});

describe('buildYourProjectAreas — labels', () => {
    it('uses human-readable labels', () => {
        const areas = buildYourProjectAreas(state({ selectedStack: 'eds-paas' }), STACKS);
        const labels = Object.fromEntries(areas.map(a => [a.id, a.label]));
        expect(labels.commerce).toBe('Commerce');
        expect(labels.storefront).toBe('Storefront');
        expect(labels.integrations).toBe('Integrations');
    });
});

describe('buildYourProjectAreas — status', () => {
    function statusOf(state: WizardState, id: string): string | undefined {
        return buildYourProjectAreas(state, STACKS).find(a => a.id === id)?.status;
    }

    const edsAuthed = {
        githubAuth: { isAuthenticated: true },
        daLiveAuth: { isAuthenticated: true },
    };

    it('commerce is upcoming when not configured', () => {
        expect(statusOf(state({ selectedStack: 'eds-paas' }), 'commerce')).toBe('upcoming');
    });

    it('commerce is completed when stack selected AND commerceConnectValid', () => {
        expect(
            statusOf(state({ selectedStack: 'eds-paas', commerceConnectValid: true }), 'commerce'),
        ).toBe('completed');
    });

    it('storefront is upcoming when not configured', () => {
        expect(statusOf(state({ selectedStack: 'eds-paas' }), 'storefront')).toBe('upcoming');
    });

    it('storefront is completed when github+dalive authed AND storefrontRepoValid', () => {
        expect(
            statusOf(
                state({ selectedStack: 'eds-paas', edsConfig: edsAuthed, storefrontRepoValid: true }),
                'storefront',
            ),
        ).toBe('completed');
    });

    it('integrations is always upcoming for now', () => {
        expect(statusOf(state({ selectedStack: 'eds-paas' }), 'integrations')).toBe('upcoming');
        expect(
            statusOf(
                state({ selectedStack: 'eds-paas', commerceConnectValid: true }),
                'integrations',
            ),
        ).toBe('upcoming');
    });
});
