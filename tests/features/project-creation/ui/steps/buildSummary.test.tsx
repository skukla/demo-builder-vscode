/**
 * buildSummary tests (v6 unified scaffold) — the per-area providers that feed the
 * single "Your project" summary: the shared architecture line + one group per
 * visible area, aggregated (empty groups dropped). The Integrations group mirrors
 * the center column: one row per configured integration via resolveIntegrationRows.
 *
 * A `.test.tsx` file (react jest project) because buildSummary imports the
 * integration-flow module INDEX — whose re-exports include .tsx components the
 * node project cannot resolve. The tests themselves are pure.
 *
 * @jest-environment jsdom
 */

// Deterministic catalog for the Integrations group: one mesh (a REAL id so the
// legacy dependency-mirror mapping applies) + one integration entry, offered
// only on the ACCS+EDS axis. Mesh resolution reads this same loader.
jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => {
    const actual = jest.requireActual(
        '@/features/project-creation/services/appBuilderComponentCatalogLoader'
    );
    const entries = [
        {
            id: 'eds-accs-mesh',
            name: 'API Mesh',
            description: 'GraphQL bridge',
            kind: 'mesh',
            source: { owner: 'adobe', repo: 'mesh', branch: 'main' },
        },
        {
            id: 'cat-reco',
            name: 'Recommendations',
            description: 'Personalized product recommendations',
            kind: 'integration',
            source: { owner: 'adobe', repo: 'reco', branch: 'main' },
        },
    ];
    return {
        ...actual,
        getAvailableAppBuilderComponents: (backendId: string, frontendId: string) =>
            backendId === 'adobe-commerce-accs' && frontendId === 'eds-storefront' ? entries : [],
    };
});

import {
    architectureLabel,
    commerceSummaryGroup,
    storefrontSummaryGroup,
    integrationsSummaryGroup,
    buildSummaryGroups,
} from '@/features/project-creation/ui/steps/buildSummary';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

const stacks = [
    {
        id: 'eds-accs',
        name: 'Edge Delivery + ACCS',
        frontend: 'eds-storefront',
        backend: 'adobe-commerce-accs',
    },
    {
        id: 'headless-paas',
        name: 'Headless + PaaS',
        frontend: 'headless',
        backend: 'adobe-commerce-paas',
    },
    {
        id: 'eds-none',
        name: 'EDS + (no mesh backend)',
        frontend: 'eds-storefront',
        backend: 'no-mesh-backend',
    },
] as unknown as Stack[];

const packages = [{ id: 'citisignal', name: 'Citisignal' }] as unknown as DemoPackage[];

const state = (partial: Partial<WizardState>): WizardState => partial as WizardState;

describe('architectureLabel', () => {
    it('returns the full stack name once a stack is committed', () => {
        expect(architectureLabel(state({ selectedStack: 'eds-accs' }), stacks)).toBe(
            'Edge Delivery + ACCS'
        );
    });

    it('returns "Frontend pending" when only the backend is chosen', () => {
        expect(architectureLabel(state({ selectedBackend: 'adobe-commerce-accs' }), stacks)).toBe(
            'Frontend pending'
        );
    });

    it('returns null when nothing is chosen', () => {
        expect(architectureLabel(state({}), stacks)).toBeNull();
    });
});

describe('commerceSummaryGroup', () => {
    it('heads "Commerce" and lists the non-ACCS section rows', () => {
        const group = commerceSummaryGroup(state({ selectedBackend: 'adobe-commerce-paas' }));
        expect(group.heading).toBe('Commerce');
        expect(group.rows.map((r) => r.label)).toEqual([
            'Backend',
            'Connection',
            'Business',
            'Catalog',
        ]);
    });

    it('shows a value + done only when the sub-step is done AND committed', () => {
        const committed = commerceSummaryGroup(
            state({ selectedBackend: 'adobe-commerce-paas', committedCommerceSteps: ['backend'] })
        );
        const backend = committed.rows.find((r) => r.label === 'Backend');
        expect(backend?.done).toBe(true);
        expect(backend?.value).toBe('Adobe Commerce (PaaS)');

        // Backend is "done" in the section model, but uncommitted → no ✓/value.
        const uncommitted = commerceSummaryGroup(state({ selectedBackend: 'adobe-commerce-paas' }));
        const uncommittedBackend = uncommitted.rows.find((r) => r.label === 'Backend');
        expect(uncommittedBackend?.done).toBe(false);
        expect(uncommittedBackend?.value).toBeUndefined();
    });
});

