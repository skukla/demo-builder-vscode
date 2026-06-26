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
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

const stacks = [
    { id: 'eds-accs', name: 'Edge Delivery + ACCS', frontend: 'eds-storefront', backend: 'adobe-commerce-accs' },
    { id: 'headless-paas', name: 'Headless + PaaS', frontend: 'headless', backend: 'adobe-commerce-paas' },
] as unknown as Stack[];

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
    it('shows the chosen Frontend from the committed stack', () => {
        const group = storefrontSummaryGroup(state({ selectedStack: 'headless-paas' }), stacks);
        expect(group.heading).toBe('Storefront');
        const frontend = group.rows.find(r => r.label === 'Frontend');
        expect(frontend?.value).toBe('Headless');
        expect(frontend?.done).toBe(true);
    });

    it('gates the Repository row on full storefront configuration', () => {
        const unconfigured = storefrontSummaryGroup(
            state({ selectedStack: 'eds-accs', edsConfig: { repoName: 'my-repo' } } as Partial<WizardState>),
            stacks,
        );
        expect(unconfigured.rows.find(r => r.label === 'Repository')?.value).toBeUndefined();

        const configured = storefrontSummaryGroup(
            state({
                selectedStack: 'eds-accs',
                storefrontRepoValid: true,
                storefrontCodeSyncValid: true,
                edsConfig: {
                    repoName: 'my-repo',
                    githubAuth: { isAuthenticated: true },
                    daLiveAuth: { isAuthenticated: true },
                },
            } as Partial<WizardState>),
            stacks,
        );
        const repo = configured.rows.find(r => r.label === 'Repository');
        expect(repo?.value).toBe('my-repo');
        expect(repo?.done).toBe(true);
    });
});

describe('integrationsSummaryGroup', () => {
    it('contributes no rows until the Integrations slice fills it', () => {
        expect(integrationsSummaryGroup(state({})).rows).toEqual([]);
    });
});

describe('buildSummaryGroups', () => {
    it('aggregates visible areas in order and drops empty groups', () => {
        const groups = buildSummaryGroups(
            state({ selectedStack: 'eds-accs', selectedBackend: 'adobe-commerce-accs' }),
            stacks,
            ['commerce', 'storefront', 'integrations'],
        );
        // Integrations contributes no rows yet → dropped.
        expect(groups.map(g => g.heading)).toEqual(['Commerce', 'Storefront']);
    });

    it('omits a hidden area (not in the visible list)', () => {
        const groups = buildSummaryGroups(
            state({ selectedBackend: 'adobe-commerce-paas' }),
            stacks,
            ['commerce'],
        );
        expect(groups.map(g => g.heading)).toEqual(['Commerce']);
    });
});
