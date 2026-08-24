/**
 * integrationRows tests (Integrations flow redesign — Step 8)
 *
 * `resolveIntegrationRows` is the PURE resolver turning wizard state into the
 * center column's result rows: a mesh row via `isMeshSelected` over
 * `selectedAppBuilderComponents` (the single mesh authority since D3 — the
 * retired legacy dependency key is pinned inert), catalog rows from
 * the provided catalog list, custom rows from `appBuilderComponentSources`,
 * shared `needsSetup` (destination not committed), per-row `apis`, and the
 * reserved `__existing__` key never surfacing. Pure — the catalog is an arg,
 * nothing is mocked.
 *
 * The AI-built instance (shell-source discriminator) tests live in the sibling
 * integrationRows.instances.test.ts; shared fixtures in
 * integrationRows.testUtils.ts.
 */

import {
    resolveIntegrationRows,
    type IntegrationRow,
} from '@/features/project-creation/ui/components/integration-flow/integrationRows';
import { BASELINE_CODE } from '@/features/project-creation/ui/components/integration-flow/apiAccessConstants';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { WizardState } from '@/types/webview';
import { state, MESH_ENTRY, ERP_ENTRY, BLANK_ENTRY, CATALOG } from './integrationRows.testUtils';

/** Committed shared destination (project + workspace ids). */
const DESTINATION = {
    adobeProject: { id: 'proj-1', name: 'proj', title: 'Project One' },
    adobeWorkspace: { id: 'ws-1', name: 'Stage' },
} as Partial<WizardState>;

