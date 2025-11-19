import React from 'react';
import { WizardState, Workspace } from '@/types/webview';

// Mock functions (to be used after jest.mock() calls in test files)
export const mockPostMessage = jest.fn();
export const mockOnMessage = jest.fn();

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

// Factory functions
export function createMockUseSelectionStepReturn(overrides = {}) {
    return {
        items: mockWorkspaces,
        filteredItems: mockWorkspaces,
        isLoading: false,
        showLoading: false,
        isRefreshing: false,
        hasLoadedOnce: true,
        error: null,
        searchQuery: '',
        setSearchQuery: jest.fn(),
        load: jest.fn(),
        refresh: jest.fn(),
        selectItem: jest.fn(),
        ...overrides,
    };
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
