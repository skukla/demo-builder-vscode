/**
 * useIntegrationFlow tests (Integrations flow redesign — Step 4)
 *
 * The stage-machine hook behind the Add Integration modal: walks the derived
 * stage order (flowStages), keeps a modal-local FlowDraft, commits the shared
 * Adobe I/O destination on the dest-stage Continues, and on the LAST stage
 * finishes through the UNCHANGED useProjectBuilder handlers. Cancel is the modal
 * closing without onContinue — draft mutations never write wizard state.
 *
 * This suite owns the STAGE ORDER and the destination commits. What each kind
 * commits at the finish lives in the -finish suite; api-edit in the -apiEdit one.
 * The harness and fixtures are shared through useIntegrationFlow.testUtils.
 */

import { act } from '@testing-library/react';
import type { WizardState } from '@/types/webview';
import {
    setupAddFlow as setup,
    pickKindAndContinue,
    ADD_SIGNED_IN as SIGNED_IN,
    ADD_SIGNED_OUT as SIGNED_OUT,
    LATER_ADD,
    MESH_ID,
    PROJECT,
    OTHER_PROJECT,
    WORKSPACE,
    type AddFlowSetup as Setup,
} from './useIntegrationFlow.testUtils';

describe('useIntegrationFlow — initial stage and kind walk (add mode)', () => {
    it('starts at the kind stage in add mode', () => {
        const s = setup();
        expect(s.result.current.stage).toBe('kind');
    });

    it('starts at dest-project in destination mode when signed in', () => {
        const s = setup({ mode: 'destination' });
        expect(s.result.current.stage).toBe('dest-project');
    });

    it('starts at dest-signin in destination mode when signed out', () => {
        const s = setup({ mode: 'destination', initial: SIGNED_OUT });
        expect(s.result.current.stage).toBe('dest-signin');
    });

    it('blocks Continue on the kind stage before a kind is picked', () => {
        const s = setup();
        expect(s.result.current.canContinue).toBe(false);
    });

    it('enables Continue once a kind is picked', () => {
        const s = setup();
        act(() => s.result.current.pickKind('catalog'));
        expect(s.result.current.canContinue).toBe(true);
    });

    it('makes onContinue a no-op while the gate fails (stage kept, no writes)', () => {
        const s = setup();
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('kind');
        expect(s.updateState).not.toHaveBeenCalled();
    });

    it('advances catalog kind to source-catalog', () => {
        const s = setup();
        pickKindAndContinue(s, 'catalog');
        expect(s.result.current.stage).toBe('source-catalog');
    });

    it('blocks Continue on source-catalog until an entry is picked, then advances to dest-project', () => {
        const s = setup();
        pickKindAndContinue(s, 'catalog');
        expect(s.result.current.canContinue).toBe(false);
        act(() => s.result.current.pickCatalog('erp-sync'));
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('dest-project');
    });

    it('advances mesh kind straight to dest-project (no source stage)', () => {
        const s = setup();
        pickKindAndContinue(s, 'mesh');
        expect(s.result.current.stage).toBe('dest-project');
    });

    it('routes a signed-out catalog add through dest-signin and gates Continue there', () => {
        const s = setup({ initial: SIGNED_OUT });
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog('erp-sync'));
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('dest-signin');
        expect(s.result.current.canContinue).toBe(false);
    });

    it('clamps forward off dest-signin when the user signs in mid-flow', () => {
        const s = setup({ initial: SIGNED_OUT });
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog('erp-sync'));
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('dest-signin');
        s.stateRef.current = { ...s.stateRef.current, ...SIGNED_IN } as WizardState;
        s.sync();
        expect(s.result.current.stage).toBe('dest-project');
    });
});

describe('useIntegrationFlow — footer surfaces', () => {
    it('labels Continue mid-flow', () => {
        const s = setup();
        expect(s.result.current.continueLabel).toBe('Continue');
    });

    it('labels the mesh dest-workspace step (terminal) with the plain add label', () => {
        const s = setup();
        pickKindAndContinue(s, 'mesh');
        expect(s.result.current.stage).toBe('dest-project');
        expect(s.result.current.continueLabel).toBe('Continue');
        act(() => s.result.current.setPendingProject(PROJECT));
        act(() => s.result.current.onContinue());
        s.sync();
        // dest-workspace is terminal for the deterministic mesh (no api-access step),
        // so its footer already reads the finish label — nothing provisioned here.
        expect(s.result.current.stage).toBe('dest-workspace');
        expect(s.result.current.continueLabel).toBe('Add Integration');
    });

    it('labels the last destination-mode stage Save', () => {
        const s = setup({
            mode: 'destination',
            initial: { adobeProject: PROJECT },
        });
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('dest-workspace');
        expect(s.result.current.continueLabel).toBe('Save');
    });

    it('disables Back on the first stage', () => {
        const s = setup();
        expect(s.result.current.canGoBack).toBe(false);
    });

    it('enables Back mid-flow and walks back through the order', () => {
        const s = setup();
        pickKindAndContinue(s, 'catalog');
        expect(s.result.current.canGoBack).toBe(true);
        act(() => s.result.current.onBack());
        expect(s.result.current.stage).toBe('kind');
    });

    it('makes onBack a no-op on the first stage', () => {
        const s = setup();
        act(() => s.result.current.onBack());
        expect(s.result.current.stage).toBe('kind');
    });
});

