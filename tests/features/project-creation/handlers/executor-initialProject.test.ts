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

    describe('additionalConsoleApis (consumed by Phase 3b subscribe union)', () => {
        it('carries additionalConsoleApis from the config onto the Project', () => {
            const project = buildInitialProject(
                config({ additionalConsoleApis: ['AssetComputeSDK', 'CCAPI'] }),
                PROJECT_PATH
            );

            expect(project.additionalConsoleApis).toEqual(['AssetComputeSDK', 'CCAPI']);
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

        it('excludes EDS mesh ids whose dependency mirror uses a DIFFERENT component id', () => {
            // commerce-paas-mesh mirrors into dependencies as eds-commerce-mesh —
            // exclusion must key on the catalog kind, not id identity, or the
            // mesh persists under two categories (appBuilder + dependencies).
            const project = buildInitialProject(
                config({
                    components: { dependencies: ['eds-commerce-mesh'] },
                    selectedAppBuilderComponents: ['commerce-paas-mesh', 'erp-sync'],
                }),
                PROJECT_PATH
            );

            expect(project.componentSelections?.appBuilder).toEqual(['erp-sync']);
            expect(project.componentSelections?.dependencies).toEqual(['eds-commerce-mesh']);
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
