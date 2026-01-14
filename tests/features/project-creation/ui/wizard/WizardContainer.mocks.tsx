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

// Mock demoPackageLoader to prevent JSON import issues in tests
// WizardContainer calls loadDemoPackages() which loads from demo-packages.json
jest.mock('@/features/project-creation/ui/helpers/demoPackageLoader', () => ({
    __esModule: true,
    loadDemoPackages: async () => [
        {
            id: 'test-package',
            name: 'Test Package',
            description: 'Test package for unit tests',
            configDefaults: {},
            storefronts: {
                'test-stack': {
                    name: 'Test Storefront',
                    description: 'Test storefront for tests',
                    source: { type: 'git', url: 'https://github.com/test/repo', branch: 'main' },
                },
            },
        },
    ],
}));

// Mock brandStackLoader for loadStacks() which access components.json
jest.mock('@/features/project-creation/ui/helpers/brandStackLoader', () => ({
    __esModule: true,
    loadStacks: async () => [
        {
            id: 'test-stack',
            name: 'Test Stack',
            frontend: 'test-frontend',
            backend: 'test-backend',
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

// Note: ApiMeshStep was removed from the wizard - mesh deployment now uses MeshDeploymentStep
// which is handled separately (not a wizard step). No mock needed here.
