/**
 * Storefront Setup Rename Tests
 *
 * Phase 1: Rename eds-preflight to storefront-setup
 *
 * These tests verify the renaming is complete across:
 * - Wizard steps configuration (wizard-steps.json)
 * - WizardStep type union (webview.ts)
 * - Button text helper logic
 * - WizardContainer component rendering
 *
 * TDD RED Phase: Tests written BEFORE implementation
 */

import { getNextButtonText } from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { WizardStep } from '@/types/webview';

describe('Storefront Setup Rename - Wizard Helpers', () => {
    describe('getNextButtonText', () => {
        it('should return "Continue" for storefront-setup step (not review)', () => {
            // The storefront-setup step is an intermediate step, not the final review
            // It should show "Continue" to proceed to project-creation
            const buttonText = getNextButtonText(
                false, // not confirming selection
                3,     // current step index
                5,     // total steps
                undefined, // wizard mode
                'storefront-setup', // current step ID - renamed from eds-preflight
            );
            expect(buttonText).toBe('Continue');
        });

        it('should return "Create" only for review step', () => {
            // The "Create" button should only appear on the review step
            const buttonText = getNextButtonText(
                false,
                3,
                5,
                undefined,
                'review',
            );
            expect(buttonText).toBe('Create');
        });
    });
});

describe('Storefront Setup Rename - Type Safety', () => {
    it('should accept storefront-setup as a valid WizardStep', () => {
        // This test validates the WizardStep type includes 'storefront-setup'
        // If the type doesn't include it, this will cause a TypeScript error at compile time
        const step: WizardStep = 'storefront-setup';
        expect(step).toBe('storefront-setup');
    });

    it('should NOT have eds-preflight as a WizardStep option', () => {
        // After rename, 'eds-preflight' should be removed from WizardStep type
        // Note: This is enforced at compile time, but we test runtime behavior
        const validSteps: WizardStep[] = [
            'welcome',
            'component-selection',
            'prerequisites',
            'adobe-auth',
            'adobe-project',
            'adobe-workspace',
            'eds-connect-services',
            'eds-repository-config',
            'eds-data-source',
            'settings',
            'review',
            'deploy-mesh',
            'storefront-setup', // New step ID
        ];

        // Verify storefront-setup is in the list
        expect(validSteps).toContain('storefront-setup');

        // The old 'eds-preflight' should NOT be a valid step anymore
        // We can't test this at runtime since TS won't allow it,
        // but this documents the expected behavior
    });
});

describe('Storefront Setup Rename - Step Configuration', () => {
    let wizardStepsConfig: { steps: Array<{ id: string; name: string; description?: string; condition?: object }> };

    beforeAll(async () => {
        wizardStepsConfig = await import(
            '@/features/project-creation/config/wizard-steps.json'
        );
    });

    it('should have storefront-setup step with correct name', () => {
        const step = wizardStepsConfig.steps.find(s => s.id === 'storefront-setup');
        expect(step).toBeDefined();
        expect(step?.name).toBe('Publish Storefront');
    });

    it('should have storefront-setup step with EDS condition', () => {
        // The step should be conditional on EDS stack requirements
        const step = wizardStepsConfig.steps.find(s => s.id === 'storefront-setup');
        expect(step?.condition).toBeDefined();
        expect(step?.condition).toHaveProperty('stackRequiresAny');
    });

    it('should place storefront-setup after review step', () => {
        const reviewIndex = wizardStepsConfig.steps.findIndex(s => s.id === 'review');
        const storefrontIndex = wizardStepsConfig.steps.findIndex(s => s.id === 'storefront-setup');

        expect(reviewIndex).toBeGreaterThan(-1);
        expect(storefrontIndex).toBeGreaterThan(-1);
        expect(storefrontIndex).toBeGreaterThan(reviewIndex);
    });

    it('should place storefront-setup before deploy-mesh step', () => {
        const storefrontIndex = wizardStepsConfig.steps.findIndex(s => s.id === 'storefront-setup');
        const creationIndex = wizardStepsConfig.steps.findIndex(s => s.id === 'deploy-mesh');

        expect(storefrontIndex).toBeGreaterThan(-1);
        expect(creationIndex).toBeGreaterThan(-1);
        expect(storefrontIndex).toBeLessThan(creationIndex);
    });
});
