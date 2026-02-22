/**
 * Wizard Helpers Tests - Navigation
 *
 * Tests for navigation-related helpers:
 * - getNavigationDirection
 * - filterCompletedStepsForBackwardNav
 * - getAdobeStepIndices
 * - computeStateUpdatesForBackwardNav
 * - getNextButtonText
 * - hasMeshComponentSelected
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
    hasMeshComponentSelected,
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
            { id: 'component-selection', name: 'Components' },
            { id: 'review', name: 'Review' },
        ];

        it('should return empty array when going to first step', () => {
            const completed: WizardStep[] = ['adobe-auth', 'adobe-project', 'adobe-workspace'];
            const result = filterCompletedStepsForBackwardNav(completed, 'adobe-auth', 0, wizardSteps);
            expect(result).toEqual([]);
        });

        it('should remove target step and all steps after it', () => {
            const completed: WizardStep[] = ['adobe-auth', 'adobe-project', 'adobe-workspace', 'component-selection'];
            const result = filterCompletedStepsForBackwardNav(completed, 'adobe-project', 1, wizardSteps);
            expect(result).toEqual(['adobe-auth']);
        });

        it('should keep steps before target', () => {
            const completed: WizardStep[] = ['adobe-auth', 'adobe-project', 'adobe-workspace'];
            const result = filterCompletedStepsForBackwardNav(completed, 'adobe-workspace', 2, wizardSteps);
            expect(result).toEqual(['adobe-auth', 'adobe-project']);
        });

        it('should handle empty completed steps', () => {
            const result = filterCompletedStepsForBackwardNav([], 'adobe-project', 1, wizardSteps);
            expect(result).toEqual([]);
        });
    });

    describe('getAdobeStepIndices', () => {
        it('should return correct indices when steps exist', () => {
            const wizardSteps: WizardStepConfig[] = [
                { id: 'adobe-auth', name: 'Auth' },
                { id: 'adobe-project', name: 'Project' },
                { id: 'adobe-workspace', name: 'Workspace' },
            ];
            const result = getAdobeStepIndices(wizardSteps);
            expect(result).toEqual({ projectIndex: 1, workspaceIndex: 2 });
        });

        it('should return -1 for missing steps', () => {
            const wizardSteps: WizardStepConfig[] = [{ id: 'adobe-auth', name: 'Auth' }];
            const result = getAdobeStepIndices(wizardSteps);
            expect(result).toEqual({ projectIndex: -1, workspaceIndex: -1 });
        });
    });

    describe('computeStateUpdatesForBackwardNav', () => {
        const indices = { projectIndex: 1, workspaceIndex: 2 };

        const createState = (): WizardState => ({
            currentStep: 'review',
            projectName: 'test',
            projectTemplate: 'citisignal',
            adobeAuth: { isAuthenticated: true, isChecking: false },
            adobeProject: { id: 'proj-1', name: 'Project 1' },
            adobeWorkspace: { id: 'ws-1', name: 'Workspace 1' },
            projectsCache: [{ id: 'proj-1', name: 'Project 1' }],
            workspacesCache: [{ id: 'ws-1', name: 'Workspace 1' }],
        });

        it('should set currentStep to target step', () => {
            const state = createState();
            const result = computeStateUpdatesForBackwardNav(state, 'adobe-project', 1, indices);
            expect(result.currentStep).toBe('adobe-project');
        });

        it('should clear workspace when going before workspace step', () => {
            const state = createState();
            const result = computeStateUpdatesForBackwardNav(state, 'adobe-project', 1, indices);
            expect(result.adobeWorkspace).toBeUndefined();
            expect(result.workspacesCache).toBeUndefined();
        });

        it('should clear project and workspace when going before project step', () => {
            const state = createState();
            const result = computeStateUpdatesForBackwardNav(state, 'adobe-auth', 0, indices);
            expect(result.adobeProject).toBeUndefined();
            expect(result.projectsCache).toBeUndefined();
            expect(result.adobeWorkspace).toBeUndefined();
            expect(result.workspacesCache).toBeUndefined();
        });

        it('should not clear anything when going to workspace step itself', () => {
            const state = createState();
            const result = computeStateUpdatesForBackwardNav(state, 'adobe-workspace', 2, indices);
            expect(result.adobeProject).toBeUndefined();
            expect(result.adobeWorkspace).toBeUndefined();
            expect(Object.keys(result)).toEqual(['currentStep']);
        });

        it('should handle missing step indices', () => {
            const state = createState();
            const noIndices = { projectIndex: -1, workspaceIndex: -1 };
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
    });

    describe('hasMeshComponentSelected', () => {
        it('should return true when eds-commerce-mesh is in dependencies', () => {
            expect(hasMeshComponentSelected({ frontend: 'citisignal', dependencies: ['eds-commerce-mesh'] })).toBe(true);
        });

        it('should return true when headless-commerce-mesh is in dependencies', () => {
            expect(hasMeshComponentSelected({ frontend: 'citisignal', dependencies: ['headless-commerce-mesh'] })).toBe(true);
        });

        it('should return false when no mesh component is in dependencies', () => {
            expect(hasMeshComponentSelected({ frontend: 'citisignal', dependencies: ['other-dep'] })).toBe(false);
        });

        it('should return false for undefined components', () => {
            expect(hasMeshComponentSelected(undefined)).toBe(false);
        });

        it('should return false for empty dependencies', () => {
            expect(hasMeshComponentSelected({ frontend: 'citisignal', dependencies: [] })).toBe(false);
        });
    });

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
            expect(result.map(s => s.id)).toEqual(['step1', 'step2', 'step3']);
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

        it('should return adobe-auth as fallback for empty array', () => {
            expect(getFirstEnabledStep([])).toBe('adobe-auth');
        });

        it('should return adobe-auth as fallback for undefined', () => {
            expect(getFirstEnabledStep(undefined)).toBe('adobe-auth');
        });

        it('should return adobe-auth when all steps disabled', () => {
            const steps = [
                { id: 'welcome', enabled: false },
                { id: 'prerequisites', enabled: false },
            ];
            expect(getFirstEnabledStep(steps)).toBe('adobe-auth');
        });
    });

    describe('shouldShowWizardFooter', () => {
        it('should return true for normal step', () => {
            expect(shouldShowWizardFooter(false, 'adobe-auth')).toBe(true);
            expect(shouldShowWizardFooter(false, 'component-selection')).toBe(true);
            expect(shouldShowWizardFooter(false, 'prerequisites')).toBe(true);
        });

        it('should return false when on last step', () => {
            expect(shouldShowWizardFooter(true, 'review')).toBe(false);
            expect(shouldShowWizardFooter(true, 'deploy-mesh')).toBe(false);
        });

        it('should return false when on mesh-deployment step', () => {
            expect(shouldShowWizardFooter(false, 'mesh-deployment')).toBe(false);
        });
    });
});