describe('useIntegrationFlow — dest-project Continue', () => {
    it('commits the pending project and clears the workspace + cache', () => {
        const s = setup({
            initial: { adobeWorkspace: WORKSPACE, workspacesCache: [WORKSPACE] },
        });
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.setPendingProject(PROJECT));
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({
            adobeProject: PROJECT,
            adobeWorkspace: undefined,
            workspacesCache: undefined,
        });
    });

    it('advances to dest-workspace after committing the project', () => {
        const s = setup();
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.setPendingProject(PROJECT));
        act(() => s.result.current.onContinue());
        s.sync();
        expect(s.result.current.stage).toBe('dest-workspace');
    });

    it('advances without any write when the project is already committed and no pending exists', () => {
        const s = setup({ initial: { adobeProject: PROJECT } });
        pickKindAndContinue(s, 'mesh');
        expect(s.result.current.stage).toBe('dest-project');
        act(() => s.result.current.onContinue());
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.result.current.stage).toBe('dest-workspace');
    });

    it('does NOT clear the workspace when the pending project equals the committed one', () => {
        const s = setup({ initial: { adobeProject: PROJECT } });
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.setPendingProject({ ...PROJECT }));
        act(() => s.result.current.onContinue());
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.result.current.stage).toBe('dest-workspace');
    });

    it('commits a DIFFERENT pending project over an already-committed one', () => {
        const s = setup({ initial: { adobeProject: PROJECT, adobeWorkspace: WORKSPACE } });
        // Committed destination → later-add summary; Change re-expands the dest stages.
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.changeDestination());
        expect(s.result.current.stage).toBe('dest-project');
        act(() => s.result.current.setPendingProject(OTHER_PROJECT));
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({
            adobeProject: OTHER_PROJECT,
            adobeWorkspace: undefined,
            workspacesCache: undefined,
        });
    });

    it('blocks Continue while a destination phase is running (setPhaseRunning seam)', () => {
        const s = setup();
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.setPendingProject(PROJECT));
        expect(s.result.current.canContinue).toBe(true);
        act(() => s.result.current.setPhaseRunning(true));
        expect(s.result.current.canContinue).toBe(false);
        act(() => s.result.current.setPhaseRunning(false));
        expect(s.result.current.canContinue).toBe(true);
    });
});

describe('useIntegrationFlow — dest-workspace Continue and mesh finish', () => {
    function walkMeshToDestWorkspace(s: Setup): void {
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.setPendingProject(PROJECT));
        act(() => s.result.current.onContinue());
        s.sync();
    }

    it('commits the pending workspace and finishes (dest-workspace is terminal for mesh)', () => {
        const s = setup();
        walkMeshToDestWorkspace(s);
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({ adobeWorkspace: WORKSPACE });
    });

    it('Add commits the mesh and closes immediately — no subscribe, no Done hold', () => {
        const s = setup();
        walkMeshToDestWorkspace(s);
        expect(s.result.current.stage).toBe('dest-workspace');
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));

        // dest-workspace is terminal for the deterministic mesh (no api-access step):
        // a single Add press commits the workspace, toggles the mesh, and closes —
        // no enable request, no "Done" hold.
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({ adobeWorkspace: WORKSPACE });
        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith(MESH_ID, true);
        expect(s.onClose).toHaveBeenCalledTimes(1);
        // The modal provisions nothing — all APIs subscribe at the rebuild. Nothing
        // asserts that here: this hook has no webviewClient dependency at all, so a
        // "never requested" expectation would only be checking an unwired spy.
    });

    it('finishes a later-add mesh from the KIND stage in one Add press', () => {
        const s = setup({ initial: LATER_ADD });
        // Later-add drops the destination stages entirely (it shows as a context
        // line), so the kind stage is terminal for the mesh.
        act(() => s.result.current.pickKind('mesh'));
        expect(s.result.current.stage).toBe('kind');
        act(() => s.result.current.onContinue()); // Add → commit + close
        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith(MESH_ID, true);
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });
});

