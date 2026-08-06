/**
 * settingsSerializer — App Builder integration derivation slice (§E).
 *
 * Split from settingsSerializer.test.ts to keep both files under the eslint
 * max-lines limit. Covers extractSettingsFromProject's derivation of
 * appBuilderComponentSources from the keyed `appBuilderComponents` map plus
 * additionalConsoleApis. All other serializer behavior lives in the sibling
 * settingsSerializer.test.ts.
 */

import {
    parseSettingsFile,
    extractSettingsFromProject,
} from '@/features/projects-dashboard/services/settingsSerializer';
import type { Project } from '@/types/base';
import { SETTINGS_FILE_VERSION } from '@/features/projects-dashboard/types/settingsFile';

describe('settingsSerializer', () => {
    describe('extractSettingsFromProject - App Builder integration round-trip', () => {
        // §E (shell instancing Step 8): custom/instance sources are DERIVED from
        // the keyed `appBuilderComponents` map (the durable model) — the Project
        // no longer carries a parallel `appBuilderComponentSources` copy. The
        // derivation uses the REAL catalog: qualifying entries are
        // kind === 'integration' AND not a catalog id ('app-builder-shell',
        // 'commerce-eds-mesh', … are catalog ids and stay excluded).
        const createProject = (overrides?: Partial<Project>): Project => ({
            name: 'integrations-project',
            created: new Date(),
            lastModified: new Date(),
            path: '/path/to/project',
            status: 'ready',
            componentSelections: { appBuilder: ['firefly-image-gen', 'acme-widget'] },
            componentConfigs: {},
            ...overrides,
        });

        const INSTANCE_STATE = {
            kind: 'integration' as const,
            status: 'deployed' as const,
            name: 'Firefly Image Gen',
            source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
            url: 'https://firefly.adobeio-static.net',
        };

        const CUSTOM_IMPORT_STATE = {
            kind: 'integration' as const,
            status: 'not-deployed' as const,
            source: { owner: 'acme', repo: 'widget', branch: 'dev' },
        };

        it('derives a named instance source (with name) from the keyed map', () => {
            const project = createProject({
                appBuilderComponents: { 'firefly-image-gen': INSTANCE_STATE },
            });

            const result = extractSettingsFromProject(project);

            expect(result.appBuilderComponentSources).toEqual({
                'firefly-image-gen': {
                    owner: 'skukla',
                    repo: 'app-builder-shell',
                    branch: 'main',
                    name: 'Firefly Image Gen',
                },
            });
        });

        it('derives an unnamed custom import source (no name key fabricated)', () => {
            const project = createProject({
                appBuilderComponents: { 'acme-widget': CUSTOM_IMPORT_STATE },
            });

            const result = extractSettingsFromProject(project);

            expect(result.appBuilderComponentSources).toEqual({
                'acme-widget': { owner: 'acme', repo: 'widget', branch: 'dev' },
            });
            // toEqual ignores undefined-valued keys — pin the key's absence too.
            expect('name' in (result.appBuilderComponentSources?.['acme-widget'] ?? {})).toBe(
                false
            );
        });

        it('excludes catalog-id entries (legacy fixed-id shell) from the derived sources', () => {
            // 'app-builder-shell' IS a catalog id: it round-trips via the
            // selection id + catalog entry, so deriving a source for it would
            // flip its edit-mode row from the blank-catalog branch to custom.
            const project = createProject({
                appBuilderComponents: {
                    'app-builder-shell': {
                        kind: 'integration',
                        status: 'deployed',
                        source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
                    },
                    'firefly-image-gen': INSTANCE_STATE,
                },
            });

            const result = extractSettingsFromProject(project);

            expect(Object.keys(result.appBuilderComponentSources ?? {})).toEqual([
                'firefly-image-gen',
            ]);
        });

        it('excludes mesh-kind entries (catalog mesh AND legacy "mesh" key)', () => {
            const project = createProject({
                appBuilderComponents: {
                    'commerce-eds-mesh': {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: 'skukla', repo: 'commerce-eds-mesh', branch: 'main' },
                        endpoint: 'https://mesh/graphql',
                    },
                    // Migrated legacy key: mesh kind but NOT a catalog id.
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: 'skukla', repo: 'commerce-mesh' },
                    },
                },
            });

            const result = extractSettingsFromProject(project);

            expect(result.appBuilderComponentSources).toBeUndefined();
        });

        it('skips malformed entries lacking a source', () => {
            const project = createProject({
                appBuilderComponents: {
                    'broken-entry': {
                        kind: 'integration',
                        status: 'error',
                    } as never,
                    'acme-widget': CUSTOM_IMPORT_STATE,
                },
            });

            const result = extractSettingsFromProject(project);

            expect(Object.keys(result.appBuilderComponentSources ?? {})).toEqual(['acme-widget']);
        });

        it('omits appBuilderComponentSources when the project has no keyed map', () => {
            const project = createProject();

            const result = extractSettingsFromProject(project);

            expect(result.appBuilderComponentSources).toBeUndefined();
        });

        it('should extract additionalConsoleApis when present', () => {
            const project = createProject({
                additionalConsoleApis: ['AssetComputeSDK', 'CCAPI'],
            });

            const result = extractSettingsFromProject(project);

            expect(result.additionalConsoleApis).toEqual(['AssetComputeSDK', 'CCAPI']);
        });

        it('should omit additionalConsoleApis when absent', () => {
            const project = createProject();

            const result = extractSettingsFromProject(project);

            expect(result.additionalConsoleApis).toBeUndefined();
        });

        /**
         * Step 07 precondition. Export carried the flat field ALONE, so retiring the
         * flat write would have made every exported settings file silently drop the
         * user's API picks — and an edit round-trip already collapsed attribution
         * into the unattributed bucket even while it worked.
         */
        it('exports the KEYED picks, the form that survives step 07', () => {
            const project = createProject({
                componentApiPicks: { 'erp-sync': ['CCAPI'], 'firefly-app': ['AssetComputeSDK'] },
                additionalConsoleApis: ['CCAPI', 'AssetComputeSDK'],
            });

            const result = extractSettingsFromProject(project);

            expect(result.componentApiPicks).toEqual({
                'erp-sync': ['CCAPI'],
                'firefly-app': ['AssetComputeSDK'],
            });
        });

        it('omits the keyed picks when there are none', () => {
            expect(extractSettingsFromProject(createProject()).componentApiPicks).toBeUndefined();
        });

        it('should keep the existing shape stable alongside the derived fields', () => {
            const project = createProject({
                appBuilderComponents: { 'acme-widget': CUSTOM_IMPORT_STATE },
                additionalConsoleApis: ['CCAPI'],
            });

            const result = extractSettingsFromProject(project);

            expect(result.selections).toEqual({
                appBuilder: ['firefly-image-gen', 'acme-widget'],
            });
            expect(result.configs).toEqual({});
            expect(result.version).toBe(SETTINGS_FILE_VERSION);
            expect(result.source.project).toBe('integrations-project');
        });

        it('should leave includeSecrets behavior unchanged with the derived fields present', () => {
            const project = createProject({ additionalConsoleApis: ['CCAPI'] });

            expect(extractSettingsFromProject(project, true).includesSecrets).toBe(true);
            expect(extractSettingsFromProject(project, false).includesSecrets).toBe(false);
        });

        it('should round-trip: export then parse preserves derived sources + names + apis', () => {
            const project = createProject({
                appBuilderComponents: {
                    'firefly-image-gen': INSTANCE_STATE,
                    'order-sync': { ...INSTANCE_STATE, name: 'Order Sync' },
                    'acme-widget': CUSTOM_IMPORT_STATE,
                },
                additionalConsoleApis: ['AssetComputeSDK', 'CCAPI'],
            });

            const exported = extractSettingsFromProject(project);
            const parseResult = parseSettingsFile(JSON.stringify(exported));

            expect(parseResult.success).toBe(true);
            if (parseResult.success) {
                expect(parseResult.settings.appBuilderComponentSources).toEqual({
                    'firefly-image-gen': {
                        owner: 'skukla',
                        repo: 'app-builder-shell',
                        branch: 'main',
                        name: 'Firefly Image Gen',
                    },
                    'order-sync': {
                        owner: 'skukla',
                        repo: 'app-builder-shell',
                        branch: 'main',
                        name: 'Order Sync',
                    },
                    'acme-widget': { owner: 'acme', repo: 'widget', branch: 'dev' },
                });
                expect(parseResult.settings.additionalConsoleApis).toEqual([
                    'AssetComputeSDK',
                    'CCAPI',
                ]);
            }
        });
    });
});
