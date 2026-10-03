/**
 * useWizardState - Edit-mode seeding of App Builder integration state
 *
 * Pins the edit round-trip mapping from a project's extracted settings
 * (`extractSettingsFromProject`) into initial wizard state:
 *   - `selections.appBuilder`            → `selectedAppBuilderComponents`
 *   - `appBuilderComponentSources`       → `appBuilderComponentSources`
 *   - `componentApiPicks`                → `selectedConsoleApis` (the unattributed
 *     `__existing__` key joins the serialization union, never shown per-row)
 *
 * Written BEFORE the seeding exists (strict RED).
 */

import { renderHook } from '@testing-library/react';
import { COMPONENT_IDS } from '@/core/constants';
import { resolveIntegrationRows } from '@/features/project-creation/ui/components/integration-flow/integrationRows';
import { isMeshSelected } from '@/features/project-creation/ui/steps/tileStatus';
import type { EditProjectConfig, ImportedSettings } from '@/types/wizard';
import { useWizardState } from './useWizardState.testUtils';

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn(), request: jest.fn() },
}));

const WIZARD_STEPS = [{ id: 'welcome', name: 'Welcome', enabled: true }];

function makeEditProject(settings: ImportedSettings): EditProjectConfig {
    return {
        projectName: 'edit-me',
        projectPath: '/projects/edit-me',
        settings,
    };
}

function renderWizardState(editProject?: EditProjectConfig) {
    const { result } = renderHook(() => useWizardState({ wizardSteps: WIZARD_STEPS, editProject }));
    return result.current.state;
}

describe('useWizardState - edit-mode App Builder seeding', () => {
    it('seeds selectedAppBuilderComponents from selections.appBuilder', () => {
        const state = renderWizardState(
            makeEditProject({
                selections: { appBuilder: ['erp-sync', 'owner-custom-app'] },
            })
        );

        expect(state.selectedAppBuilderComponents).toEqual(['erp-sync', 'owner-custom-app']);
    });

    it('leaves selectedAppBuilderComponents unset when selections carry no appBuilder ids', () => {
        const state = renderWizardState(makeEditProject({ selections: {} }));

        expect(state.selectedAppBuilderComponents ?? []).toStrictEqual([]);
    });

    it('seeds appBuilderComponentSources from the extracted settings', () => {
        const sources = {
            'owner-custom-app': { owner: 'owner', repo: 'custom-app', branch: 'dev' },
        };
        const state = renderWizardState(
            makeEditProject({
                selections: { appBuilder: ['owner-custom-app'] },
                appBuilderComponentSources: sources,
            })
        );

        expect(state.appBuilderComponentSources).toEqual(sources);
    });

    /**
     * Step 07 precondition, import side. The flat field lands everything under the
     * unattributed key, so an edit round-trip USED to destroy attribution even when
     * it preserved the union — reopen a project and every pick had forgotten which
     * integration wanted it. The keyed form is also the only one that will exist
     * once the flat write is retired.
     */
    it('prefers the KEYED picks, preserving which integration wanted what', () => {
        const state = renderWizardState(
            makeEditProject({
                componentApiPicks: { 'erp-sync': ['CCAPI'], 'firefly-app': ['AssetComputeSDK'] },
            })
        );

        expect(state.selectedConsoleApis).toEqual({
            'erp-sync': ['CCAPI'],
            'firefly-app': ['AssetComputeSDK'],
        });
    });

    it('seeds the unattributed picks under their reserved key, never as a row', () => {
        // A version-1 file's flat list arrives here already folded (readProjectFile).
        const state = renderWizardState(makeEditProject({ componentApiPicks: { __existing__: ['CCAPI'] } }));

        expect(state.selectedConsoleApis).toEqual({ __existing__: ['CCAPI'] });
    });

    it('does not set selectedConsoleApis when there are no picks', () => {
        const state = renderWizardState(makeEditProject({}));

        expect(state.selectedConsoleApis).toBeUndefined();
    });

    it('does not set selectedConsoleApis when the picks object is empty', () => {
        const state = renderWizardState(makeEditProject({ componentApiPicks: {} }));

        expect(state.selectedConsoleApis).toBeUndefined();
    });

    it('seeds nothing in create mode (no editProject)', () => {
        const state = renderWizardState(undefined);

        expect(state.selectedAppBuilderComponents).toBeUndefined();
        expect(state.appBuilderComponentSources).toBeUndefined();
        expect(state.selectedConsoleApis).toBeUndefined();
    });
});

/**
 * Regression: editing a project with a mesh showed "No integrations yet."
 *
 * The mesh is deliberately excluded from `componentSelections.appBuilder`
 * (executor filters mesh-kind) and persisted only in
 * `componentSelections.dependencies` (ADR-011). The row gate `isMeshSelected`
 * reads `selectedAppBuilderComponents` (the single mesh authority since D3) —
 * edit seeding must union the persisted mesh dep back into it, or the mesh row
 * vanishes in every fresh edit session (and an edit-mode Finish, which derives
 * the wire's dependencies from the mesh ids in selectedAppBuilderComponents,
 * silently DROPS the mesh from the manifest).
 */
