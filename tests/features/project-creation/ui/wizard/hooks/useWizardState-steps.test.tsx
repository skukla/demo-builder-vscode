/**
 * useWizardState — the derived step list, the org-change reset, and the UI state
 * the hook hands back.
 *
 * WIZARD_STEPS is recomputed from three inputs at once: which steps are enabled,
 * which stack the user picked, and whether this is an edit. The org effect is the
 * one piece of behaviour here that reacts to a CHANGE rather than to the initial
 * value — it must fire on a genuine org switch and stay silent on the first org
 * the wizard ever sees.
 */

import { act, renderHook } from '@testing-library/react';
import type { Stack } from '@/types/stacks';
import type { WizardStepDefinition } from '@/types/wizard';
import { stepIds, useWizardState } from './useWizardState.testUtils';

const STACKS = [
    { id: 'eds-accs', name: 'EDS + ACCS', requiresGitHub: true },
    { id: 'headless', name: 'Headless' },
] as unknown as Stack[];

describe('WIZARD_STEPS', () => {
    const ALL_STEPS = [
        { id: 'welcome', name: 'Welcome', enabled: true },
        { id: 'disabled-step', name: 'Disabled', enabled: false },
        {
            id: 'component-selection',
            name: 'Components',
            enabled: true,
            condition: { showWhenNoStack: true },
        },
        {
            id: 'github-step',
            name: 'GitHub',
            enabled: true,
            condition: { stackRequires: 'requiresGitHub' },
        },
        {
            id: 'create-only',
            name: 'Create only',
            enabled: true,
            condition: { createModeOnly: true },
        },
    ] as unknown as WizardStepDefinition[];

    it('drops steps the configuration disables', () => {
        const { result } = renderHook(() => useWizardState({ wizardSteps: ALL_STEPS }));

        expect(stepIds(result.current.WIZARD_STEPS)).not.toContain('disabled-step');
    });

    it('shows only the unconditional and no-stack steps when no stack is picked', () => {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: ALL_STEPS, stacks: STACKS })
        );

        expect(stepIds(result.current.WIZARD_STEPS)).toEqual(['welcome', 'component-selection']);
    });

    it('swaps to the stack-gated steps once a stack that satisfies them is selected', () => {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: ALL_STEPS, stacks: STACKS })
        );

        act(() => result.current.updateState({ selectedStack: 'eds-accs' }));

        expect(stepIds(result.current.WIZARD_STEPS)).toEqual([
            'welcome',
            'github-step',
            'create-only',
        ]);
    });

    it('hides a stack-gated step when the selected stack does not satisfy it', () => {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: ALL_STEPS, stacks: STACKS })
        );

        act(() => result.current.updateState({ selectedStack: 'headless' }));

        expect(stepIds(result.current.WIZARD_STEPS)).toEqual(['welcome', 'create-only']);
    });

    it('treats a selectedStack that matches no known stack as no stack at all', () => {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: ALL_STEPS, stacks: STACKS })
        );

        act(() => result.current.updateState({ selectedStack: 'not-a-stack' }));

        expect(stepIds(result.current.WIZARD_STEPS)).toContain('component-selection');
    });

    it('hides create-only steps in edit mode', () => {
        const { result } = renderHook(() =>
            useWizardState({
                wizardSteps: ALL_STEPS,
                stacks: STACKS,
                editProject: {
                    projectName: 'p',
                    projectPath: '/p',
                    settings: {},
                },
            })
        );

        expect(stepIds(result.current.WIZARD_STEPS)).not.toContain('create-only');
    });

    it('hides create-only steps in edit mode even once a stack is selected', () => {
        const { result } = renderHook(() =>
            useWizardState({
                wizardSteps: ALL_STEPS,
                stacks: STACKS,
                editProject: { projectName: 'p', projectPath: '/p', settings: {} },
            })
        );

        act(() => result.current.updateState({ selectedStack: 'eds-accs' }));

        expect(stepIds(result.current.WIZARD_STEPS)).toEqual(['welcome', 'github-step']);
    });

    it('carries each step name and description through', () => {
        const { result } = renderHook(() =>
            useWizardState({
                wizardSteps: [
                    { id: 'welcome', name: 'Welcome', description: 'Pick a brand', enabled: true },
                ] as unknown as WizardStepDefinition[],
            })
        );

        expect(result.current.WIZARD_STEPS).toEqual([
            { id: 'welcome', name: 'Welcome', description: 'Pick a brand' },
        ]);
    });

    it('is empty when no step configuration was handed in', () => {
        const { result } = renderHook(() => useWizardState({}));

        expect(result.current.WIZARD_STEPS).toStrictEqual([]);
    });
});

