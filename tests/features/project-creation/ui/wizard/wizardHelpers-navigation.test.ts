/**
 * Wizard Helpers Tests - Navigation
 *
 * Tests for navigation-related helpers:
 * - getNavigationDirection
 * - filterCompletedStepsForBackwardNav
 * - getAdobeStepIndices
 * - computeStateUpdatesForBackwardNav
 * - getNextButtonText
 * - getCompletedStepIndices
 * - getEnabledWizardSteps
 * - getFirstEnabledStep
 * - shouldShowWizardFooter
 */

import {
    getNavigationDirection,
    filterCompletedStepsForBackwardNav,
    getAdobeStepIndices,
    computeStateUpdatesForBackwardNav,
    getNextButtonText,
    getCompletedStepIndices,
    getEnabledWizardSteps,
    getFirstEnabledStep,
    shouldShowWizardFooter,
    WizardStepConfig,
} from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { WizardStep, WizardState } from '@/types/webview';

describe('wizardHelpers - navigation', () => {
    describe('getNavigationDirection', () => {
        it('should return "forward" when target is after current', () => {
            expect(getNavigationDirection(3, 1)).toBe('forward');
            expect(getNavigationDirection(5, 0)).toBe('forward');
        });

        it('should return "backward" when target is before current', () => {
            expect(getNavigationDirection(1, 3)).toBe('backward');
            expect(getNavigationDirection(0, 5)).toBe('backward');
        });

        it('should return "backward" when target equals current', () => {
            expect(getNavigationDirection(2, 2)).toBe('backward');
        });
    });

    describe('filterCompletedStepsForBackwardNav', () => {
        const wizardSteps: WizardStepConfig[] = [
            { id: 'adobe-auth', name: 'Auth' },
            { id: 'adobe-project', name: 'Project' },
            { id: 'adobe-workspace', name: 'Workspace' },
            { id: 'build-your-project', name: 'Build Your Project' },
            { id: 'review', name: 'Review' },
        ];

        it('should return empty array when going to first step', () => {
            const completed: WizardStep[] = ['adobe-auth', 'adobe-project', 'adobe-workspace'];
            const result = filterCompletedStepsForBackwardNav(
                completed,
                'adobe-auth',
                0,
                wizardSteps
            );
            expect(result).toEqual([]);
        });

        it('should remove target step and all steps after it', () => {
            const completed: WizardStep[] = [
                'adobe-auth',
                'adobe-project',
                'adobe-workspace',
                'build-your-project',
            ];
            const result = filterCompletedStepsForBackwardNav(
                completed,
                'adobe-project',
                1,
                wizardSteps
            );
            expect(result).toEqual(['adobe-auth']);
        });

        it('should keep steps before target', () => {
            const completed: WizardStep[] = ['adobe-auth', 'adobe-project', 'adobe-workspace'];
            const result = filterCompletedStepsForBackwardNav(
                completed,
                'adobe-workspace',
                2,
                wizardSteps
            );
            expect(result).toEqual(['adobe-auth', 'adobe-project']);
        });

        it('should handle empty completed steps', () => {
            const result = filterCompletedStepsForBackwardNav([], 'adobe-project', 1, wizardSteps);
            expect(result).toEqual([]);
        });
    });

    describe('getAdobeStepIndices', () => {
        it('should return the build-your-project index (the picker host) when present', () => {
            const wizardSteps: WizardStepConfig[] = [
                { id: 'adobe-auth', name: 'Auth' },
                { id: 'build-your-project', name: 'Build Your Project' },
                { id: 'review', name: 'Review' },
            ];
            const result = getAdobeStepIndices(wizardSteps);
            expect(result).toEqual({ buildStepIndex: 1 });
        });

        it('should return -1 when the build-your-project step is missing', () => {
            const wizardSteps: WizardStepConfig[] = [{ id: 'adobe-auth', name: 'Auth' }];
            const result = getAdobeStepIndices(wizardSteps);
            expect(result).toEqual({ buildStepIndex: -1 });
        });
    });

    describe('computeStateUpdatesForBackwardNav', () => {
        // build-your-project (the project/workspace picker host) sits at index 1.
        const indices = { buildStepIndex: 1 };

        const createState = (): WizardState => ({
            currentStep: 'review',
            projectName: 'test',
            adobeAuth: { isAuthenticated: true, isChecking: false },
            adobeProject: { id: 'proj-1', name: 'Project 1' },
            adobeWorkspace: { id: 'ws-1', name: 'Workspace 1' },
            projectsCache: [{ id: 'proj-1', name: 'Project 1' }],
            workspacesCache: [{ id: 'ws-1', name: 'Workspace 1' }],
        });

        it('should set currentStep to target step', () => {
            const state = createState();
            const result = computeStateUpdatesForBackwardNav(state, 'adobe-auth', 0, indices);
            expect(result.currentStep).toBe('adobe-auth');
        });

        it('should clear project + workspace (and caches) when going before the build step', () => {
            const state = createState();
            const result = computeStateUpdatesForBackwardNav(state, 'adobe-auth', 0, indices);
            expect(result.adobeProject).toBeUndefined();
            expect(result.projectsCache).toBeUndefined();
            expect(result.adobeWorkspace).toBeUndefined();
            expect(result.workspacesCache).toBeUndefined();
        });

        it('should not clear anything when going to the build step itself', () => {
            const state = createState();
            const result = computeStateUpdatesForBackwardNav(
                state,
                'build-your-project',
                1,
                indices
            );
            expect(Object.keys(result)).toEqual(['currentStep']);
        });

        it('should handle a missing build step index', () => {
            const state = createState();
            const noIndices = { buildStepIndex: -1 };
            const result = computeStateUpdatesForBackwardNav(state, 'adobe-auth', 0, noIndices);
            expect(Object.keys(result)).toEqual(['currentStep']);
        });
    });

    describe('getNextButtonText', () => {
        it('should return "Continue" when confirming selection', () => {
            expect(getNextButtonText(true, 1, 5)).toBe('Continue');
        });

        it('should return "Create" on review step (second-to-last)', () => {
            expect(getNextButtonText(false, 3, 5, undefined, 'review')).toBe('Create');
        });

        it('should return "Continue" on second-to-last step if not review', () => {
            expect(getNextButtonText(false, 3, 5, undefined, 'storefront-setup')).toBe('Continue');
        });

        it('should return "Continue" on other steps', () => {
            expect(getNextButtonText(false, 0, 5)).toBe('Continue');
            expect(getNextButtonText(false, 1, 5)).toBe('Continue');
            expect(getNextButtonText(false, 2, 5)).toBe('Continue');
        });

        it('should return "Save Changes" on review step in edit mode', () => {
            expect(getNextButtonText(false, 3, 5, 'edit', 'review')).toBe('Save Changes');
        });

        it('should return "Create" on review step when not in edit mode', () => {
            expect(getNextButtonText(false, 3, 5, 'create', 'review')).toBe('Create');
        });

        it('should return "Create" on review step in import mode', () => {
            expect(getNextButtonText(false, 3, 5, 'import', 'review')).toBe('Create');
        });

        it('should be id-driven, not index-driven (review not second-to-last)', () => {
            // R1 order puts storefront-setup between review and create-project, so
            // review sits at totalSteps-3. The label must still follow the id.
            expect(getNextButtonText(false, 8, 11, 'create', 'review')).toBe('Create');
            expect(getNextButtonText(false, 8, 11, 'edit', 'review')).toBe('Save Changes');
            expect(getNextButtonText(false, 9, 11, undefined, 'storefront-setup')).toBe('Continue');
        });
    });

    // hasMeshComponentSelected was deleted with D3 (2026-08-23): it had zero
    // production callers — this suite was its only reference.

    describe('getCompletedStepIndices', () => {
        const wizardSteps: WizardStepConfig[] = [
            { id: 'adobe-auth', name: 'Auth' },
            { id: 'adobe-project', name: 'Project' },
            { id: 'adobe-workspace', name: 'Workspace' },
        ];

        it('should return indices of completed steps', () => {
            const completed: WizardStep[] = ['adobe-auth', 'adobe-workspace'];
            const result = getCompletedStepIndices(completed, wizardSteps);
            expect(result).toEqual([0, 2]);
        });

        it('should return empty array for no completed steps', () => {
            expect(getCompletedStepIndices([], wizardSteps)).toEqual([]);
        });

        it('should return -1 for steps not in wizard steps', () => {
            const completed: WizardStep[] = ['review'];
            const result = getCompletedStepIndices(completed, wizardSteps);
            expect(result).toEqual([-1]);
        });
    });

    describe('getEnabledWizardSteps', () => {
        it('should filter out disabled steps', () => {
            const steps = [
                { id: 'adobe-auth', name: 'Auth', enabled: true },
                { id: 'adobe-project', name: 'Project', enabled: false },
                { id: 'adobe-workspace', name: 'Workspace', enabled: true },
            ];
            const result = getEnabledWizardSteps(steps);
            expect(result).toEqual([
                { id: 'adobe-auth', name: 'Auth' },
                { id: 'adobe-workspace', name: 'Workspace' },
            ]);
        });

        it('should return empty array for undefined input', () => {
            expect(getEnabledWizardSteps(undefined)).toEqual([]);
        });

        it('should return empty array for empty input', () => {
            expect(getEnabledWizardSteps([])).toEqual([]);
        });

        it('should preserve order of enabled steps', () => {
            const steps = [
                { id: 'step1', name: 'Step 1', enabled: true },
                { id: 'step2', name: 'Step 2', enabled: true },
                { id: 'step3', name: 'Step 3', enabled: true },
            ];
            const result = getEnabledWizardSteps(steps);
            expect(result.map((s) => s.id)).toEqual(['step1', 'step2', 'step3']);
        });
    });

    describe('getFirstEnabledStep', () => {
        it('should return first enabled step', () => {
            const steps = [
                { id: 'adobe-auth', enabled: true },
                { id: 'adobe-project', enabled: true },
            ];
            expect(getFirstEnabledStep(steps)).toBe('adobe-auth');
        });

        it('should skip disabled first step', () => {
            const steps = [
                { id: 'welcome', enabled: false },
                { id: 'adobe-auth', enabled: true },
            ];
            expect(getFirstEnabledStep(steps)).toBe('adobe-auth');
        });

        it('should return welcome as fallback for empty array', () => {
            expect(getFirstEnabledStep([])).toBe('welcome');
        });

        it('should return welcome as fallback for undefined', () => {
            expect(getFirstEnabledStep(undefined)).toBe('welcome');
        });

        it('should return welcome when all steps disabled', () => {
            const steps = [
                { id: 'welcome', enabled: false },
                { id: 'prerequisites', enabled: false },
            ];
            expect(getFirstEnabledStep(steps)).toBe('welcome');
        });
    });

    describe('shouldShowWizardFooter', () => {
        it('should return true for normal step', () => {
            expect(shouldShowWizardFooter(false, 'adobe-auth')).toBe(true);
            expect(shouldShowWizardFooter(false, 'build-your-project')).toBe(true);
            expect(shouldShowWizardFooter(false, 'prerequisites')).toBe(true);
        });

        it('should return false when on last step', () => {
            expect(shouldShowWizardFooter(true, 'review')).toBe(false);
            expect(shouldShowWizardFooter(true, 'create-project')).toBe(false);
        });

        it('should return false when on mesh-deployment step', () => {
            expect(shouldShowWizardFooter(false, 'mesh-deployment')).toBe(false);
        });

        it('should return true on the build-your-project step (uses the wizard footer)', () => {
            expect(shouldShowWizardFooter(false, 'build-your-project')).toBe(true);
        });
    });
});