describe('useIntegrationFlow — destination mode', () => {
    it('Save with an already-committed destination performs no writes, only onClose', () => {
        const s = setup({
            mode: 'destination',
            initial: { adobeProject: PROJECT, adobeWorkspace: WORKSPACE },
        });
        act(() => s.result.current.onContinue()); // dest-project (committed) → dest-workspace
        act(() => s.result.current.onContinue()); // dest-workspace (committed) → Save
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('Change flow commits new pendings then Saves without a builder call', () => {
        const s = setup({
            mode: 'destination',
            initial: { adobeProject: PROJECT, adobeWorkspace: WORKSPACE },
        });
        act(() => s.result.current.setPendingProject(OTHER_PROJECT));
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({
            adobeProject: OTHER_PROJECT,
            adobeWorkspace: undefined,
            workspacesCache: undefined,
        });
        s.sync();
        expect(s.result.current.stage).toBe('dest-workspace');
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({ adobeWorkspace: WORKSPACE });
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });
});

describe('useIntegrationFlow — changingDestination', () => {
    it('changeDestination re-expands the dest stages at dest-project and flags the draft', () => {
        const s = setup({ initial: LATER_ADD });
        // Change now comes from the context LINE, not a summary stage — the kind
        // stage is where a later-add mesh sits when it fires.
        act(() => s.result.current.pickKind('mesh'));
        expect(s.result.current.stage).toBe('kind');
        act(() => s.result.current.changeDestination());
        expect(s.result.current.draft.changingDestination).toBe(true);
        expect(s.result.current.stage).toBe('dest-project');
    });
});

describe('useIntegrationFlow — cancel path (draft-only, no commits)', () => {
    it('draft setters never write wizard state', () => {
        const s = setup();
        act(() => s.result.current.pickKind('catalog'));
        act(() => s.result.current.pickCatalog('erp-sync'));
        act(() => s.result.current.setCustomSource({ owner: 'acme', repo: 'widget' }));
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.setPendingProject(PROJECT));
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
        expect(s.onClose).not.toHaveBeenCalled();
    });
});

// The slice booleans decide whether the destination stages appear at all. Each of
// them is a separate wizard-state fact, and reading two of them as one is exactly
// how a half-committed destination would be skipped.
describe('useIntegrationFlow — what makes the destination collapse', () => {
    it('starts with changingDestination false (the dest stages are not re-expanded)', () => {
        const s = setup();
        expect(s.result.current.draft.changingDestination).toBe(false);
    });

    it('walks the destination when the project is committed but the workspace is not', () => {
        const s = setup({
            initial: {
                adobeProject: PROJECT,
                selectedAppBuilderComponents: ['existing-integration'],
            },
        });
        pickKindAndContinue(s, 'mesh');

        expect(s.result.current.stage).toBe('dest-project');
        expect(s.onClose).not.toHaveBeenCalled();
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
    });

    it('walks the destination when nothing references it — a mesh the stack lacks is not a reference', () => {
        const s = setup({
            meshComponent: null,
            initial: { adobeProject: PROJECT, adobeWorkspace: WORKSPACE },
        });
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog('erp-sync'));
        act(() => s.result.current.onContinue());

        expect(s.result.current.stage).toBe('dest-project');
        expect(s.onClose).not.toHaveBeenCalled();
    });

    it('Change re-enters at the sign-in step when the session lapsed after the modal opened', () => {
        const s = setup({ initial: LATER_ADD });
        expect(s.result.current.stage).toBe('kind');

        s.stateRef.current = { ...s.stateRef.current, ...SIGNED_OUT } as WizardState;
        s.sync();
        act(() => s.result.current.changeDestination());

        expect(s.result.current.stage).toBe('dest-signin');
    });
});

describe('useIntegrationFlow — draft edits that must not reach wizard state early', () => {
    it('commits neither destination field from a stage that is not its own', () => {
        const s = setup();
        act(() => s.result.current.setPendingProject(OTHER_PROJECT));
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        act(() => s.result.current.pickKind('mesh'));
        act(() => s.result.current.onContinue()); // leaves the KIND stage

        expect(s.result.current.stage).toBe('dest-project');
        expect(s.updateState).not.toHaveBeenCalled();
    });

    it('toggleApi removes only the code toggled off', () => {
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.onContinue()); // → api-access

        act(() => s.result.current.toggleApi('FireflyServicesSDK'));
        act(() => s.result.current.toggleApi('PhotoshopSDK'));
        act(() => s.result.current.toggleApi('FireflyServicesSDK'));

        expect(s.result.current.draft.selectedApis).toEqual(['PhotoshopSDK']);
    });
});
