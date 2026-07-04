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

// Factory for creating useSelectionStep return values
export interface MockSelectionStepConfig {
    items?: AdobeProject[];
    filteredItems?: AdobeProject[];
    isLoading?: boolean;
    showLoading?: boolean;
    isRefreshing?: boolean;
    hasLoadedOnce?: boolean;
    error?: string | null;
    searchQuery?: string;
    setSearchQuery?: jest.Mock;
    load?: jest.Mock;
    refresh?: jest.Mock;
    selectItem?: jest.Mock;
}

export function createMockSelectionStep(config: MockSelectionStepConfig = {}) {
    return {
        items: config.items ?? [],
        filteredItems: config.filteredItems ?? [],
        isLoading: config.isLoading ?? false,
        showLoading: config.showLoading ?? false,
        isRefreshing: config.isRefreshing ?? false,
        hasLoadedOnce: config.hasLoadedOnce ?? false,
        error: config.error ?? null,
        searchQuery: config.searchQuery ?? '',
        setSearchQuery: config.setSearchQuery ?? jest.fn(),
        load: config.load ?? jest.fn(),
        refresh: config.refresh ?? jest.fn(),
        selectItem: config.selectItem ?? jest.fn(),
    };
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
