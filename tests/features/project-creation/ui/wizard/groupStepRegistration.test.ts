/**
 * Build-Your-Project Step Registration Test (Nested Builder Slice 1 — build step 2)
 *
 * Locks the collapse of the three group steps (commerce / integrations /
 * storefront) into ONE unconditional `build-your-project` wizard step in
 * wizard-steps.json. The retired group steps' COMPONENT files stay (the
 * BuildYourProjectStep shell routes to them); only their standalone wizard-step
 * REGISTRATIONS are removed here.
 *
 * Target order (array order = wizard order):
 *   welcome → prerequisites → adobe-auth → adobe-project → adobe-workspace →
 *   build-your-project → review → storefront-setup → create-project
 */

import wizardStepsConfig from '@/features/project-creation/config/wizard-steps.json';

interface ConfigStep {
    id: string;
    name: string;
    description?: string;
    enabled?: boolean;
    condition?: Record<string, unknown>;
}

const steps = (wizardStepsConfig as { steps: ConfigStep[] }).steps;
const stepIds = steps.map(s => s.id);
const idx = (id: string) => stepIds.indexOf(id);

describe('wizard-steps.json — build-your-project step registration', () => {
    describe('collapsed build-your-project step present', () => {
        it('includes the build-your-project step', () => {
            expect(stepIds).toContain('build-your-project');
        });
    });

    describe('retired group + per-concern steps removed', () => {
        it.each([
            'commerce',
            'integrations',
            'storefront',
            'project-builder',
            'component-selection',
            'settings',
            'eds-connect-services',
            'eds-repository-config',
        ])('does NOT include the retired %s step', (id) => {
            expect(stepIds).not.toContain(id);
        });
    });

    describe('order', () => {
        it('orders welcome → prerequisites → adobe-* → build-your-project → review → storefront-setup → create-project', () => {
            expect(idx('welcome')).toBeGreaterThanOrEqual(0);
            expect(idx('welcome')).toBeLessThan(idx('prerequisites'));
            expect(idx('prerequisites')).toBeLessThan(idx('adobe-auth'));
            expect(idx('adobe-auth')).toBeLessThan(idx('adobe-project'));
            expect(idx('adobe-project')).toBeLessThan(idx('adobe-workspace'));
            expect(idx('adobe-workspace')).toBeLessThan(idx('build-your-project'));
            expect(idx('build-your-project')).toBeLessThan(idx('review'));
            expect(idx('review')).toBeLessThan(idx('storefront-setup'));
            expect(idx('storefront-setup')).toBeLessThan(idx('create-project'));
        });
    });

    describe('build-your-project step configuration', () => {
        it('registers build-your-project unconditionally and enabled', () => {
            const step = steps.find(s => s.id === 'build-your-project');
            expect(step?.enabled).toBe(true);
            expect(step?.condition).toBeUndefined();
        });

        it('keeps storefront-setup gated on stackRequiresAny (GitHub OR DA.live)', () => {
            const step = steps.find(s => s.id === 'storefront-setup');
            const stackRequiresAny = step?.condition?.stackRequiresAny as string[] | undefined;
            expect(stackRequiresAny).toEqual(
                expect.arrayContaining(['requiresGitHub', 'requiresDaLive']),
            );
        });
    });
});
