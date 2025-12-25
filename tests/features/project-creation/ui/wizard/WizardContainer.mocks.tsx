/**
 * Jest mocks for WizardContainer tests
 * These must be imported at the top of each test file BEFORE the component imports
 */
import React from 'react';
import {
    mockPostMessage,
    mockRequest,
    mockOnMessage,
    mockCreateProject,
} from './WizardContainer.testUtils';

// Mock vscode API
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: (...args: any[]) => mockPostMessage(...args),
        request: (...args: any[]) => mockRequest(...args),
        onMessage: (...args: any[]) => mockOnMessage(...args),
        createProject: (...args: any[]) => mockCreateProject(...args),
    },
}));

// Mock brandStackLoader to prevent undefined components access in tests
// WizardContainer calls loadBrands() and loadStacks() which access components.json
jest.mock('@/features/project-creation/ui/helpers/brandStackLoader', () => ({
    __esModule: true,
    loadBrands: async () => [
        {
            id: 'test-brand',
            name: 'Test Brand',
            description: 'Test brand for unit tests',
            logo: '/test-logo.svg',
            stacks: ['test-stack'],
        },
    ],
    loadStacks: async () => [
        {
            id: 'test-stack',
            name: 'Test Stack',
            frontend: 'test-frontend',
            backend: 'test-backend',
        },
    ],
}));

// Mock templateLoader to prevent JSON import issues in tests
jest.mock('@/features/project-creation/ui/helpers/templateLoader', () => ({
    __esModule: true,
    loadDemoTemplates: async () => [
        {
            id: 'test-template',
            name: 'Test Template',
            description: 'Test template for unit tests',
        },
    ],
}));

// Mock all step components
jest.mock('@/features/project-creation/ui/steps/WelcomeStep', () => ({
    WelcomeStep: ({ setCanProceed }: any) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="welcome-step">Welcome Step</div>;
    },
}));

jest.mock('@/features/project-creation/ui/steps/ReviewStep', () => ({
    ReviewStep: ({ setCanProceed }: any) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="review-step">Review Step</div>;
    },
}));

jest.mock('@/features/project-creation/ui/steps/ProjectCreationStep', () => ({
    ProjectCreationStep: () => <div data-testid="project-creation-step">Project Creation Step</div>,
}));

jest.mock('@/features/authentication/ui/steps/AdobeAuthStep', () => ({
    AdobeAuthStep: ({ setCanProceed }: any) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="adobe-auth-step">Adobe Auth Step</div>;
    },
}));

jest.mock('@/features/authentication/ui/steps/AdobeProjectStep', () => ({
    AdobeProjectStep: ({ setCanProceed }: any) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="adobe-project-step">Adobe Project Step</div>;
    },
}));

jest.mock('@/features/authentication/ui/steps/AdobeWorkspaceStep', () => ({
    AdobeWorkspaceStep: ({ setCanProceed }: any) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="adobe-workspace-step">Adobe Workspace Step</div>;
    },
}));

jest.mock('@/features/components/ui/steps/ComponentSelectionStep', () => ({
    ComponentSelectionStep: ({ setCanProceed }: any) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="component-selection-step">Component Selection Step</div>;
    },
}));

jest.mock('@/features/components/ui/steps/ComponentConfigStep', () => ({
    ComponentConfigStep: ({ setCanProceed }: any) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="component-config-step">Component Config Step</div>;
    },
}));

jest.mock('@/features/prerequisites/ui/steps/PrerequisitesStep', () => ({
    PrerequisitesStep: ({ setCanProceed }: any) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="prerequisites-step">Prerequisites Step</div>;
    },
}));

jest.mock('@/features/mesh/ui/steps/ApiMeshStep', () => ({
    ApiMeshStep: ({ setCanProceed }: any) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="api-mesh-step">API Mesh Step</div>;
    },
}));
