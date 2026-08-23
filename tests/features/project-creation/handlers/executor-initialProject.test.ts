/**
 * Executor - Initial Project Assembly
 *
 * Unit tests for `buildInitialProject` — the pure builder for the Project
 * literal assembled at the top of `executeProjectCreation` (BEFORE Phase 3b,
 * `executeAppBuilderIntegrationsPhase`, consumes it). Pins the serialization
 * spine of the Integrations redesign:
 *   - `additionalConsoleApis` (free Console API picks union) is written on the
 *     persisted Project so Phase 3b's subscribe union covers it
 *   - `appBuilderComponentSources` is NOT written (§E, shell instancing Step 8):
 *     edit mode derives sources from the keyed `appBuilderComponents` map
 *   - `componentSelections.appBuilder` records the selected integration ids
 *     (excluding mesh ids that dual-flow through dependencies)
 *
 * Written BEFORE the builder exists (strict RED).
 */

import { buildInitialProject } from '@/features/project-creation/handlers/executor';
import type { Project } from '@/types/base';

const PROJECT_PATH = '/home/user/.demo-builder/projects/demo';

function config(overrides: Record<string, unknown> = {}) {
    return { projectName: 'demo', ...overrides } as never;
}

describe('buildInitialProject', () => {
    it('sets the core fields (name, path, status, empty instances)', () => {
        const project: Project = buildInitialProject(config(), PROJECT_PATH);

        expect(project.name).toBe('demo');
        expect(project.path).toBe(PROJECT_PATH);
        expect(project.status).toBe('created');
        expect(project.componentInstances).toEqual({});
        expect(project.componentSelections?.appBuilder).toEqual([]);
    });

    it('preserves the original creation date in edit mode', () => {
        const created = new Date('2024-01-15T00:00:00Z');
        const existing = { created } as Project;

        const project = buildInitialProject(config(), PROJECT_PATH, existing);

        expect(project.created).toBe(created);
    });

    describe('additionalConsoleApis (retired by attribution step 07)', () => {
        it('does NOT persist the flat field — componentApiPicks is the one written form', () => {
            // Phase 3b's subscribe union reads resolveDesiredApis(project),
            // which derives from the keyed map; the flat wire field is ignored.
            const project = buildInitialProject(
                config({
                    additionalConsoleApis: ['AssetComputeSDK', 'CCAPI'],
                    componentApiPicks: { 'erp-sync': ['AssetComputeSDK', 'CCAPI'] },
                }),
                PROJECT_PATH
            );

            expect(project.additionalConsoleApis).toBeUndefined();
            expect(project.componentApiPicks).toEqual({
                'erp-sync': ['AssetComputeSDK', 'CCAPI'],
            });
        });

        it('leaves additionalConsoleApis undefined when absent from the config', () => {
            const project = buildInitialProject(config(), PROJECT_PATH);

            expect(project.additionalConsoleApis).toBeUndefined();
        });

        it('leaves additionalConsoleApis undefined for an empty picks list', () => {
            const project = buildInitialProject(
                config({ additionalConsoleApis: [] }),
                PROJECT_PATH
            );

            expect(project.additionalConsoleApis).toBeUndefined();
        });
    });

    describe('appBuilderComponentSources (DELETED from Project — §E derives from the keyed map)', () => {
        it('never writes appBuilderComponentSources onto the Project, even when the config carries sources', () => {
            // §E (shell instancing Step 8): the field was removed from Project.
            // Edit mode derives sources from the durable keyed
            // `appBuilderComponents` map instead — a persisted parallel copy
            // would drift (removed integrations would resurrect in edit mode).
            const project = buildInitialProject(
                config({
                    appBuilderComponentSources: {
                        'owner-custom-app': { owner: 'owner', repo: 'custom-app', branch: 'dev' },
                    },
                }),
                PROJECT_PATH
            );

            expect('appBuilderComponentSources' in project).toBe(false);
        });
    });

    describe('componentSelections.appBuilder (edit round-trip for selected ids)', () => {
        it('records selectedAppBuilderComponents in componentSelections.appBuilder', () => {
            const project = buildInitialProject(
                config({ selectedAppBuilderComponents: ['erp-sync', 'owner-custom-app'] }),
                PROJECT_PATH
            );

            expect(project.componentSelections?.appBuilder).toEqual([
                'erp-sync',
                'owner-custom-app',
            ]);
        });

        it('excludes mesh ids that dual-flow through components.dependencies (identity mapping)', () => {
            // headless-commerce-mesh maps to itself in the mesh dual-flow map —
            // the id appears verbatim in dependencies. Real catalog id.
            const project = buildInitialProject(
                config({
                    components: { dependencies: ['headless-commerce-mesh'] },
                    selectedAppBuilderComponents: ['headless-commerce-mesh', 'erp-sync'],
                }),
                PROJECT_PATH
            );

            expect(project.componentSelections?.appBuilder).toEqual(['erp-sync']);
            // The dual-flowed mesh keeps riding dependencies untouched
            expect(project.componentSelections?.dependencies).toEqual(['headless-commerce-mesh']);
        });

        it('excludes a mesh id by KIND even when dependencies does not carry it', () => {
            // Exclusion must key on the catalog kind, not on membership in
            // dependencies, or a mesh persists under two categories (appBuilder +
            // dependencies). Mesh catalog ids are registry ids now, so the two
            // always match — which means the dependencies check would mask a
            // regression in the kind check. Omitting the mirror isolates it.
            const project = buildInitialProject(
                config({
                    components: { dependencies: [] },
                    selectedAppBuilderComponents: ['eds-commerce-mesh', 'erp-sync'],
                }),
                PROJECT_PATH
            );

            expect(project.componentSelections?.appBuilder).toEqual(['erp-sync']);
        });

        it('falls back to components.appBuilder when selectedAppBuilderComponents is absent', () => {
            const project = buildInitialProject(
                config({ components: { appBuilder: ['legacy-app'] } }),
                PROJECT_PATH
            );

            expect(project.componentSelections?.appBuilder).toEqual(['legacy-app']);
        });
    });
});

