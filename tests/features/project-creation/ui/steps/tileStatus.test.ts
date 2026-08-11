/**
 * tileStatus predicates (R1b — Step 1)
 *
 * Pure per-tile "configured" predicates for the group-step config tiles. They
 * derive from PERSISTED wizard state so a tile's badge (⚠ Needs setup → ✓
 * Configured) and the step's Continue gate stay correct when the modal is closed
 * and across back/forward navigation. Each predicate combines persisted
 * selections with the authoritative validity verdict the modal body reports
 * (`commerceConnectValid` from ConnectStoreStepContent's onValidationChange;
 * `storefrontRepoValid` from RepoSelectionInline's onValidityChange).
 */

import {
    anyDeployableSelected,
    isAdobeSignedIn,
    isCommerceConfigured,
    isIntegrationsComplete,
    isMeshSelected,
    isStorefrontConfigured,
    meshComponentForStack,
} from '@/features/project-creation/ui/steps/tileStatus';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

function state(overrides: Partial<WizardState> = {}): WizardState {
    return overrides as WizardState;
}

describe('isCommerceConfigured', () => {
    it('is false when no stack is selected', () => {
        expect(isCommerceConfigured(state({ commerceConnectValid: true }))).toBe(false);
    });

    it('is false when a stack is selected but the connect form is not valid', () => {
        expect(isCommerceConfigured(state({ selectedStack: 'eds-paas' }))).toBe(false);
        expect(
            isCommerceConfigured(state({ selectedStack: 'eds-paas', commerceConnectValid: false }))
        ).toBe(false);
    });

    it('is true when a stack is selected AND the connect form is valid', () => {
        expect(
            isCommerceConfigured(state({ selectedStack: 'eds-paas', commerceConnectValid: true }))
        ).toBe(true);
    });
});

