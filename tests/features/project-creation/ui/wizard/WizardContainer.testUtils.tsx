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
    frontend: 'citisignal-nextjs',
    backend: 'commerce-paas',
    dependencies: [],
    integrations: [],
    appBuilderApps: [],
});

// Note: Welcome step removed in Step 3 - wizard starts at adobe-auth
export const createMockWizardSteps = () => [
    { id: 'adobe-auth', name: 'Adobe Authentication', enabled: true },
    { id: 'adobe-project', name: 'Adobe Project', enabled: true },
    { id: 'adobe-workspace', name: 'Adobe Workspace', enabled: true },
    { id: 'component-selection', name: 'Component Selection', enabled: true },
    { id: 'prerequisites', name: 'Prerequisites', enabled: true },
    { id: 'api-mesh', name: 'API Mesh', enabled: true },
    { id: 'settings', name: 'Settings', enabled: true },
    { id: 'review', name: 'Review', enabled: true },
    { id: 'project-creation', name: 'Creating Project', enabled: true },
];

export const createMockComponentsDataResponse = () => ({
    success: true,
    type: 'components-data',
    data: {
        frontends: [
            {
                id: 'citisignal-nextjs',
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
    // Wait for any pending timers/promises to complete
    await new Promise(resolve => setTimeout(resolve, 50));
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