describe('storefrontSummaryGroup', () => {
    it('heads "Storefront" and mirrors the sub-steps (existing repo → no Code Sync)', () => {
        const group = storefrontSummaryGroup(state({}));
        expect(group.heading).toBe('Storefront');
        expect(group.rows.map((r) => r.label)).toEqual([
            'Accounts',
            'Repository',
            'Block Libraries',
        ]);
    });

    it('includes the Code Sync row only for a NEW repo', () => {
        const group = storefrontSummaryGroup(
            state({ edsConfig: { repoMode: 'new' } } as Partial<WizardState>)
        );
        expect(group.rows.map((r) => r.label)).toEqual([
            'Accounts',
            'Repository',
            'Code Sync',
            'Block Libraries',
        ]);
    });

    it('marks Accounts done only when BOTH GitHub and DA.live are connected', () => {
        const githubOnly = storefrontSummaryGroup(
            state({ edsConfig: { githubAuth: { isAuthenticated: true } } } as Partial<WizardState>)
        );
        expect(githubOnly.rows.find((r) => r.label === 'Accounts')?.done).toBe(false);

        const both = storefrontSummaryGroup(
            state({
                edsConfig: {
                    githubAuth: { isAuthenticated: true },
                    daLiveAuth: { isAuthenticated: true },
                },
            } as Partial<WizardState>)
        );
        const accounts = both.rows.find((r) => r.label === 'Accounts');
        expect(accounts?.done).toBe(true);
        expect(accounts?.value).toBe('Connected');
    });

    it('shows Repository + Code Sync values from their persisted validity', () => {
        const group = storefrontSummaryGroup(
            state({
                storefrontRepoValid: true,
                storefrontCodeSyncValid: true,
                edsConfig: { repoName: 'my-repo', repoMode: 'new' },
            } as Partial<WizardState>)
        );
        const repo = group.rows.find((r) => r.label === 'Repository');
        expect(repo?.value).toBe('my-repo');
        expect(repo?.done).toBe(true);
        const codeSync = group.rows.find((r) => r.label === 'Code Sync');
        expect(codeSync?.value).toBe('Verified');
        expect(codeSync?.done).toBe(true);
    });

    it('counts selected block libraries (native + custom)', () => {
        const none = storefrontSummaryGroup(state({}));
        expect(none.rows.find((r) => r.label === 'Block Libraries')?.done).toBe(false);

        const some = storefrontSummaryGroup(
            state({
                selectedBlockLibraries: ['a', 'b'],
                customBlockLibraries: [{ source: { owner: 'o', repo: 'r' } }],
            } as unknown as Partial<WizardState>)
        );
        const libs = some.rows.find((r) => r.label === 'Block Libraries');
        expect(libs?.done).toBe(true);
        expect(libs?.value).toBe('3 selected');
    });

    it('leaves not-yet-configured rows undone with no value', () => {
        const group = storefrontSummaryGroup(state({}));
        expect(group.rows.every((r) => !r.done)).toBe(true);
        expect(group.rows.every((r) => r.value === undefined)).toBe(true);
    });
});