describe('isStorefrontConfigured', () => {
    const authed = {
        githubAuth: { isAuthenticated: true },
        daLiveAuth: { isAuthenticated: true },
    };

    it('is false when GitHub is not authenticated', () => {
        expect(
            isStorefrontConfigured(
                state({
                    edsConfig: { daLiveAuth: { isAuthenticated: true } },
                    storefrontRepoValid: true,
                })
            )
        ).toBe(false);
    });

    it('is false when DA.live is not authenticated', () => {
        expect(
            isStorefrontConfigured(
                state({
                    edsConfig: { githubAuth: { isAuthenticated: true } },
                    storefrontRepoValid: true,
                })
            )
        ).toBe(false);
    });

    it('is false when both authed but the repo is not valid', () => {
        expect(isStorefrontConfigured(state({ edsConfig: authed }))).toBe(false);
        expect(
            isStorefrontConfigured(
                state({
                    edsConfig: authed,
                    storefrontRepoValid: false,
                    storefrontCodeSyncValid: true,
                })
            )
        ).toBe(false);
    });

    it('is false when the repo is valid but code-sync is not', () => {
        expect(
            isStorefrontConfigured(state({ edsConfig: authed, storefrontRepoValid: true }))
        ).toBe(false);
        expect(
            isStorefrontConfigured(
                state({
                    edsConfig: authed,
                    storefrontRepoValid: true,
                    storefrontCodeSyncValid: false,
                })
            )
        ).toBe(false);
    });

    it('is true when GitHub + DA.live authed AND repo + code-sync are valid', () => {
        expect(
            isStorefrontConfigured(
                state({
                    edsConfig: authed,
                    storefrontRepoValid: true,
                    storefrontCodeSyncValid: true,
                })
            )
        ).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Mesh predicates — availability is derived from the real app-builder-components
// catalog the way the App Builder picker derives it: the stack's backend +
// frontend select a `kind: "mesh"` component. eds-storefront + PaaS → mesh exists;
// a non-mesh stack (e.g. eds-storefront with no compatible backend) → none.
// ---------------------------------------------------------------------------
const packages = [{ id: 'citisignal', name: 'Citisignal' }] as unknown as DemoPackage[];
const meshStack = {
    id: 'eds-paas',
    name: 'EDS + PaaS',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-paas',
} as unknown as Stack;
const nonMeshStack = {
    id: 'eds-none',
    name: 'EDS + (no mesh backend)',
    frontend: 'eds-storefront',
    backend: 'some-unknown-backend',
} as unknown as Stack;
const stacks = [meshStack, nonMeshStack] as Stack[];

describe('meshComponentForStack', () => {
    it('resolves the mesh component for an eds-storefront + PaaS stack', () => {
        const s = state({ selectedPackage: 'citisignal', selectedStack: 'eds-paas' });
        const mesh = meshComponentForStack(s, packages, stacks);
        expect(mesh?.id).toBe('eds-commerce-mesh');
        expect(mesh?.kind).toBe('mesh');
    });

    it('resolves nothing on a stack whose backend has no mesh component', () => {
        const s = state({ selectedPackage: 'citisignal', selectedStack: 'eds-none' });
        expect(meshComponentForStack(s, packages, stacks)).toBeUndefined();
    });

    it('resolves nothing when no stack is committed', () => {
        const s = state({ selectedPackage: 'citisignal' });
        expect(meshComponentForStack(s, packages, stacks)).toBeUndefined();
    });
});

describe('isMeshSelected', () => {
    it('is false when the mesh id is in neither selection list', () => {
        expect(isMeshSelected(state({}), 'eds-commerce-mesh')).toBe(false);
    });

    it('is true when the mesh catalog id is in selectedAppBuilderComponents', () => {
        expect(
            isMeshSelected(
                state({ selectedAppBuilderComponents: ['eds-commerce-mesh'] }),
                'eds-commerce-mesh'
            )
        ).toBe(true);
    });

    it('is true via the dual-flow when the legacy mesh dep is in selectedOptionalDependencies', () => {
        expect(
            isMeshSelected(
                state({ selectedOptionalDependencies: ['eds-commerce-mesh'] }),
                'eds-commerce-mesh'
            )
        ).toBe(true);
    });
});

describe('isIntegrationsComplete', () => {
    it('is true when no mesh applies to the architecture (nothing to configure)', () => {
        const s = state({ selectedPackage: 'citisignal', selectedStack: 'eds-none' });
        expect(isIntegrationsComplete(s, packages, stacks)).toBe(true);
    });

    it('is true when a mesh is available but left Off (mesh is optional)', () => {
        const s = state({ selectedPackage: 'citisignal', selectedStack: 'eds-paas' });
        expect(isIntegrationsComplete(s, packages, stacks)).toBe(true);
    });

    it('is false when mesh is On but neither project nor workspace is chosen', () => {
        const s = state({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: ['eds-commerce-mesh'],
        });
        expect(isIntegrationsComplete(s, packages, stacks)).toBe(false);
    });

    it('is false when mesh is On with a project but no workspace', () => {
        const s = state({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: ['eds-commerce-mesh'],
            adobeProject: { id: 'p1', name: 'proj' },
        });
        expect(isIntegrationsComplete(s, packages, stacks)).toBe(false);
    });

    it('is true when mesh is On with BOTH project and workspace chosen (signed in)', () => {
        const s = state({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: ['eds-commerce-mesh'],
            adobeAuth: { isAuthenticated: true, isChecking: false },
            adobeOrg: { id: 'org-1', name: 'Acme', code: 'ACME' } as WizardState['adobeOrg'],
            adobeProject: { id: 'p1', name: 'proj' },
            adobeWorkspace: { id: 'w1', name: 'ws' },
        });
        expect(isIntegrationsComplete(s, packages, stacks)).toBe(true);
    });

    // App Builder integration (non-mesh) on a stack with NO mesh — the generalized
    // gate must NOT report complete just because there is no mesh: a selected
    // integration still needs a deployment destination.
    it('is false for a non-mesh app selection on a no-mesh stack without a destination', () => {
        const s = state({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-none',
            selectedAppBuilderComponents: ['erp-sync'],
        });
        expect(isIntegrationsComplete(s, packages, stacks)).toBe(false);
    });

    it('is true for a non-mesh app selection once signed in with project + workspace', () => {
        const s = state({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-none',
            selectedAppBuilderComponents: ['erp-sync'],
            adobeAuth: { isAuthenticated: true, isChecking: false },
            adobeOrg: { id: 'org-1', name: 'Acme', code: 'ACME' } as WizardState['adobeOrg'],
            adobeProject: { id: 'p1', name: 'proj' },
            adobeWorkspace: { id: 'w1', name: 'ws' },
        });
        expect(isIntegrationsComplete(s, packages, stacks)).toBe(true);
    });

    it('is true when nothing is selected on a no-mesh stack', () => {
        const s = state({ selectedPackage: 'citisignal', selectedStack: 'eds-none' });
        expect(isIntegrationsComplete(s, packages, stacks)).toBe(true);
    });
});

describe('isAdobeSignedIn', () => {
    const org = { id: 'org-1', name: 'Acme', code: 'ACME' } as WizardState['adobeOrg'];

    it('is false with no auth and no org', () => {
        expect(isAdobeSignedIn(state())).toBe(false);
    });

    it('is false when authenticated but no org is selected', () => {
        expect(
            isAdobeSignedIn(state({ adobeAuth: { isAuthenticated: true, isChecking: false } }))
        ).toBe(false);
    });

    it('is false when an org is selected but not authenticated', () => {
        expect(
            isAdobeSignedIn(
                state({ adobeAuth: { isAuthenticated: false, isChecking: false }, adobeOrg: org })
            )
        ).toBe(false);
    });

    it('is true when authenticated AND an org is selected', () => {
        expect(
            isAdobeSignedIn(
                state({ adobeAuth: { isAuthenticated: true, isChecking: false }, adobeOrg: org })
            )
        ).toBe(true);
    });
});

describe('anyDeployableSelected', () => {
    it('is false when nothing is selected', () => {
        expect(anyDeployableSelected(state({}))).toBe(false);
        expect(
            anyDeployableSelected(
                state({ selectedAppBuilderComponents: [], selectedOptionalDependencies: [] })
            )
        ).toBe(false);
    });

    it('is true when a catalog component is selected', () => {
        expect(
            anyDeployableSelected(state({ selectedAppBuilderComponents: ['eds-commerce-mesh'] }))
        ).toBe(true);
    });

    it('is true when a mesh dual-flows via selectedOptionalDependencies', () => {
        expect(
            anyDeployableSelected(state({ selectedOptionalDependencies: ['eds-commerce-mesh'] }))
        ).toBe(true);
    });
});
