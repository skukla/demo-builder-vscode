import React from 'react';
import { AdobeProject, WizardState } from '@/types/webview';

// Mock WebviewClient
export const mockPostMessage = jest.fn();
export const mockOnMessage = jest.fn();

// Setup WebviewClient mock
export function setupWebviewClientMock() {
    jest.mock('@/core/ui/utils/WebviewClient', () => ({
        webviewClient: {
            postMessage: mockPostMessage,
            onMessage: mockOnMessage,
        },
    }));
}

// Setup useSelectionStep mock
export function setupUseSelectionStepMock() {
    jest.mock('@/core/ui/hooks/useSelectionStep', () => ({
        useSelectionStep: jest.fn(),
    }));
}

// Setup ConfigurationSummary mock
export function setupConfigurationSummaryMock() {
    jest.mock('@/core/ui/components/wizard', () => ({
        ConfigurationSummary: () => <div data-testid="config-summary">Configuration Summary</div>,
    }));
}

// Setup LoadingDisplay mock
export function setupLoadingDisplayMock() {
    jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
        LoadingDisplay: ({ message, subMessage }: { message: string; subMessage?: string }) => (
            <div data-testid="loading-display">
                <div>{message}</div>
                {subMessage && <div>{subMessage}</div>}
            </div>
        ),
    }));
}

// Setup FadeTransition mock
export function setupFadeTransitionMock() {
    jest.mock('@/core/ui/components/ui/FadeTransition', () => ({
        FadeTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }));
}

// Mock data
export const mockProjects: AdobeProject[] = [
    {
        id: 'project1',
        name: 'project-1',
        title: 'Test Project 1',
        description: 'First test project',
        org_id: 'org123',
    },
    {
        id: 'project2',
        name: 'project-2',
        title: 'Test Project 2',
        description: 'Second test project',
        org_id: 'org123',
    },
    {
        id: 'project3',
        name: 'project-3',
        title: 'Test Project 3',
        description: 'Third test project',
        org_id: 'org123',
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

// Common beforeEach setup
export function setupBeforeEach() {
    jest.clearAllMocks();
    mockOnMessage.mockReturnValue(jest.fn());
}
