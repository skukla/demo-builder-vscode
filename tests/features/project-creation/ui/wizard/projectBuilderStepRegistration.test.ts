/**
 * Project Builder Step Registration Test (Slice 2 — Step 6)
 *
 * Verifies the new `project-builder` step is registered in wizard-steps.json
 * immediately after `welcome` and before the stack-gated steps, with no
 * condition (always reachable once welcome's package gate passes). The builder
 * OWNS stack selection, so it must precede every step that filters on
 * selectedStack.
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

describe('wizard-steps.json — project-builder registration', () => {
    it('includes a project-builder step', () => {
        expect(stepIds).toContain('project-builder');
    });

    it('places project-builder immediately after welcome', () => {
        const welcomeIndex = stepIds.indexOf('welcome');
        const builderIndex = stepIds.indexOf('project-builder');
        expect(welcomeIndex).toBeGreaterThanOrEqual(0);
        expect(builderIndex).toBe(welcomeIndex + 1);
    });

    it('places project-builder before the stack-gated steps', () => {
        const builderIndex = stepIds.indexOf('project-builder');
        const componentSelectionIndex = stepIds.indexOf('component-selection');
        const prerequisitesIndex = stepIds.indexOf('prerequisites');
        const reviewIndex = stepIds.indexOf('review');
        expect(builderIndex).toBeLessThan(componentSelectionIndex);
        expect(builderIndex).toBeLessThan(prerequisitesIndex);
        expect(builderIndex).toBeLessThan(reviewIndex);
    });

    it('registers project-builder unconditionally (no condition gate)', () => {
        const builderStep = steps.find(s => s.id === 'project-builder');
        expect(builderStep).toBeDefined();
        expect(builderStep?.condition).toBeUndefined();
        expect(builderStep?.enabled).toBe(true);
    });

    it('gives project-builder a name and description', () => {
        const builderStep = steps.find(s => s.id === 'project-builder');
        expect(builderStep?.name).toBeTruthy();
        expect(builderStep?.description).toBeTruthy();
    });
});