describe('the org-change reset', () => {
    const STEPS = [
        { id: 'welcome', name: 'Welcome', enabled: true },
        { id: 'build-your-project', name: 'Build', enabled: true },
    ] as unknown as WizardStepDefinition[];

    function renderInMode(mode: 'create' | 'import' | 'edit') {
        const editProject =
            mode === 'edit' ? { projectName: 'p', projectPath: '/p', settings: {} } : undefined;
        const importedSettings = mode === 'import' ? { source: { project: 'p', extension: '1.0.0' } } : undefined;
        const hook = renderHook(() =>
            useWizardState({ wizardSteps: STEPS, editProject, importedSettings })
        );
        act(() => {
            hook.result.current.setCompletedSteps(['welcome', 'build-your-project']);
            hook.result.current.setConfirmedSteps(['welcome', 'build-your-project']);
            hook.result.current.updateState({ adobeOrg: { id: 'org-1', code: '', name: 'One' } });
        });
        return hook;
    }

    it('drops the build step from completed and confirmed when the org changes in edit mode', () => {
        const { result } = renderInMode('edit');

        act(() => result.current.updateState({ adobeOrg: { id: 'org-2', code: '', name: 'Two' } }));

        expect(result.current.completedSteps).toEqual(['welcome']);
        expect(result.current.confirmedSteps).toEqual(['welcome']);
    });

    it('drops the build step in import mode too', () => {
        const { result } = renderInMode('import');

        act(() => result.current.updateState({ adobeOrg: { id: 'org-2', code: '', name: 'Two' } }));

        expect(result.current.completedSteps).toEqual(['welcome']);
    });

    it('leaves the steps alone in create mode', () => {
        const { result } = renderInMode('create');

        act(() => result.current.updateState({ adobeOrg: { id: 'org-2', code: '', name: 'Two' } }));

        expect(result.current.completedSteps).toEqual(['welcome', 'build-your-project']);
        expect(result.current.confirmedSteps).toEqual(['welcome', 'build-your-project']);
    });

    it('stays silent when the org is set for the first time', () => {
        const { result } = renderHook(() =>
            useWizardState({
                wizardSteps: STEPS,
                editProject: { projectName: 'p', projectPath: '/p', settings: {} },
            })
        );
        act(() => {
            result.current.setCompletedSteps(['welcome', 'build-your-project']);
            result.current.setConfirmedSteps(['welcome', 'build-your-project']);
        });

        act(() => result.current.updateState({ adobeOrg: { id: 'org-1', code: '', name: 'One' } }));

        expect(result.current.completedSteps).toEqual(['welcome', 'build-your-project']);
    });

    it('stays silent when the org is set to the same value again', () => {
        const { result } = renderInMode('edit');

        act(() => result.current.updateState({ adobeOrg: { id: 'org-1', code: '', name: 'One' } }));

        expect(result.current.completedSteps).toEqual(['welcome', 'build-your-project']);
    });

    it('stays silent when another Adobe id changes but the org does not', () => {
        const { result } = renderInMode('edit');

        act(() =>
            result.current.updateState({ adobeProject: { id: 'proj-9', name: 'nine' } })
        );

        expect(result.current.completedSteps).toEqual(['welcome', 'build-your-project']);
        expect(result.current.confirmedSteps).toEqual(['welcome', 'build-your-project']);
    });

    it('stays silent when the org is cleared rather than switched', () => {
        const { result } = renderInMode('edit');

        act(() => result.current.updateState({ adobeOrg: undefined }));

        expect(result.current.completedSteps).toEqual(['welcome', 'build-your-project']);
    });

    it('resets once the org is switched after having been cleared', () => {
        const { result } = renderInMode('edit');

        act(() => result.current.updateState({ adobeOrg: undefined }));
        act(() =>
            result.current.updateState({ adobeOrg: { id: 'org-3', code: '', name: 'Three' } })
        );

        expect(result.current.completedSteps).toEqual(['welcome', 'build-your-project']);
    });
});

