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

import { renderHook, act } from '@testing-library/react';
import { useWizardState } from '@/features/project-creation/ui/wizard/hooks/useWizardState';
import type {
    EditProjectConfig,
    ImportedSettings,
} from '@/features/project-creation/ui/wizard/wizardHelpers';
import { vscode } from '@/core/ui/utils/vscode-api';
import type { EditDraft } from '@/types/webview';

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

describe('useWizardState - edit-mode reversible draft', () => {
    /** A saved project with one integration, plus a draft that removed it. */
    function editProjectWithDraft(): EditProjectConfig {
        return {
            ...makeEditProject({ selections: { appBuilder: ['erp-sync'] } }),
            editDraft: { projectName: 'edit-me', selectedAppBuilderComponents: [] } as EditDraft,
        };
    }

    it('applies the draft over the config-seeded state (draft wins) and flags the restore', () => {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: WIZARD_STEPS, editProject: editProjectWithDraft() })
        );

        // The saved project had ['erp-sync']; the draft removed it.
        expect(result.current.state.selectedAppBuilderComponents).toEqual([]);
        expect(result.current.hasRestoredDraft).toBe(true);
    });

    it('does not flag a restore when no draft exists (seeds straight from saved state)', () => {
        const { result } = renderHook(() =>
            useWizardState({
                wizardSteps: WIZARD_STEPS,
                editProject: makeEditProject({ selections: { appBuilder: ['erp-sync'] } }),
            })
        );

        expect(result.current.hasRestoredDraft).toBe(false);
        expect(result.current.state.selectedAppBuilderComponents).toEqual(['erp-sync']);
    });

    it('discardEditDraft resets to the saved state, posts clear-edit-draft, and clears the flag', () => {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: WIZARD_STEPS, editProject: editProjectWithDraft() })
        );
        expect(result.current.state.selectedAppBuilderComponents).toEqual([]); // draft applied

        act(() => {
            result.current.discardEditDraft();
        });

        // Reverted to the project's saved selection.
        expect(result.current.state.selectedAppBuilderComponents).toEqual(['erp-sync']);
        expect(result.current.hasRestoredDraft).toBe(false);
        expect(vscode.postMessage).toHaveBeenCalledWith('clear-edit-draft', {
            projectPath: '/projects/edit-me',
        });
    });
});
