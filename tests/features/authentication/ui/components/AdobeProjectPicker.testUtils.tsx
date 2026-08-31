import { createSelectionStepFake } from '../../../../helpers/selectionStepFake';
import type { UseSelectionStepResult } from '@/core/ui/hooks/useSelectionStep';
import { AdobeProject, WizardState } from '@/types/webview';

// Mock data — deletable:true because most delete-affordance tests exercise
// rows the current user owns (the handler stamps ownership extension-side).
export const mockProjects: AdobeProject[] = [
    {
        id: 'project1',
        name: 'project-1',
        title: 'Test Project 1',
        description: 'First test project',
        org_id: 'org123',
        deletable: true,
    },
    {
        id: 'project2',
        name: 'project-2',
        title: 'Test Project 2',
        description: 'Second test project',
        org_id: 'org123',
        deletable: true,
    },
    {
        id: 'project3',
        name: 'project-3',
        title: 'Test Project 3',
        description: 'Third test project',
        org_id: 'org123',
        deletable: true,
    },
];

export const baseState: Partial<WizardState> = {
    adobeOrg: { id: 'org1', code: 'ORG1', name: 'Test Organization' },
    adobeProject: undefined,
    projectsCache: undefined,
    currentStep: 'adobe-project',
};

/**
 * The project picker's `useSelectionStep` fake — an empty, idle list by default.
 *
 * Delegates to the canonical typed fake. It previously declared its own
 * `MockSelectionStepConfig` interface listing all twelve fields by hand, which is
 * how it came to be missing `errorCode`: a hand-listed shape has nothing checking
 * it against the hook it stands in for.
 *
 * @see tests/helpers/selectionStepFake.ts
 */
export function createMockSelectionStep(
    config: Partial<UseSelectionStepResult<AdobeProject>> = {},
): UseSelectionStepResult<AdobeProject> {
    return createSelectionStepFake<AdobeProject>(config);
}

// Helper to create many projects for testing pagination/search
export function createManyProjects(count: number): AdobeProject[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `project${i}`,
        name: `project-${i}`,
        title: `Test Project ${i}`,
        description: `Project ${i}`,
        org_id: 'org123',
    }));
}
