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
import type { DemoPackage } from '@/types/demoPackages';
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

// Real-id package so the real catalog can resolve a mesh for eds-storefront + PaaS.
const PACKAGES = [{ id: 'citisignal', name: 'Citisignal' }] as unknown as DemoPackage[];

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
        expect(ids(state({ selectedStack: 'headless-paas' }))).toEqual([
            'commerce',
            'integrations',
        ]);
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
    function statusOf(
        state: WizardState,
        id: string,
        packages: DemoPackage[] = [],
    ): string | undefined {
        return buildYourProjectAreas(state, STACKS, packages).find(a => a.id === id)?.status;
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

    it('storefront is completed when github+dalive authed AND repo+code-sync valid', () => {
        expect(
            statusOf(
                state({
                    selectedStack: 'eds-paas',
                    edsConfig: edsAuthed,
                    storefrontRepoValid: true,
                    storefrontCodeSyncValid: true,
                }),
                'storefront',
            ),
        ).toBe('completed');
    });

    it('integrations is completed when the Mesh is N/A or Off (nothing outstanding)', () => {
        // Mesh available (eds-storefront + PaaS) but left Off → optional → completed.
        expect(
            statusOf(
                state({ selectedPackage: 'citisignal', selectedStack: 'eds-paas' }),
                'integrations',
                PACKAGES,
            ),
        ).toBe('completed');
    });

    it('integrations is upcoming when the Mesh is On but project/workspace are missing', () => {
        expect(
            statusOf(
                state({
                    selectedPackage: 'citisignal',
                    selectedStack: 'eds-paas',
                    selectedAppBuilderComponents: ['commerce-paas-mesh'],
                }),
                'integrations',
                PACKAGES,
            ),
        ).toBe('upcoming');
    });

    it('integrations is completed when the Mesh is On with project + workspace set', () => {
        expect(
            statusOf(
                state({
                    selectedPackage: 'citisignal',
                    selectedStack: 'eds-paas',
                    selectedAppBuilderComponents: ['commerce-paas-mesh'],
                    adobeAuth: { isAuthenticated: true, isChecking: false },
                    adobeOrg: { id: 'org-1', name: 'Acme', code: 'ACME' } as WizardState['adobeOrg'],
                    adobeProject: { id: 'p1', name: 'proj' },
                    adobeWorkspace: { id: 'w1', name: 'ws' },
                }),
                'integrations',
                PACKAGES,
            ),
        ).toBe('completed');
    });
});

/**
 * Sample data is NOT an area of its own.
 *
 * It was one, and it never worked: the body asked the Data Installer's
 * `find-datapacks`, which is registered only by the Data Installer panel's own
 * command. The wizard's composite map had no data-installer entry at all, so the
 * request had no handler and the area could render nothing but its own apology.
 *
 * Fixing the handler is half the answer. The other half is placement — sample
 * data seeds the COMMERCE backend, so it belongs beside the backend it targets
 * rather than in a rail slot of its own, where it was one optional radio list in
 * an otherwise empty full-width body.
 */
describe('buildYourProjectAreas — sample data lives in Commerce', () => {
    it('is no longer an area of its own, on any stack', () => {
        expect(ids(state({ selectedStack: 'eds-paas' }))).not.toContain('sample-data');
        expect(ids(state({ selectedStack: 'headless-paas' }))).not.toContain('sample-data');
        expect(ids(state())).not.toContain('sample-data');
    });

    /** Choosing a pack must not change which areas exist, nor gate Continue. */
    it('leaves the area list unchanged whether or not a datapack was chosen', () => {
        const without = ids(state({ selectedStack: 'eds-paas' }));
        const chosen = ids(
            state({ selectedStack: 'eds-paas', datapack: { name: 'bodea', version: 'main' } }),
        );

        expect(chosen).toEqual(without);
    });
});