describe('useWizardState - edit-mode mesh seeding (row-gate inversion)', () => {
    it('makes isMeshSelected true for the persisted mesh dep', () => {
        const state = renderWizardState(
            makeEditProject({
                selections: { dependencies: ['eds-accs-mesh'] },
            })
        );

        expect(isMeshSelected(state, 'eds-accs-mesh')).toBe(true);
    });

    it('resolves the mesh ROW from the seeded edit state (symptom inversion)', () => {
        const state = renderWizardState(
            makeEditProject({
                selections: { dependencies: ['eds-accs-mesh'] },
            })
        );
        const meshCatalogEntry = {
            id: 'eds-accs-mesh',
            kind: 'mesh' as const,
            name: 'API Mesh',
            description: 'GraphQL bridge',
            source: { owner: 'adobe', repo: 'commerce-mesh', branch: 'main' },
        };

        const rows = resolveIntegrationRows(state, meshCatalogEntry, []);

        expect(rows).toHaveLength(1);
        expect(rows[0].kind).toBe('mesh');
    });
});

describe('useWizardState - edit-mode mesh seeding into selectedAppBuilderComponents (D3)', () => {
    it('unions the mesh dep from selections.dependencies into selectedAppBuilderComponents', () => {
        const state = renderWizardState(
            makeEditProject({
                selections: { appBuilder: ['erp-sync'], dependencies: ['eds-accs-mesh'] },
            })
        );

        expect(state.selectedAppBuilderComponents).toEqual(['erp-sync', 'eds-accs-mesh']);
    });

    it('seeds only the mesh id when selections carry no appBuilder ids', () => {
        const state = renderWizardState(
            makeEditProject({
                selections: { dependencies: ['headless-commerce-mesh'] },
            })
        );

        expect(state.selectedAppBuilderComponents).toEqual(['headless-commerce-mesh']);
    });

    it('does not duplicate a mesh id already present in selections.appBuilder', () => {
        const state = renderWizardState(
            makeEditProject({
                selections: {
                    appBuilder: ['eds-accs-mesh'],
                    dependencies: ['eds-accs-mesh'],
                },
            })
        );

        expect(state.selectedAppBuilderComponents).toEqual(['eds-accs-mesh']);
    });

    it('does not union non-mesh base deps into selectedAppBuilderComponents', () => {
        const state = renderWizardState(
            makeEditProject({
                selections: { appBuilder: ['erp-sync'], dependencies: ['some-base-dep'] },
            })
        );

        expect(state.selectedAppBuilderComponents).toEqual(['erp-sync']);
    });
});

describe('useWizardState - edit-mode backend seeding', () => {
    it('seeds selectedBackend from selections.backend so the Backend cards pre-select (SaaS)', () => {
        const state = renderWizardState(
            makeEditProject({ selections: { backend: 'adobe-commerce-accs' } })
        );

        expect(state.selectedBackend).toBe('adobe-commerce-accs');
    });

    it('seeds the PaaS backend id too', () => {
        const state = renderWizardState(
            makeEditProject({ selections: { backend: 'adobe-commerce-paas' } })
        );

        expect(state.selectedBackend).toBe('adobe-commerce-paas');
    });

    it('leaves selectedBackend unset when selections carry no backend', () => {
        const state = renderWizardState(makeEditProject({ selections: {} }));

        expect(state.selectedBackend).toBeUndefined();
    });

    it('leaves selectedBackend unset in create mode', () => {
        const state = renderWizardState(undefined);

        expect(state.selectedBackend).toBeUndefined();
    });
});

// PL-56d: an import used to open the wizard with no integrations and no mesh,
// whatever the file said — only edit mode ran the seeding above. One function now
// feeds both, and the agent's create_project_from_file reads the same one.
describe('useWizardState - import mode seeds the same App Builder state edit mode does', () => {
    function renderImport(importedSettings: ImportedSettings) {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: WIZARD_STEPS, importedSettings }),
        );
        return result.current.state;
    }

    it('carries the integrations, the mesh, the custom sources and the API picks', () => {
        const sources = { 'owner-custom-app': { owner: 'owner', repo: 'custom-app' } };
        const state = renderImport({
            source: { project: 'sent-demo', extension: '1.0.0' },
            selections: {
                dependencies: [COMPONENT_IDS.HEADLESS_COMMERCE_MESH, 'demo-inspector'],
                appBuilder: ['erp-sync', 'owner-custom-app'],
            },
            appBuilderComponentSources: sources,
            componentApiPicks: { 'erp-sync': ['CCAPI'] },
        });

        expect(state.wizardMode).toBe('import');
        expect(state.selectedAppBuilderComponents).toEqual([
            'erp-sync',
            'owner-custom-app',
            COMPONENT_IDS.HEADLESS_COMMERCE_MESH,
        ]);
        expect(state.appBuilderComponentSources).toEqual(sources);
        expect(state.selectedConsoleApis).toEqual({ 'erp-sync': ['CCAPI'] });
    });

    it('seeds nothing for an import that names no integrations', () => {
        const state = renderImport({ source: { project: 'plain', extension: '1.0.0' }, selections: {} });

        expect(state.selectedAppBuilderComponents ?? []).toStrictEqual([]);
        expect(state.appBuilderComponentSources).toBeUndefined();
        expect(state.selectedConsoleApis).toBeUndefined();
    });
});