describe('the UI state the hook exposes', () => {
    const STEPS = [{ id: 'welcome', name: 'Welcome', enabled: true }] as WizardStepDefinition[];

    it('starts every transition and loading flag off, and no step completed', () => {
        const { result } = renderHook(() => useWizardState({ wizardSteps: STEPS }));

        expect(result.current.completedSteps).toStrictEqual([]);
        expect(result.current.confirmedSteps).toStrictEqual([]);
        expect(result.current.highestCompletedStepIndex).toBe(-1);
        expect(result.current.canProceed).toBe(false);
        expect(result.current.animationDirection).toBe('forward');
        expect(result.current.isTransitioning).toBe(false);
        expect(result.current.isConfirmingSelection).toBe(false);
        expect(result.current.componentsData).toBeNull();
    });

    it('merges an update into the existing state rather than replacing it', () => {
        const { result } = renderHook(() =>
            useWizardState({
                wizardSteps: STEPS,
                importedSettings: { source: { project: 'acme', extension: '1.0.0' } },
            })
        );

        act(() => result.current.updateState({ selectedPackage: 'citisignal' }));

        expect(result.current.state.selectedPackage).toBe('citisignal');
        expect(result.current.state.projectName).toBe('acme');
        expect(result.current.state.wizardMode).toBe('import');
    });

    it('keeps the same updateState function across renders', () => {
        const { result } = renderHook(() => useWizardState({ wizardSteps: STEPS }));
        const first = result.current.updateState;

        act(() => result.current.updateState({ selectedPackage: 'citisignal' }));

        expect(result.current.updateState).toBe(first);
    });

    it('lets setState replace the state wholesale', () => {
        const { result } = renderHook(() => useWizardState({ wizardSteps: STEPS }));

        act(() => result.current.setState((prev) => ({ ...prev, projectName: 'renamed' })));

        expect(result.current.state.projectName).toBe('renamed');
    });
});

describe('an Edit that changed nothing, or only integrations, skips the storefront step (PL-75)', () => {
    // It would push and republish the storefront for no change.
    const STEPS = [
        { id: 'welcome', name: 'Welcome', enabled: true },
        { id: 'review', name: 'Review', enabled: true },
        {
            id: 'storefront-setup',
            name: 'Publish Storefront',
            enabled: true,
            condition: { stackRequiresAny: ['requiresGitHub'] },
        },
        { id: 'create-project', name: 'Create', enabled: true },
    ] as unknown as WizardStepDefinition[];
    const EDITING = {
        projectName: 'justrite',
        projectPath: '/p/justrite',
        settings: { selectedStack: 'eds-accs', selectedPackage: 'justrite' },
    };

    it('records what the SC chose when the Edit opened', () => {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: STEPS, stacks: STACKS, editProject: EDITING })
        );

        expect(result.current.state.editBaseline).toEqual(expect.any(Object));
    });

    it('leaves the storefront step out while nothing has changed', () => {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: STEPS, stacks: STACKS, editProject: EDITING })
        );

        expect(stepIds(result.current.WIZARD_STEPS)).toEqual(['welcome', 'review', 'create-project']);
    });

    it('brings it back once the SC changes a choice Finish rebuilds for', () => {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: STEPS, stacks: STACKS, editProject: EDITING })
        );

        act(() => result.current.updateState({ selectedAddons: ['live-search'] }));

        expect(stepIds(result.current.WIZARD_STEPS)).toContain('storefront-setup');
    });

    it('leaves it out when the SC only changes the datapack, whose pages are written after it lands', () => {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: STEPS, stacks: STACKS, editProject: EDITING })
        );

        act(() => result.current.updateState({ datapack: { name: 'justrite', version: '2.0.0' } }));

        expect(stepIds(result.current.WIZARD_STEPS)).not.toContain('storefront-setup');
    });

    it('leaves it out when the SC only added an integration', () => {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: STEPS, stacks: STACKS, editProject: EDITING })
        );

        act(() => result.current.updateState({ selectedAppBuilderComponents: ['erp-integration'] }));

        expect(stepIds(result.current.WIZARD_STEPS)).not.toContain('storefront-setup');
    });

    it('leaves it out when the SC adds the mesh, which republishes the storefront itself', () => {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: STEPS, stacks: STACKS, editProject: EDITING })
        );

        act(() => result.current.updateState({ selectedAppBuilderComponents: ['eds-commerce-mesh'] }));

        expect(stepIds(result.current.WIZARD_STEPS)).not.toContain('storefront-setup');
    });

    it('keeps it when the SC changes the package', () => {
        const { result } = renderHook(() =>
            useWizardState({ wizardSteps: STEPS, stacks: STACKS, editProject: EDITING })
        );

        act(() => result.current.updateState({ selectedPackage: 'citisignal' }));

        expect(stepIds(result.current.WIZARD_STEPS)).toContain('storefront-setup');
    });

    it('keeps it when creating', () => {
        const { result } = renderHook(() => useWizardState({ wizardSteps: STEPS, stacks: STACKS }));

        act(() => result.current.updateState({ selectedStack: 'eds-accs' }));

        expect(stepIds(result.current.WIZARD_STEPS)).toContain('storefront-setup');
    });
});
