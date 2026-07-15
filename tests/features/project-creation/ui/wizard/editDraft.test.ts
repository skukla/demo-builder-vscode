/**
 * editDraft Tests
 *
 * Verifies the pure edit-draft pick/apply helpers: `pickEditDraft` extracts only
 * the defined editable slice of WizardState (omitting undefined keys and excluding
 * transient/auth fields), and `applyEditDraft` merges a draft over a base state.
 */

import { pickEditDraft, applyEditDraft } from '@/features/project-creation/ui/wizard/editDraft';
import type { WizardState, EditDraft } from '@/types/webview';

const baseState: WizardState = {
    currentStep: 'welcome',
    projectName: 'Base Project',
    selectedPackage: 'citisignal',
    adobeAuth: { isAuthenticated: true, isChecking: false },
};

describe('pickEditDraft', () => {
    it('should copy defined editable fields', () => {
        const state: WizardState = {
            ...baseState,
            projectName: 'My Project',
            selectedStack: 'eds-paas',
            selectedAddons: ['adobe-commerce-aco'],
            commerceConnectValid: true,
            committedCommerceSteps: ['backend', 'connection'],
        };

        const draft = pickEditDraft(state);

        expect(draft.projectName).toBe('My Project');
        expect(draft.selectedStack).toBe('eds-paas');
        expect(draft.selectedAddons).toEqual(['adobe-commerce-aco']);
        expect(draft.commerceConnectValid).toBe(true);
        expect(draft.committedCommerceSteps).toEqual(['backend', 'connection']);
    });

    it('should omit editable fields whose value is undefined', () => {
        const state: WizardState = {
            ...baseState,
            projectName: 'Only Name',
            selectedStack: undefined,
            selectedAddons: undefined,
        };

        const draft = pickEditDraft(state);

        expect('selectedStack' in draft).toBe(false);
        expect('selectedAddons' in draft).toBe(false);
        expect(draft.projectName).toBe('Only Name');
    });

    it('should exclude non-EditDraft fields (adobeAuth, projectsCache, apiMesh)', () => {
        const state: WizardState = {
            ...baseState,
            projectsCache: [{ id: 'p1', name: 'Cached' }],
            apiMesh: { isChecking: false, apiEnabled: true, meshExists: false },
        };

        const draft = pickEditDraft(state) as Record<string, unknown>;

        expect('adobeAuth' in draft).toBe(false);
        expect('projectsCache' in draft).toBe(false);
        expect('apiMesh' in draft).toBe(false);
        expect('currentStep' in draft).toBe(false);
    });

    it('should return a new object (not the same reference as state)', () => {
        const draft = pickEditDraft(baseState);
        expect(draft).not.toBe(baseState);
    });
});

describe('applyEditDraft', () => {
    it('should merge draft over base (draft wins)', () => {
        const draft: EditDraft = {
            projectName: 'Edited Name',
            selectedStack: 'headless-paas',
        };

        const result = applyEditDraft(baseState, draft);

        expect(result.projectName).toBe('Edited Name');
        expect(result.selectedStack).toBe('headless-paas');
        // Base-only fields survive
        expect(result.selectedPackage).toBe('citisignal');
        expect(result.currentStep).toBe('welcome');
    });

    it('should return base unchanged (shallow copy) when draft is undefined', () => {
        const result = applyEditDraft(baseState, undefined);

        expect(result).toEqual(baseState);
        expect(result).not.toBe(baseState);
    });

    it('should not clobber a base value when the draft omits that key', () => {
        const draft: EditDraft = { projectName: 'New' };

        const result = applyEditDraft(baseState, draft);

        expect(result.selectedPackage).toBe('citisignal');
    });

    it('round-trips: applyEditDraft(base, pickEditDraft(edited)) yields edited over base', () => {
        const edited: WizardState = {
            ...baseState,
            projectName: 'Round Trip',
            selectedStack: 'eds-paas',
            commerceStoreViewChosen: true,
        };

        const result = applyEditDraft(baseState, pickEditDraft(edited));

        expect(result.projectName).toBe('Round Trip');
        expect(result.selectedStack).toBe('eds-paas');
        expect(result.commerceStoreViewChosen).toBe(true);
        // A field present only on base is preserved
        expect(result.selectedPackage).toBe('citisignal');
    });
});
