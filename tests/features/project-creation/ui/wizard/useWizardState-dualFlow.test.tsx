/**
 * useWizardState Dual-Flow Regression Test (Slice 2 — Step 6)
 *
 * Locks the mesh DUAL-FLOW invariant against the new Project Builder flow:
 * selecting a mesh App Builder component in the builder mirror-writes
 * selectedOptionalDependencies (via meshAppBuilderComponentToComponentIds).
 * useWizardState gates the Adobe-auth/Adobe-IO steps on
 * hasMeshInDependencies(selectedOptionalDependencies), so this mirrored write
 * MUST keep those steps in the filtered WIZARD_STEPS list.
 *
 * This is the top regression risk of moving stack/component selection out of the
 * modal into the builder — if the mirror-write is ever dropped, the Adobe steps
 * silently disappear and mesh deployment breaks. See the dual-flow note in
 * appBuilderComponentSelectionState.ts.
 */

import { renderHook, act } from '@testing-library/react';
import { COMPONENT_IDS } from '@/core/constants';
import { useWizardState } from '@/features/project-creation/ui/wizard/hooks/useWizardState';
import { meshAppBuilderComponentToComponentIds } from '@/features/project-creation/ui/wizard/appBuilderComponentSelectionState';
import type { WizardStepConfigWithRequirements } from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { Stack } from '@/types/stacks';

// A mesh-capable EDS/ACCS stack: no native mesh in dependencies, but a mesh is
// available as an optional App Builder component (commerce-eds-mesh).
const edsAccsStack: Stack = {
    id: 'edge-delivery',
    name: 'Edge Delivery',
    description: 'EDS storefront with ACCS backend',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-accs',
    dependencies: [],
    requiresGitHub: true,
    requiresDaLive: true,
};

const stacks: Stack[] = [edsAccsStack];

// Mirrors the real wizard-steps.json shape for the steps under test.
const wizardSteps: WizardStepConfigWithRequirements[] = [
    { id: 'welcome', name: 'Demo Setup', description: '', enabled: true },
    { id: 'project-builder', name: 'Project Builder', description: '', enabled: true },
    {
        id: 'adobe-auth',
        name: 'Adobe Authentication',
        description: '',
        enabled: true,
        condition: { requiresAdobeAuth: true },
    },
    {
        id: 'adobe-project',
        name: 'I/O Project Selection',
        description: '',
        enabled: true,
        condition: { requiresAdobeIO: true },
    },
    {
        id: 'adobe-workspace',
        name: 'Workspace Selection',
        description: '',
        enabled: true,
        condition: { requiresAdobeIO: true },
    },
    { id: 'review', name: 'Final Review', description: '', enabled: true },
];

function renderWizardState() {
    return renderHook(() => useWizardState({ wizardSteps, stacks }));
}

describe('useWizardState — mesh dual-flow regression (builder path)', () => {
    it('keeps Adobe-auth and Adobe-IO steps when a mesh is selected via the builder', () => {
        const { result } = renderWizardState();

        // Builder selects the EDS/ACCS stack (no native mesh dependency).
        act(() => {
            result.current.setState(prev => ({ ...prev, selectedStack: edsAccsStack.id }));
        });

        // Builder selects the mesh App Builder component. The hook mirror-writes
        // selectedOptionalDependencies with the bridged mesh component id(s).
        const meshComponentIds = meshAppBuilderComponentToComponentIds('commerce-eds-mesh');
        expect(meshComponentIds).toContain(COMPONENT_IDS.EDS_ACCS_MESH);

        act(() => {
            result.current.setState(prev => ({
                ...prev,
                selectedAppBuilderComponents: ['commerce-eds-mesh'],
                selectedOptionalDependencies: meshComponentIds,
            }));
        });

        const stepIds = result.current.WIZARD_STEPS.map(s => s.id);
        expect(stepIds).toContain('adobe-auth');
        expect(stepIds).toContain('adobe-project');
        expect(stepIds).toContain('adobe-workspace');
    });

    it('hides Adobe-IO steps when no mesh is selected (ACCS keeps only auth)', () => {
        const { result } = renderWizardState();

        // Select the ACCS stack but NO mesh component.
        act(() => {
            result.current.setState(prev => ({
                ...prev,
                selectedStack: edsAccsStack.id,
                selectedAppBuilderComponents: [],
                selectedOptionalDependencies: [],
            }));
        });

        const stepIds = result.current.WIZARD_STEPS.map(s => s.id);
        // ACCS backend still requires auth, but project/workspace (Adobe I/O)
        // are mesh-only and must be hidden without a mesh selection.
        expect(stepIds).toContain('adobe-auth');
        expect(stepIds).not.toContain('adobe-project');
        expect(stepIds).not.toContain('adobe-workspace');
    });

    it('drops Adobe-IO steps when the mesh is deselected in the builder', () => {
        const { result } = renderWizardState();

        const meshComponentIds = meshAppBuilderComponentToComponentIds('commerce-eds-mesh');

        act(() => {
            result.current.setState(prev => ({
                ...prev,
                selectedStack: edsAccsStack.id,
                selectedAppBuilderComponents: ['commerce-eds-mesh'],
                selectedOptionalDependencies: meshComponentIds,
            }));
        });

        expect(result.current.WIZARD_STEPS.map(s => s.id)).toContain('adobe-project');

        // Deselect the mesh: the builder removes the mirrored optional deps.
        act(() => {
            result.current.setState(prev => ({
                ...prev,
                selectedAppBuilderComponents: [],
                selectedOptionalDependencies: [],
            }));
        });

        const stepIds = result.current.WIZARD_STEPS.map(s => s.id);
        expect(stepIds).not.toContain('adobe-project');
        expect(stepIds).not.toContain('adobe-workspace');
    });
});