/**
 * EDIT mode must not wipe the discovered store structure.
 *
 * `buildInitialProject` rebuilds the Project from the wizard config, so anything
 * it does not carry over from `existingProject` is destroyed on an edit — the
 * same reason `created` is explicitly preserved a few lines up.
 *
 * The structure is fetched from Commerce, not authored, and an edit session that
 * never reaches the Commerce step carries none. Overwriting a good structure with
 * `undefined` would silently drop every store NAME the project had, and the only
 * recovery is a Configure open the user has no reason to suspect they need.
 */
describe('buildInitialProject — commerceStoreStructure across an edit', () => {
    const STRUCTURE = {
        websites: [{ id: 2, code: 'citisignal', name: 'CitiSignal' }],
        storeGroups: [],
        storeViews: [],
    };

    it('keeps the existing structure when the edit session discovered none', () => {
        const existing = { commerceStoreStructure: STRUCTURE } as never;

        const project = buildInitialProject(
            { projectName: 'p' } as never,
            '/p',
            existing,
        );

        expect(project.commerceStoreStructure).toEqual(STRUCTURE);
    });

    it('prefers a freshly discovered structure over the stored one', () => {
        const fresh = {
            websites: [{ id: 3, code: 'renamed', name: 'Renamed' }],
            storeGroups: [],
            storeViews: [],
        };

        const project = buildInitialProject(
            { projectName: 'p', commerceStoreStructure: fresh } as never,
            '/p',
            { commerceStoreStructure: STRUCTURE } as never,
        );

        expect(project.commerceStoreStructure).toEqual(fresh);
    });

    it('carries none on a fresh create with no discovery — control', () => {
        const project = buildInitialProject({ projectName: 'p' } as never, '/p');

        expect(project.commerceStoreStructure).toBeUndefined();
    });
});
