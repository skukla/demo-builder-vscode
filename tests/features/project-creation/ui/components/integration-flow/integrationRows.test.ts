/**
 * integrationRows tests (Integrations flow redesign — Step 8)
 *
 * `resolveIntegrationRows` is the PURE resolver turning wizard state into the
 * center column's result rows: a mesh row via the BOTH-key selection check
 * (catalog id in `selectedAppBuilderComponents` OR legacy dep ids in
 * `selectedOptionalDependencies` — the package-seeded case), catalog rows from
 * the provided catalog list, custom rows from `appBuilderComponentSources`,
 * shared `needsSetup` (destination not committed), per-row `apiCount`, and the
 * reserved `__existing__` key never surfacing. Pure — the catalog is an arg,
 * nothing is mocked.
 */

import {
    resolveIntegrationRows,
    type IntegrationRow,
} from '@/features/project-creation/ui/components/integration-flow/integrationRows';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { WizardState } from '@/types/webview';

function state(overrides: Partial<WizardState> = {}): WizardState {
    return overrides as WizardState;
}

/** The stack's mesh entry (as meshComponentForStack resolves it). */
const MESH_ENTRY: AppBuilderComponentCatalogEntry = {
    id: 'commerce-eds-mesh',
    name: 'Commerce API Mesh',
    description: 'Unified GraphQL endpoint over Commerce services',
    kind: 'mesh',
    source: { owner: 'skukla', repo: 'commerce-mesh' },
};

const ERP_ENTRY: AppBuilderComponentCatalogEntry = {
    id: 'erp-sync',
    name: 'ERP Sync',
    description: 'Syncs orders into an ERP backend',
    kind: 'integration',
    source: { owner: 'skukla', repo: 'erp-sync' },
};

/** The blank starter ("Build custom") — kind 'integration', blank, NO source. */
const BLANK_ENTRY: AppBuilderComponentCatalogEntry = {
    id: 'app-builder-shell',
    name: 'App Builder App',
    description: 'A minimal App Builder app to build out with AI',
    kind: 'integration',
    blank: true,
    source: { owner: 'skukla', repo: 'app-builder-shell' },
};

const CATALOG: AppBuilderComponentCatalogEntry[] = [MESH_ENTRY, ERP_ENTRY];

/** Committed shared destination (project + workspace ids). */
const DESTINATION = {
    adobeProject: { id: 'proj-1', name: 'proj', title: 'Project One' },
    adobeWorkspace: { id: 'ws-1', name: 'Stage' },
} as Partial<WizardState>;

describe('resolveIntegrationRows — mesh row (both-key check)', () => {
    it('yields a mesh row when selected via selectedAppBuilderComponents', () => {
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['commerce-eds-mesh'] }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            id: 'commerce-eds-mesh',
            kind: 'mesh',
            name: 'Commerce API Mesh',
        });
    });

    it('yields a mesh row via dependencies-only selection (package-seeded) with needsSetup', () => {
        // 'commerce-eds-mesh' maps to the legacy 'eds-accs-mesh' component id.
        const rows = resolveIntegrationRows(
            state({ selectedOptionalDependencies: ['eds-accs-mesh'] }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ kind: 'mesh', needsSetup: true });
    });

    it('yields no mesh row when mesh is unselected by both keys', () => {
        expect(resolveIntegrationRows(state(), MESH_ENTRY, CATALOG)).toEqual([]);
    });

    it('yields no mesh row when the stack has no mesh component (meshComponent undefined)', () => {
        const rows = resolveIntegrationRows(
            state({ selectedOptionalDependencies: ['eds-accs-mesh'] }),
            undefined,
            CATALOG
        );

        expect(rows).toEqual([]);
    });

    it('mesh sourceLine reads the entry description', () => {
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['commerce-eds-mesh'] }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows[0].sourceLine).toBe('Unified GraphQL endpoint over Commerce services');
    });

    it('mesh name and sourceLine fall back when the entry carries neither', () => {
        const bareMesh = { ...MESH_ENTRY, name: '', description: '' };
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['commerce-eds-mesh'] }),
            bareMesh,
            [bareMesh]
        );

        expect(rows[0].name).toBe('API Mesh');
        expect(rows[0].sourceLine).toBe('GraphQL bridge · deploys to Adobe I/O');
    });
});

