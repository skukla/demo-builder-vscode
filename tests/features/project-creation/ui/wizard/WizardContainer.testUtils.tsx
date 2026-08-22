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

// Note: the wizard starts at welcome (Demo Setup) — the real first step now that the
// standalone adobe-auth / adobe-project / adobe-workspace steps are all retired (sign-in
// + the Adobe I/O pickers live inside build-your-project's Integrations sub-steps).
// Note: api-mesh step disabled - mesh deployment now happens in project-creation.
// The navigable mock flow uses only steps WizardContainer actually renders with a
// visible testid (welcome / storefront-setup / prerequisites are mocked as simple divs
// and routed by WizardContainer's renderStep switch). prerequisites remains the
// self-managed-focus step under test; storefront-setup is the first navigable
// intermediate step (it has no sub-step footer driver, unlike build-your-project).
export const createMockWizardSteps = () => [
    { id: 'welcome', name: 'Demo Setup', enabled: true },
    { id: 'storefront-setup', name: 'Storefront Setup', enabled: true },
    { id: 'prerequisites', name: 'Prerequisites', enabled: true },
    { id: 'review', name: 'Review', enabled: true },
    { id: 'create-project', name: 'Create Project', enabled: true },
];

// Helper to create mock imported settings for import flow tests.
// Shape pinned by ImportedSettings (= Partial<SettingsFile>): `version` is a
// NUMBER and there is no `exportedFrom` field — the old string/invented pair
// survived only while this fixture was checked against a hand-copied type.
export const createMockImportedSettings = () => ({
    version: 1,
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
        headless: { port: 3000 },
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
                configuration: { services: [] },
            },
        ],
        backends: [
            {
                id: 'commerce-paas',
                name: 'Adobe Commerce PaaS',
                description: 'Backend platform',
                configuration: { services: [] },
            },
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
    return rtlRender(<Provider theme={defaultTheme}>{ui}</Provider>, options);
};
