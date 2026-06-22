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

import { isCommerceConfigured, isStorefrontConfigured } from '@/features/project-creation/ui/steps/tileStatus';
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
            isCommerceConfigured(state({ selectedStack: 'eds-paas', commerceConnectValid: false })),
        ).toBe(false);
    });

    it('is true when a stack is selected AND the connect form is valid', () => {
        expect(
            isCommerceConfigured(state({ selectedStack: 'eds-paas', commerceConnectValid: true })),
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
                }),
            ),
        ).toBe(false);
    });

    it('is false when DA.live is not authenticated', () => {
        expect(
            isStorefrontConfigured(
                state({
                    edsConfig: { githubAuth: { isAuthenticated: true } },
                    storefrontRepoValid: true,
                }),
            ),
        ).toBe(false);
    });

    it('is false when both authed but the repo is not valid', () => {
        expect(isStorefrontConfigured(state({ edsConfig: authed }))).toBe(false);
        expect(
            isStorefrontConfigured(state({ edsConfig: authed, storefrontRepoValid: false })),
        ).toBe(false);
    });

    it('is true when GitHub + DA.live are authed AND the repo is valid', () => {
        expect(
            isStorefrontConfigured(state({ edsConfig: authed, storefrontRepoValid: true })),
        ).toBe(true);
    });
});
