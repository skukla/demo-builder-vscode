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
import { useWizardState } from '@/features/project-creation/ui/wizard/hooks/useWizardState';
import type {
    EditProjectConfig,
    ImportedSettings,
} from '@/features/project-creation/ui/wizard/wizardHelpers';

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
    });
});