describe('resolveIntegrationRows — mesh row (single-authority selection)', () => {
    it('yields a mesh row when selected via selectedAppBuilderComponents', () => {
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['eds-accs-mesh'] }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            id: 'eds-accs-mesh',
            kind: 'mesh',
            name: 'Commerce API Mesh',
        });
    });

    // Removed-behavior pin (D3): the retired legacy dependency key no longer
    // yields a row — a package-seeded mesh arrives in selectedAppBuilderComponents.
    it('yields NO mesh row from the retired legacy dependency key alone', () => {
        const rows = resolveIntegrationRows(
            state({ selectedOptionalDependencies: ['eds-accs-mesh'] } as never),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows).toEqual([]);
    });

    it('yields no mesh row when no mesh is selected', () => {
        expect(resolveIntegrationRows(state(), MESH_ENTRY, CATALOG)).toEqual([]);
    });

    it("stamps the mesh row required when the resolved requirement is 'required'", () => {
        // The requirement rides the SelectableAppBuilderComponent the caller
        // already resolves (meshComponentForStack); the row carries it so the
        // card layer can withhold Remove and say why.
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['eds-accs-mesh'] }),
            { ...MESH_ENTRY, requirement: 'required' },
            CATALOG
        );

        expect(rows[0]).toMatchObject({ kind: 'mesh', required: true });
    });

    it('leaves the mesh row removable when the requirement is optional (or absent)', () => {
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['eds-accs-mesh'] }),
            { ...MESH_ENTRY, requirement: 'optional' },
            CATALOG
        );

        expect(rows[0].required).toBeFalsy();
    });

    it('stamps a NON-mesh row required from its catalog annotation (nativeForPackages path)', () => {
        // The lock is generic, not mesh-special-cased: a future nativeForPackages
        // integration resolves requirement:'required' in the selection model and
        // must ride the same row/card lock (backlog: appbuilder-app-package-bound).
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['erp-sync'] }),
            undefined,
            CATALOG.map((entry) =>
                entry.id === 'erp-sync' ? { ...entry, requirement: 'required' as const } : entry
            )
        );

        const erp = rows.find((row) => row.id === 'erp-sync');
        expect(erp).toMatchObject({ required: true });
    });

    it('yields no mesh row when the stack has no mesh component (meshComponent undefined)', () => {
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['eds-accs-mesh'] }),
            undefined,
            CATALOG
        );

        expect(rows).toEqual([]);
    });

    it('mesh sourceLine reads the entry description', () => {
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['eds-accs-mesh'] }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows[0].sourceLine).toBe('Unified GraphQL endpoint over Commerce services');
    });

    it('mesh name and sourceLine fall back when the entry carries neither', () => {
        const bareMesh = { ...MESH_ENTRY, name: '', description: '' };
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['eds-accs-mesh'] }),
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
                apis: [BASELINE_CODE], // baseline only (no free picks)
                required: false, // no requirement annotation on the entry
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
            id: 'eds-commerce-mesh',
        };
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['eds-commerce-mesh'] }),
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
    it('resolves a sourced id to a custom row (name = repo, "Custom integration · owner/repo")', () => {
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
                sourceLine: 'Custom integration · acme/widget',
                needsSetup: true,
                apis: [BASELINE_CODE], // baseline only (no free picks)
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
                apis: [BASELINE_CODE], // baseline only (no free picks)
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

describe('resolveIntegrationRows — ordering, apis, needsSetup, reserved key', () => {
    it('orders a mixed set mesh first, then catalog, then custom (regardless of selection order)', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['acme-widget', 'erp-sync', 'eds-accs-mesh'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows.map((r) => r.kind)).toEqual(['mesh', 'catalog', 'custom']);
    });

    it('carries the baseline + selectedConsoleApis picks per id (missing key → baseline only)', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['erp-sync', 'eds-accs-mesh'],
                selectedConsoleApis: { 'erp-sync': ['AnalyticsSDK', 'TargetSDK'] },
            }),
            MESH_ENTRY,
            CATALOG
        );

        const byId = Object.fromEntries(rows.map((r) => [r.id, r.apis]));
        expect(byId['erp-sync']).toEqual([BASELINE_CODE, 'AnalyticsSDK', 'TargetSDK']);
        // The mesh row surfaces its deterministic requiredApis (baseline + API Mesh).
        expect(byId['eds-accs-mesh']).toEqual([BASELINE_CODE, 'GraphQLServiceSDK']);
    });

    it("surfaces a catalog entry's requiredApis (deterministic), baseline first then required", () => {
        const withRequired: AppBuilderComponentCatalogEntry = {
            ...ERP_ENTRY,
            requiredApis: ['CampaignSDK'],
        };
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['erp-sync'] }),
            MESH_ENTRY,
            [withRequired]
        );

        expect(rows[0].apis).toEqual([BASELINE_CODE, 'CampaignSDK']);
    });

    it('orders required APIs before free picks and dedups across baseline/required/picks', () => {
        const withRequired: AppBuilderComponentCatalogEntry = {
            ...ERP_ENTRY,
            requiredApis: ['CampaignSDK'],
        };
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['erp-sync'],
                // A pick that repeats the baseline AND the required API must not duplicate.
                selectedConsoleApis: { 'erp-sync': [BASELINE_CODE, 'CampaignSDK', 'TargetSDK'] },
            }),
            MESH_ENTRY,
            [withRequired]
        );

        expect(rows[0].apis).toEqual([BASELINE_CODE, 'CampaignSDK', 'TargetSDK']);
    });

    it('dedups a pick that equals the baseline (no duplicate)', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['erp-sync'],
                selectedConsoleApis: { 'erp-sync': [BASELINE_CODE, 'TargetSDK'] },
            }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows[0].apis).toEqual([BASELINE_CODE, 'TargetSDK']);
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
        expect(rows[0]).toMatchObject({ id: 'erp-sync', apis: [BASELINE_CODE, 'TargetSDK'] });
    });

    it('needsSetup is false on every row once the shared destination is committed', () => {
        const rows = resolveIntegrationRows(
            state({
                ...DESTINATION,
                selectedAppBuilderComponents: ['erp-sync', 'eds-accs-mesh'],
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
