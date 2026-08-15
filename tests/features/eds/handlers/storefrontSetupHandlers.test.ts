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
            // It was a stub: it always returned "Resume not yet supported", while the
            // install dialog's success path posted to it and the wizard optimistically
            // advanced first — so the user watched setup appear to continue and was
            // then told to start over. Implementing resume is a backlog item; until
            // then the honest path is the existing Retry, which re-runs setup.
            expect('storefront-setup-resume' in edsHandlers).toBe(false);
        });

        it('should NOT have old eds-preflight-start handler', () => {
            // Old message type should be removed after rename
            expect('eds-preflight-start' in edsHandlers).toBe(false);
        });

        it('should NOT have old eds-preflight-cancel handler', () => {
            // Old message type should be removed after rename
            expect('eds-preflight-cancel' in edsHandlers).toBe(false);
        });

        it('should NOT have old eds-preflight-resume handler', () => {
            // Old message type should be removed after rename
            expect('eds-preflight-resume' in edsHandlers).toBe(false);
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
            // It was a stub that always returned "Resume not yet supported" while the
            // install dialog posted to it. Deleted rather than kept: an unbuilt path
            // that cannot work is not made acceptable by failing politely. Resume is
            // a backlog item; the honest remedy today is the existing Retry.
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
