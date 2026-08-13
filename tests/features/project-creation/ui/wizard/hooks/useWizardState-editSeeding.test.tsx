/**
 * useWizardState - Edit-mode seeding of App Builder integration state
 *
 * Pins the edit round-trip mapping from a project's extracted settings
 * (`extractSettingsFromProject`) into initial wizard state:
 *   - `selections.appBuilder`            → `selectedAppBuilderComponents`
 *   - `appBuilderComponentSources`       → `appBuilderComponentSources`
 *   - `additionalConsoleApis`            → `selectedConsoleApis['__existing__']`
 *     (reserved key: joins the serialization union, never shown per-row)
 *
 * Written BEFORE the seeding exists (strict RED).
 */

import { renderHook } from '@testing-library/react';
import { resolveIntegrationRows } from '@/features/project-creation/ui/components/integration-flow/integrationRows';
import { isMeshSelected } from '@/features/project-creation/ui/steps/tileStatus';
import { useWizardState } from '@/features/project-creation/ui/wizard/hooks/useWizardState';
import type {
    EditProjectConfig,
    ImportedSettings,
} from '@/features/project-creation/ui/wizard/wizardHelpers';

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

        expect(state.selectedAppBuilderComponents ?? []).toEqual([]);
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

    it('seeds selectedConsoleApis.__existing__ from additionalConsoleApis', () => {
        const state = renderWizardState(
            makeEditProject({
                additionalConsoleApis: ['AssetComputeSDK', 'CCAPI'],
            })
        );

        expect(state.selectedConsoleApis).toEqual({
            __existing__: ['AssetComputeSDK', 'CCAPI'],
        });
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
                additionalConsoleApis: ['CCAPI', 'AssetComputeSDK'],
            })
        );

        expect(state.selectedConsoleApis).toEqual({
            'erp-sync': ['CCAPI'],
            'firefly-app': ['AssetComputeSDK'],
        });
    });

    it('falls back to the flat field when a settings file predates the keyed form', () => {
        // An older export has only the flat field; it must still seed something,
        // under the unattributed key, rather than importing as no picks at all.
        const state = renderWizardState(
            makeEditProject({ additionalConsoleApis: ['CCAPI'] })
        );

        expect(state.selectedConsoleApis).toEqual({ __existing__: ['CCAPI'] });
    });

    it('does not set selectedConsoleApis when additionalConsoleApis is absent', () => {
        const state = renderWizardState(makeEditProject({}));

        expect(state.selectedConsoleApis).toBeUndefined();
    });

    it('does not set selectedConsoleApis when additionalConsoleApis is empty', () => {
        const state = renderWizardState(makeEditProject({ additionalConsoleApis: [] }));

        expect(state.selectedConsoleApis).toBeUndefined();
    });

    it('seeds nothing in create mode (no editProject)', () => {
        const state = renderWizardState(undefined);

        expect(state.selectedAppBuilderComponents).toBeUndefined();
        expect(state.appBuilderComponentSources).toBeUndefined();
        expect(state.selectedConsoleApis).toBeUndefined();
        expect(state.selectedOptionalDependencies).toBeUndefined();
    });
});

/**
 * Regression: editing a project with a mesh showed "No integrations yet."
 *
 * The mesh travels the DUAL-FLOW: it is deliberately excluded from
 * `componentSelections.appBuilder` (executor filters mesh-kind) and persisted
 * only in `componentSelections.dependencies`. The row gate `isMeshSelected`
 * reads `selectedAppBuilderComponents` OR `selectedOptionalDependencies` —
 * and edit seeding never populated the latter, so BOTH keys were empty in
 * every fresh edit session (and an edit-mode Finish, which rebuilds
 * dependencies from stack deps + selectedOptionalDependencies, silently
 * DROPPED the mesh from the manifest).
 */
describe('useWizardState - edit-mode mesh dual-flow seeding', () => {
    it('seeds selectedOptionalDependencies with the mesh dep from selections.dependencies', () => {
        const state = renderWizardState(
            makeEditProject({
                selections: { dependencies: ['eds-accs-mesh', 'some-base-dep'] },
            })
        );

        // Mesh dep seeded; non-mesh base deps FILTERED (they would falsely
        // trip anyDeployableSelected and force the destination gate).
        expect(state.selectedOptionalDependencies).toEqual(['eds-accs-mesh']);
    });

    it('leaves selectedOptionalDependencies unset when dependencies carry no mesh', () => {
        const state = renderWizardState(
            makeEditProject({ selections: { dependencies: ['some-base-dep'] } })
        );

        expect(state.selectedOptionalDependencies ?? []).toEqual([]);
    });

    it('makes isMeshSelected true for the mapped catalog id (the row-gate inversion)', () => {
        const state = renderWizardState(
            makeEditProject({
                selections: { dependencies: ['eds-accs-mesh'] },
            })
        );

        // 'eds-accs-mesh' is the catalog id whose legacy mapping is
        // 'eds-accs-mesh' — the exact gate integrationRows checks at :94.
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
