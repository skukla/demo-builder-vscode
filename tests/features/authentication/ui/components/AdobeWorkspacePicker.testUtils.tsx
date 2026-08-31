import { createSelectionStepFake } from '../../../../helpers/selectionStepFake';
import type { UseSelectionStepResult } from '@/core/ui/hooks';
import { WizardState, Workspace } from '@/types/webview';

// Test data
export const mockWorkspaces: Workspace[] = [
    {
        id: 'workspace1',
        name: 'Stage',
        title: 'Stage Environment',
    },
    {
        id: 'workspace2',
        name: 'Production',
        title: 'Production Environment',
    },
    {
        id: 'workspace3',
        name: 'Development',
        title: 'Development Environment',
    },
];

export const baseState: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'org1', code: 'ORG1', name: 'Test Organization' },
    adobeProject: {
        id: 'project1',
        name: 'test-project',
        title: 'Test Project',
        description: 'Test Description',
        org_id: 'org123',
    },
    adobeWorkspace: undefined,
    workspacesCache: undefined,
    currentStep: 'adobe-workspace',
};

/**
 * The workspace picker's `useSelectionStep` fake — a LOADED list by default,
 * unlike the project picker's, because these suites exercise selection rather
 * than loading.
 *
 * Delegates to the canonical typed fake; it used to take a bare `overrides = {}`
 * and returned an object missing `errorCode`.
 *
 * @see tests/helpers/selectionStepFake.ts
 */
export function createMockUseSelectionStepReturn(
    overrides: Partial<UseSelectionStepResult<Workspace>> = {},
): UseSelectionStepResult<Workspace> {
    return createSelectionStepFake<Workspace>({
        items: mockWorkspaces,
        filteredItems: mockWorkspaces,
        hasLoadedOnce: true,
        ...overrides,
    });
}

export function createStateWithWorkspace(workspace: Workspace): Partial<WizardState> {
    return {
        ...baseState,
        adobeWorkspace: workspace,
    };
}

export function createStateWithoutProject(): Partial<WizardState> {
    return {
        ...baseState,
        adobeProject: undefined,
    };
}

export function createManyWorkspaces(count: number): Workspace[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `workspace${i}`,
        name: `Workspace ${i}`,
        title: `Workspace ${i}`,
    }));
}