describe('integrationsSummaryGroup', () => {
    /** The mesh entry's legacy dependency mirror id (package-seeded mesh path). */
    const MESH_LEGACY_DEP = 'eds-accs-mesh';
    const COMMITTED_DEST: Partial<WizardState> = {
        adobeProject: { id: 'proj-1', name: 'proj-one', title: 'Demo Project' },
        adobeWorkspace: { id: 'ws-1', name: 'Stage' },
    };

    it('contributes no rows when nothing is configured (even with a mesh available)', () => {
        expect(integrationsSummaryGroup(state({}), packages, stacks).rows).toEqual([]);
        const meshAvailable = integrationsSummaryGroup(
            state({ selectedPackage: 'citisignal', selectedStack: 'eds-accs' }),
            packages,
            stacks
        );
        expect(meshAvailable.rows).toEqual([]);
    });

    it('adds a "Needs setup" row for a selected mesh without a destination', () => {
        const group = integrationsSummaryGroup(
            state({
                selectedPackage: 'citisignal',
                selectedStack: 'eds-accs',
                selectedAppBuilderComponents: ['eds-accs-mesh'],
            }),
            packages,
            stacks
        );
        expect(group.heading).toBe('Integrations');
        expect(group.rows).toEqual([{ label: 'API Mesh', value: 'Needs setup', done: false }]);
    });

    it('surfaces a PACKAGE-SEEDED mesh (dependency key only) as a needs-setup row', () => {
        const group = integrationsSummaryGroup(
            state({
                selectedPackage: 'citisignal',
                selectedStack: 'eds-accs',
                selectedOptionalDependencies: [MESH_LEGACY_DEP],
            }),
            packages,
            stacks
        );
        expect(group.rows).toEqual([{ label: 'API Mesh', value: 'Needs setup', done: false }]);
    });

    it('marks a row Ready + done once the shared destination is committed', () => {
        const group = integrationsSummaryGroup(
            state({
                selectedPackage: 'citisignal',
                selectedStack: 'eds-accs',
                selectedAppBuilderComponents: ['eds-accs-mesh'],
                ...COMMITTED_DEST,
            }),
            packages,
            stacks
        );
        expect(group.rows).toEqual([{ label: 'API Mesh', value: 'Ready', done: true }]);
    });

    it('adds one row per configured integration (mesh, catalog, custom)', () => {
        const group = integrationsSummaryGroup(
            state({
                selectedPackage: 'citisignal',
                selectedStack: 'eds-accs',
                selectedAppBuilderComponents: ['eds-accs-mesh', 'cat-reco', 'acme-widget'],
                appBuilderComponentSources: {
                    'acme-widget': { owner: 'acme', repo: 'widget' },
                },
                ...COMMITTED_DEST,
            }),
            packages,
            stacks
        );
        expect(group.rows.map((r) => r.label)).toEqual(['API Mesh', 'Recommendations', 'widget']);
        expect(group.rows.every((r) => r.done && r.value === 'Ready')).toBe(true);
    });

    it('never surfaces the reserved "__existing__" edit-mode key as a row', () => {
        const group = integrationsSummaryGroup(
            state({
                selectedPackage: 'citisignal',
                selectedStack: 'eds-accs',
                selectedAppBuilderComponents: ['__existing__'],
            }),
            packages,
            stacks
        );
        expect(group.rows).toEqual([]);
    });

    it('rows a custom integration even on a stack with no catalog entries', () => {
        const group = integrationsSummaryGroup(
            state({
                selectedPackage: 'citisignal',
                selectedStack: 'eds-none',
                selectedAppBuilderComponents: ['acme-widget'],
                appBuilderComponentSources: {
                    'acme-widget': { owner: 'acme', repo: 'widget' },
                },
            }),
            packages,
            stacks
        );
        expect(group.rows).toEqual([{ label: 'widget', value: 'Needs setup', done: false }]);
    });
});

describe('buildSummaryGroups', () => {
    it('includes Integrations once an integration is configured', () => {
        const groups = buildSummaryGroups(
            state({
                selectedPackage: 'citisignal',
                selectedStack: 'eds-accs',
                selectedBackend: 'adobe-commerce-accs',
                selectedAppBuilderComponents: ['eds-accs-mesh'],
            }),
            ['commerce', 'storefront', 'integrations'],
            packages,
            stacks
        );
        expect(groups.map((g) => g.heading)).toEqual(['Commerce', 'Storefront', 'Integrations']);
    });

    it('drops the Integrations group while no integration is configured', () => {
        const groups = buildSummaryGroups(
            state({ selectedPackage: 'citisignal', selectedStack: 'eds-accs' }),
            ['commerce', 'storefront', 'integrations'],
            packages,
            stacks
        );
        expect(groups.map((g) => g.heading)).toEqual(['Commerce', 'Storefront']);
    });

    it('omits a hidden area (not in the visible list)', () => {
        const groups = buildSummaryGroups(
            state({ selectedBackend: 'adobe-commerce-paas' }),
            ['commerce'],
            packages,
            stacks
        );
        expect(groups.map((g) => g.heading)).toEqual(['Commerce']);
    });
});
