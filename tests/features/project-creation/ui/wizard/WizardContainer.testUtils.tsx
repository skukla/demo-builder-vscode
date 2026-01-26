import React from 'react';
import { render as rtlRender } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ComponentSelection } from '@/types/webview';

/**
 * Shared test utilities for WizardContainer tests
 */

// Mock vscode API functions
export const mockPostMessage = jest.fn();
export const mockRequest = jest.fn();
export const mockOnMessage = jest.fn().mockReturnValue(jest.fn());
export const mockCreateProject = jest.fn();

// Test data factories - CRITICAL: Return functions, not variables
export const createMockComponentDefaults = (): ComponentSelection => ({
    frontend: 'headless',
    backend: 'commerce-paas',
    dependencies: [],
    integrations: [],
    appBuilder: [],
});

// Note: Welcome step removed in Step 3 - wizard starts at adobe-auth
// Note: api-mesh step disabled - mesh deployment now happens in project-creation
export const createMockWizardSteps = () => [
    { id: 'adobe-auth', name: 'Adobe Authentication', enabled: true },
    { id: 'adobe-project', name: 'Adobe Project', enabled: true },
    { id: 'adobe-workspace', name: 'Adobe Workspace', enabled: true },
    { id: 'component-selection', name: 'Component Selection', enabled: true },
    { id: 'prerequisites', name: 'Prerequisites', enabled: true },
    { id: 'settings', name: 'Settings', enabled: true },
    { id: 'review', name: 'Review', enabled: true },
    { id: 'deploy-mesh', name: 'Deploy Mesh', enabled: true },
];

/**
 * Edit project configuration for edit mode tests
 */
export interface EditProjectConfig {
    projectPath: string;
    projectName: string;
    settings: {
        version: number;
        selections?: {
            frontend?: string;
            backend?: string;
            dependencies?: string[];
            integrations?: string[];
            appBuilder?: string[];
        };
        configs?: Record<string, Record<string, string | boolean | number | undefined>>;
        adobe?: {
            orgId?: string;
            orgName?: string;
            projectId?: string;
            projectName?: string;
            projectTitle?: string;
            workspaceId?: string;
            workspaceName?: string;
            workspaceTitle?: string;
        };
    };
}

/**
 * Create mock editProject prop for edit mode tests
 */
export const createMockEditProject = (
    overrides: Partial<EditProjectConfig> = {}
): EditProjectConfig => ({
    projectPath: '/Users/test/.demo-builder/projects/test-project',
    projectName: 'test-project',
    settings: {
        version: 1,
        selections: {
            frontend: 'headless',
            backend: 'commerce-paas',
            dependencies: ['commerce-mesh'],
            integrations: [],
            appBuilder: [],
        },
        configs: {
            'headless': { port: 3000 },
        },
        adobe: {
            orgId: 'org123',
            orgName: 'Test Organization',
            projectId: 'proj456',
            projectName: 'TestProject',
            projectTitle: 'Test Project Title',
            workspaceId: 'ws789',
            workspaceName: 'Development',
            workspaceTitle: 'Development',
        },
    },
    ...overrides,
});

// Helper to create mock imported settings for import flow tests
export const createMockImportedSettings = () => ({
    version: '1.0.0',
    exportedFrom: 'Demo Builder',
    adobe: {
        orgId: 'org123',
        orgName: 'Test Organization',
        projectId: 'proj456',
        projectName: 'Test Project',
        workspaceId: 'ws789',
        workspaceName: 'Test Workspace',
    },
    selections: {
        frontend: 'headless',
        backend: 'commerce-paas',
        dependencies: ['commerce-mesh'],
        integrations: [],
        appBuilder: [],
    },
    configs: {
        'headless': { port: 3000 },
    },
    source: {
        project: 'my-existing-project',
    },
});

export const createMockComponentsDataResponse = () => ({
    success: true,
    type: 'components-data',
    data: {
        frontends: [
            {
                id: 'headless',
                name: 'CitiSignal Next.js',
                description: 'Frontend application',
                configuration: { services: [] }
            }
        ],
        backends: [
            {
                id: 'commerce-paas',
                name: 'Adobe Commerce PaaS',
                description: 'Backend platform',
                configuration: { services: [] }
            }
        ],
        dependencies: [],
        integrations: [],
        appBuilder: [],
    },
});

// Helper to setup default mock request behavior
export const setupDefaultMockRequest = () => {
    mockRequest.mockImplementation((type: string) => {
        if (type === 'get-components-data') {
            return Promise.resolve(createMockComponentsDataResponse());
        }
        return Promise.resolve({ success: true });
    });
};

// Common test setup
export const setupTest = () => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    mockOnMessage.mockReturnValue(jest.fn());
    setupDefaultMockRequest();
};

// Common test cleanup
export const cleanupTest = async () => {
    jest.resetAllMocks();
    // Allow any pending microtasks to complete
    await Promise.resolve();
};

// Custom render with theme provider wrapper
export const renderWithTheme = (ui: React.ReactElement, options = {}) => {
    return rtlRender(
        <Provider theme={defaultTheme}>
            {ui}
        </Provider>,
        options
    );
};
