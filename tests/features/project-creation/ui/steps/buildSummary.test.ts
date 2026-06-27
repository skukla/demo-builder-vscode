/**
 * buildSummary tests (v6 unified scaffold) — the per-area providers that feed the
 * single "Your project" summary: the shared architecture line + one group per
 * visible area, aggregated (empty groups dropped).
 */

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
    { id: 'eds-accs', name: 'Edge Delivery + ACCS', frontend: 'eds-storefront', backend: 'adobe-commerce-accs' },
    { id: 'headless-paas', name: 'Headless + PaaS', frontend: 'headless', backend: 'adobe-commerce-paas' },
    { id: 'eds-none', name: 'EDS + (no mesh backend)', frontend: 'eds-storefront', backend: 'no-mesh-backend' },
] as unknown as Stack[];

const packages = [{ id: 'citisignal', name: 'Citisignal' }] as unknown as DemoPackage[];

const state = (partial: Partial<WizardState>): WizardState => partial as WizardState;

describe('architectureLabel', () => {
    it('returns the full stack name once a stack is committed', () => {
        expect(architectureLabel(state({ selectedStack: 'eds-accs' }), stacks)).toBe('Edge Delivery + ACCS');
    });

    it('returns "Frontend pending" when only the backend is chosen', () => {
        expect(architectureLabel(state({ selectedBackend: 'adobe-commerce-accs' }), stacks)).toBe('Frontend pending');
    });

    it('returns null when nothing is chosen', () => {
        expect(architectureLabel(state({}), stacks)).toBeNull();
    });
});

describe('commerceSummaryGroup', () => {
    it('heads "Commerce" and lists the non-ACCS section rows', () => {
        const group = commerceSummaryGroup(state({ selectedBackend: 'adobe-commerce-paas' }));
        expect(group.heading).toBe('Commerce');
        expect(group.rows.map(r => r.label)).toEqual(['Backend', 'Connection', 'Business', 'Catalog']);
    });

    it('shows a value + done only when the sub-step is done AND committed', () => {
        const committed = commerceSummaryGroup(
            state({ selectedBackend: 'adobe-commerce-paas', committedCommerceSteps: ['backend'] }),
        );
        const backend = committed.rows.find(r => r.label === 'Backend');
        expect(backend?.done).toBe(true);
        expect(backend?.value).toBe('Adobe Commerce (PaaS)');

        // Backend is "done" in the section model, but uncommitted → no ✓/value.
        const uncommitted = commerceSummaryGroup(state({ selectedBackend: 'adobe-commerce-paas' }));
        const uncommittedBackend = uncommitted.rows.find(r => r.label === 'Backend');
        expect(uncommittedBackend?.done).toBe(false);
        expect(uncommittedBackend?.value).toBeUndefined();
    });
});