describe('resolveIntegrationRows — catalog rows', () => {
    it('resolves a selected catalog id to a row with the entry name and description', () => {
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['erp-sync'] }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows).toEqual([
            {
                id: 'erp-sync',
                kind: 'catalog',
                name: 'ERP Sync',
                sourceLine: 'Syncs orders into an ERP backend',
                needsSetup: true,
                apiCount: 1, // baseline only (no free picks)
            } satisfies IntegrationRow,
        ]);
    });

    it('catalog sourceLine falls back to "Catalog · {name}" when the description is empty', () => {
        const bare = { ...ERP_ENTRY, description: '' };
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['erp-sync'] }),
            MESH_ENTRY,
            [bare]
        );

        expect(rows[0].sourceLine).toBe('Catalog · ERP Sync');
    });

    it('excludes ids that resolve to mesh-kind catalog entries (mesh never doubles as catalog)', () => {
        const otherMesh: AppBuilderComponentCatalogEntry = {
            ...MESH_ENTRY,
            id: 'commerce-paas-mesh',
        };
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['commerce-paas-mesh'] }),
            MESH_ENTRY,
            [MESH_ENTRY, otherMesh]
        );

        expect(rows).toEqual([]);
    });

    it('excludes unknown ids (not in catalog, no custom source)', () => {
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['mystery'] }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows).toEqual([]);
    });
});

describe('resolveIntegrationRows — custom rows', () => {
    it('resolves a sourced id to a custom row (name = repo, "App Builder app · owner/repo")', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['acme-widget'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows).toEqual([
            {
                id: 'acme-widget',
                kind: 'custom',
                name: 'widget',
                sourceLine: 'App Builder app · acme/widget',
                needsSetup: true,
                apiCount: 1, // baseline only (no free picks)
            } satisfies IntegrationRow,
        ]);
    });

    it('a sourced id takes custom precedence even when it also resolves in the catalog', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['erp-sync'],
                appBuilderComponentSources: { 'erp-sync': { owner: 'acme', repo: 'erp-fork' } },
            }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows).toEqual([expect.objectContaining({ kind: 'custom', name: 'erp-fork' })]);
    });
});

describe('resolveIntegrationRows — blank starter ("Build custom") rows', () => {
    const WITH_BLANK = [MESH_ENTRY, ERP_ENTRY, BLANK_ENTRY];

    it('resolves a committed blank shell to a "blank" row (no source, not a gallery entry)', () => {
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['app-builder-shell'] }),
            MESH_ENTRY,
            WITH_BLANK
        );

        expect(rows).toEqual([
            {
                id: 'app-builder-shell',
                kind: 'blank',
                name: 'App Builder App',
                sourceLine: 'A minimal App Builder app to build out with AI',
                needsSetup: true,
                apiCount: 1, // baseline only (no free picks)
            } satisfies IntegrationRow,
        ]);
    });

    it('drops the blank shell when the component list omits it (the fixed IntegrationsStep bug)', () => {
        // Passing the blank-FILTERED catalog (the old bug) leaves the committed
        // shell with no matching entry → no row. The fix passes the FULL list.
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['app-builder-shell'] }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows).toEqual([]);
    });
});

describe('resolveIntegrationRows — ordering, apiCount, needsSetup, reserved key', () => {
    it('orders a mixed set mesh first, then catalog, then custom (regardless of selection order)', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['acme-widget', 'erp-sync', 'commerce-eds-mesh'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows.map((r) => r.kind)).toEqual(['mesh', 'catalog', 'custom']);
    });

    it('counts the baseline + selectedConsoleApis picks per id (missing key → baseline only)', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['erp-sync', 'commerce-eds-mesh'],
                selectedConsoleApis: { 'erp-sync': ['AnalyticsSDK', 'TargetSDK'] },
            }),
            MESH_ENTRY,
            CATALOG
        );

        const byId = Object.fromEntries(rows.map((r) => [r.id, r.apiCount]));
        expect(byId['erp-sync']).toBe(3); // baseline + 2 picks
        expect(byId['commerce-eds-mesh']).toBe(1); // baseline only
    });

    it('never surfaces the reserved __existing__ key as a row or a count', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['__existing__', 'erp-sync'],
                appBuilderComponentSources: {
                    __existing__: { owner: 'ghost', repo: 'ghost' },
                },
                selectedConsoleApis: { __existing__: ['LegacySDK'], 'erp-sync': ['TargetSDK'] },
            }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: 'erp-sync', apiCount: 2 }); // baseline + 1 pick
    });

    it('needsSetup is false on every row once the shared destination is committed', () => {
        const rows = resolveIntegrationRows(
            state({
                ...DESTINATION,
                selectedAppBuilderComponents: ['erp-sync', 'commerce-eds-mesh'],
            }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows).toHaveLength(2);
        expect(rows.every((r) => r.needsSetup === false)).toBe(true);
    });

    it('needsSetup stays true when only the project is committed (no workspace)', () => {
        const rows = resolveIntegrationRows(
            state({
                adobeProject: { id: 'proj-1', name: 'proj', title: 'Project One' },
                selectedAppBuilderComponents: ['erp-sync'],
            } as Partial<WizardState>),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows[0].needsSetup).toBe(true);
    });

    it('returns [] for empty state', () => {
        expect(resolveIntegrationRows(state(), undefined, CATALOG)).toEqual([]);
    });
});
