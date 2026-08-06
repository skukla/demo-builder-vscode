/**
 * Storefront Setup Handlers Tests
 *
 * Phase 1: Rename eds-preflight to storefront-setup
 *
 * These tests verify the renaming from 'eds-preflight' to 'storefront-setup':
 * - Message type names
 * - Handler function names
 * - UI component integration
 *
 * TDD RED Phase: Tests written BEFORE implementation
 */

import { edsHandlers } from '@/features/eds/handlers/edsHandlers';

describe('Storefront Setup Handlers - Rename Validation', () => {
    describe('Message Type Names', () => {
        it('should have storefront-setup-start handler registered', () => {
            // After rename: eds-preflight-start → storefront-setup-start
            expect(edsHandlers['storefront-setup-start']).toBeDefined();
            expect(typeof edsHandlers['storefront-setup-start']).toBe('function');
        });

        it('should have storefront-setup-cancel handler registered', () => {
            // After rename: eds-preflight-cancel → storefront-setup-cancel
            expect(edsHandlers['storefront-setup-cancel']).toBeDefined();
            expect(typeof edsHandlers['storefront-setup-cancel']).toBe('function');
        });

        it('has NO storefront-setup-resume handler (removed 2026-08-06)', () => {
            // Was a stub that always errored while the dialog posted to it.
            expect(edsHandlers['storefront-setup-resume']).toBeUndefined();
        });

        it('should NOT have old eds-preflight-start handler', () => {
            // Old message type should be removed after rename
            expect(edsHandlers['eds-preflight-start']).toBeUndefined();
        });

        it('should NOT have old eds-preflight-cancel handler', () => {
            // Old message type should be removed after rename
            expect(edsHandlers['eds-preflight-cancel']).toBeUndefined();
        });

        it('should NOT have old eds-preflight-resume handler', () => {
            // Old message type should be removed after rename
            expect(edsHandlers['eds-preflight-resume']).toBeUndefined();
        });
    });

    describe('Handler Function Behavior', () => {
        it('should export handleStartStorefrontSetup function', async () => {
            // After rename: handleStartEdsPreflight → handleStartStorefrontSetup
            const { handleStartStorefrontSetup } = await import(
                '@/features/eds/handlers/storefrontSetupHandlers'
            );
            expect(handleStartStorefrontSetup).toBeDefined();
            expect(typeof handleStartStorefrontSetup).toBe('function');
        });

        it('should export handleCancelStorefrontSetup function', async () => {
            // After rename: handleCancelEdsPreflight → handleCancelStorefrontSetup
            const { handleCancelStorefrontSetup } = await import(
                '@/features/eds/handlers/storefrontSetupHandlers'
            );
            expect(handleCancelStorefrontSetup).toBeDefined();
            expect(typeof handleCancelStorefrontSetup).toBe('function');
        });

        it('no longer exports handleResumeStorefrontSetup (removed 2026-08-06)', async () => {
            // After rename: handleResumeEdsPreflight → handleResumeStorefrontSetup
            const mod = await import('@/features/eds/handlers/storefrontSetupHandlers');
            expect((mod as Record<string, unknown>).handleResumeStorefrontSetup).toBeUndefined();
        });
    });
});

describe('Storefront Setup Step Configuration', () => {
    let wizardSteps: Array<{ id: string; name: string; description?: string }>;

    beforeAll(async () => {
        // Load wizard steps configuration
        const config = await import(
            '@/features/project-creation/config/wizard-steps.json'
        );
        wizardSteps = config.steps;
    });

    it('should have storefront-setup step ID in wizard configuration', () => {
        // After rename: eds-preflight → storefront-setup
        const storefrontStep = wizardSteps.find(step => step.id === 'storefront-setup');
        expect(storefrontStep).toBeDefined();
    });

    it('should NOT have eds-preflight step ID in wizard configuration', () => {
        // Old step ID should be removed after rename
        const oldStep = wizardSteps.find(step => step.id === 'eds-preflight');
        expect(oldStep).toBeUndefined();
    });

    it('should have appropriate name for storefront-setup step', () => {
        const storefrontStep = wizardSteps.find(step => step.id === 'storefront-setup');
        expect(storefrontStep?.name).toBe('Publish Storefront');
    });
});