describe('storefrontSummaryGroup', () => {
    it('heads "Storefront" and mirrors the four sub-steps', () => {
        const group = storefrontSummaryGroup(state({}));
        expect(group.heading).toBe('Storefront');
        expect(group.rows.map(r => r.label)).toEqual([
            'Accounts',
            'Repository',
            'Code Sync',
            'Block Libraries',
        ]);
    });

    it('marks Accounts done only when BOTH GitHub and DA.live are connected', () => {
        const githubOnly = storefrontSummaryGroup(
            state({ edsConfig: { githubAuth: { isAuthenticated: true } } } as Partial<WizardState>),
        );
        expect(githubOnly.rows.find(r => r.label === 'Accounts')?.done).toBe(false);

        const both = storefrontSummaryGroup(
            state({
                edsConfig: {
                    githubAuth: { isAuthenticated: true },
                    daLiveAuth: { isAuthenticated: true },
                },
            } as Partial<WizardState>),
        );
        const accounts = both.rows.find(r => r.label === 'Accounts');
        expect(accounts?.done).toBe(true);
        expect(accounts?.value).toBe('Connected');
    });

    it('shows Repository + Code Sync values from their persisted validity', () => {
        const group = storefrontSummaryGroup(
            state({
                storefrontRepoValid: true,
                storefrontCodeSyncValid: true,
                edsConfig: { repoName: 'my-repo' },
            } as Partial<WizardState>),
        );
        const repo = group.rows.find(r => r.label === 'Repository');
        expect(repo?.value).toBe('my-repo');
        expect(repo?.done).toBe(true);
        const codeSync = group.rows.find(r => r.label === 'Code Sync');
        expect(codeSync?.value).toBe('Verified');
        expect(codeSync?.done).toBe(true);
    });

    it('counts selected block libraries (native + custom)', () => {
        const none = storefrontSummaryGroup(state({}));
        expect(none.rows.find(r => r.label === 'Block Libraries')?.done).toBe(false);

        const some = storefrontSummaryGroup(
            state({
                selectedBlockLibraries: ['a', 'b'],
                customBlockLibraries: [{ source: { owner: 'o', repo: 'r' } }],
            } as unknown as Partial<WizardState>),
        );
        const libs = some.rows.find(r => r.label === 'Block Libraries');
        expect(libs?.done).toBe(true);
        expect(libs?.value).toBe('3 selected');
    });

    it('leaves not-yet-configured rows undone with no value', () => {
        const group = storefrontSummaryGroup(state({}));
        expect(group.rows.every(r => !r.done)).toBe(true);
        expect(group.rows.every(r => r.value === undefined)).toBe(true);
    });
});

describe('integrationsSummaryGroup', () => {
    it('contributes no rows on a non-mesh architecture (no stack committed)', () => {
        expect(integrationsSummaryGroup(state({}), packages, stacks).rows).toEqual([]);
    });

    it('contributes no rows when the committed stack has no mesh component', () => {
        const group = integrationsSummaryGroup(
            state({ selectedPackage: 'citisignal', selectedStack: 'eds-none' }),
            packages,
            stacks,
        );
        expect(group.rows).toEqual([]);
    });

    it('adds an undone "API Mesh" row (no value) when mesh is available but Off', () => {
        const group = integrationsSummaryGroup(
            state({ selectedPackage: 'citisignal', selectedStack: 'eds-accs' }),
            packages,
            stacks,
        );
        const mesh = group.rows.find(r => r.label === 'API Mesh');
        expect(mesh).toBeDefined();
        expect(mesh?.done).toBe(false);
        expect(mesh?.value).toBeUndefined();
    });

    it('marks the "API Mesh" row done with value "On" when the mesh is selected', () => {
        const group = integrationsSummaryGroup(
            state({
                selectedPackage: 'citisignal',
                selectedStack: 'eds-accs',
                selectedAppBuilderComponents: ['commerce-eds-mesh'],
            }),
            packages,
            stacks,
        );
        const mesh = group.rows.find(r => r.label === 'API Mesh');
        expect(mesh?.done).toBe(true);
        expect(mesh?.value).toBe('On');
    });
});

describe('buildSummaryGroups', () => {
    it('includes Integrations when mesh applies to the committed stack', () => {
        const groups = buildSummaryGroups(
            state({
                selectedPackage: 'citisignal',
                selectedStack: 'eds-accs',
                selectedBackend: 'adobe-commerce-accs',
                selectedAppBuilderComponents: ['commerce-eds-mesh'],
            }),
            ['commerce', 'storefront', 'integrations'],
            packages,
            stacks,
        );
        expect(groups.map(g => g.heading)).toEqual(['Commerce', 'Storefront', 'Integrations']);
    });

    it('drops the Integrations group on a non-mesh architecture', () => {
        const groups = buildSummaryGroups(
            state({ selectedPackage: 'citisignal', selectedStack: 'eds-none' }),
            ['commerce', 'storefront', 'integrations'],
            packages,
            stacks,
        );
        expect(groups.map(g => g.heading)).toEqual(['Commerce', 'Storefront']);
    });

    it('omits a hidden area (not in the visible list)', () => {
        const groups = buildSummaryGroups(
            state({ selectedBackend: 'adobe-commerce-paas' }),
            ['commerce'],
            packages,
            stacks,
        );
        expect(groups.map(g => g.heading)).toEqual(['Commerce']);
    });
});
