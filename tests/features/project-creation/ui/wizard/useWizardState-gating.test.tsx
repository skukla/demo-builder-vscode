/**
 * useWizardState App Builder Step-Gating Test (R1 — Step 1 of 7)
 *
 * Locks the GENERALIZED step-gating invariant: the Adobe-auth step must appear
 * for ANY selected App Builder component, not just mesh. Previously hasAdobeAuth
 * was gated on `meshIncluded || isAccsBackend`; it is now also gated on whether
 * any App Builder component is selected (`selectedAppBuilderComponents`).
 *
 * Critical boundary: a NON-mesh App Builder component shows `adobe-auth` (sign-in
 * only) but must NOT show `adobe-project` / `adobe-workspace` — those remain
 * mesh-only (gated on hasAdobeIO / hasMeshInDependencies). See the dual-flow
 * regression test (useWizardState-dualFlow.test.tsx) which guards the mesh path.
 */

import { renderHook, act } from '@testing-library/react';
import { useWizardState } from '@/features/project-creation/ui/wizard/hooks/useWizardState';
import type { WizardStepConfigWithRequirements } from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { Stack } from '@/types/stacks';

// A non-ACCS, non-mesh stack: no native mesh dependency, backend is NOT ACCS, so
// neither meshIncluded nor isAccsBackend is true. The only thing that can surface
// the Adobe-auth step is a selected App Builder component.
const nonMeshStack: Stack = {
    id: 'paas-stack',
    name: 'PaaS Stack',
    description: 'Adobe Commerce PaaS backend, no mesh, no ACCS',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-paas',
    dependencies: [],
    requiresGitHub: true,
    requiresDaLive: true,
};

const stacks: Stack[] = [nonMeshStack];

// Mirrors the real wizard-steps.json shape for the steps under test.
const wizardSteps: WizardStepConfigWithRequirements[] = [
    { id: 'welcome', name: 'Demo Setup', description: '', enabled: true },
    { id: 'prerequisites', name: 'Prerequisites', description: '', enabled: true },
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

describe('useWizardState — App Builder step-gating (generalized)', () => {
    it('shows adobe-auth but hides adobe-project/workspace for a non-mesh App Builder component', () => {
        const { result } = renderHook(() => useWizardState({ wizardSteps, stacks }));

        act(() => {
            result.current.setState(prev => ({
                ...prev,
                selectedStack: nonMeshStack.id,
                selectedAppBuilderComponents: ['some-non-mesh-app'],
                selectedOptionalDependencies: [],
            }));
        });

        const stepIds = result.current.WIZARD_STEPS.map(s => s.id);
        expect(stepIds).toContain('adobe-auth');
        expect(stepIds).not.toContain('adobe-project');
        expect(stepIds).not.toContain('adobe-workspace');
    });

    it('hides all Adobe steps when no App Builder component, no mesh, and a non-ACCS stack', () => {
        const { result } = renderHook(() => useWizardState({ wizardSteps, stacks }));

        act(() => {
            result.current.setState(prev => ({
                ...prev,
                selectedStack: nonMeshStack.id,
                selectedAppBuilderComponents: [],
                selectedOptionalDependencies: [],
            }));
        });

        const stepIds = result.current.WIZARD_STEPS.map(s => s.id);
        expect(stepIds).not.toContain('adobe-auth');
        expect(stepIds).not.toContain('adobe-project');
        expect(stepIds).not.toContain('adobe-workspace');
    });

    it('recomputes gating when an App Builder component is toggled on then off', () => {
        const { result } = renderHook(() => useWizardState({ wizardSteps, stacks }));

        act(() => {
            result.current.setState(prev => ({
                ...prev,
                selectedStack: nonMeshStack.id,
                selectedAppBuilderComponents: [],
                selectedOptionalDependencies: [],
            }));
        });

        expect(result.current.WIZARD_STEPS.map(s => s.id)).not.toContain('adobe-auth');

        // Toggle a non-mesh App Builder component ON.
        act(() => {
            result.current.setState(prev => ({
                ...prev,
                selectedAppBuilderComponents: ['some-non-mesh-app'],
            }));
        });

        expect(result.current.WIZARD_STEPS.map(s => s.id)).toContain('adobe-auth');

        // Toggle it back OFF.
        act(() => {
            result.current.setState(prev => ({
                ...prev,
                selectedAppBuilderComponents: [],
            }));
        });

        expect(result.current.WIZARD_STEPS.map(s => s.id)).not.toContain('adobe-auth');
    });
});
