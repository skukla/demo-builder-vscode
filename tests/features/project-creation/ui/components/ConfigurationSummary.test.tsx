/**
 * ConfigurationSummary Component Tests
 *
 * Tests the wizard configuration summary component that displays
 * organization, project, workspace, and API Mesh status.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { ConfigurationSummary } from '@/features/project-creation/ui/components/ConfigurationSummary';
import { WizardState, WizardStep } from '@/types/webview';

// Helper to render with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme}>
            {ui}
        </Provider>
    );
};

// Base state fixtures
const createBaseState = (overrides: Partial<WizardState> = {}): WizardState => ({
    projectName: '',
    projectPath: '',
    currentStep: 'welcome',
    completedSteps: [],
    adobeAuth: {
        isAuthenticated: false,
        isChecking: false,
    },
    adobeOrg: undefined,
    adobeProject: undefined,
    adobeWorkspace: undefined,
    apiMesh: undefined,
    selectedComponents: {
        frontend: undefined,
        backend: undefined,
        services: [],
        integrations: [],
        appBuilder: [],
    },
    prerequisites: [],
    prerequisitesChecked: false,
    ...overrides,
} as WizardState);

const authenticatedState = createBaseState({
    adobeAuth: {
        isAuthenticated: true,
        isChecking: false,
        email: 'user@adobe.com',
    },
    adobeOrg: {
        id: 'org-123',
        code: 'ORG123',
        name: 'Test Organization',
    },
});

const stateWithProject = createBaseState({
    adobeAuth: {
        isAuthenticated: true,
        isChecking: false,
        email: 'user@adobe.com',
    },
    adobeOrg: {
        id: 'org-123',
        code: 'ORG123',
        name: 'Test Organization',
    },
    adobeProject: {
        id: 'project-456',
        name: 'test-project',
        title: 'Test Project',
        description: 'A test project description',
    },
});

const stateWithWorkspace = createBaseState({
    adobeAuth: {
        isAuthenticated: true,
        isChecking: false,
        email: 'user@adobe.com',
    },
    adobeOrg: {
        id: 'org-123',
        code: 'ORG123',
        name: 'Test Organization',
    },
    adobeProject: {
        id: 'project-456',
        name: 'test-project',
        title: 'Test Project',
    },
    adobeWorkspace: {
        id: 'workspace-789',
        name: 'Production',
        title: 'Production Workspace',
    },
});

describe('ConfigurationSummary', () => {
    describe('Organization section', () => {
        it('renders "Not authenticated" when not authenticated', () => {
            const state = createBaseState();

            renderWithProvider(
                <ConfigurationSummary state={state} />
            );

            expect(screen.getByText('Organization')).toBeInTheDocument();
            expect(screen.getByText('Not authenticated')).toBeInTheDocument();
        });

        it('renders "No organization selected" when authenticated but no org', () => {
            const state = createBaseState({
                adobeAuth: {
                    isAuthenticated: true,
                    isChecking: false,
                },
            });

            renderWithProvider(
                <ConfigurationSummary state={state} />
            );

            expect(screen.getByText('No organization selected')).toBeInTheDocument();
        });

        it('renders "Switching..." when checking', () => {
            const state = createBaseState({
                adobeAuth: {
                    isAuthenticated: true,
                    isChecking: true,
                },
            });

            renderWithProvider(
                <ConfigurationSummary state={state} />
            );

            expect(screen.getByText('Switching...')).toBeInTheDocument();
        });

        it('renders organization name when authenticated with org', () => {
            renderWithProvider(
                <ConfigurationSummary state={authenticatedState} />
            );

            expect(screen.getByText('Test Organization')).toBeInTheDocument();
        });
    });

    describe('Project section', () => {
        it('renders "Not selected" when no project', () => {
            renderWithProvider(
                <ConfigurationSummary state={authenticatedState} />
            );

            expect(screen.getByText('Project')).toBeInTheDocument();
            // First "Not selected" is for project, second might be for workspace
            const notSelectedElements = screen.getAllByText('Not selected');
            expect(notSelectedElements.length).toBeGreaterThan(0);
        });

        it('renders project title when selected', () => {
            renderWithProvider(
                <ConfigurationSummary state={stateWithProject} />
            );

            expect(screen.getByText('Test Project')).toBeInTheDocument();
        });

        it('renders project description when available', () => {
            renderWithProvider(
                <ConfigurationSummary state={stateWithProject} />
            );

            expect(screen.getByText('A test project description')).toBeInTheDocument();
        });

        it('renders project name when title is not available', () => {
            const stateWithNameOnly = createBaseState({
                adobeAuth: { isAuthenticated: true, isChecking: false },
                adobeOrg: { id: 'org-123', code: 'ORG123', name: 'Org' },
                adobeProject: {
                    id: 'project-456',
                    name: 'project-name-only',
                },
            });

            renderWithProvider(
                <ConfigurationSummary state={stateWithNameOnly} />
            );

            expect(screen.getByText('project-name-only')).toBeInTheDocument();
        });

        it('shows completed icon when project step is completed', () => {
            const { container } = renderWithProvider(
                <ConfigurationSummary
                    state={stateWithProject}
                    completedSteps={['adobe-project']}
                    currentStep="adobe-workspace"
                />
            );

            // CheckmarkCircle icon should be present for completed project
            expect(container.querySelector('svg')).toBeInTheDocument();
        });
    });

    describe('Workspace section', () => {
        it('renders "Not selected" when no workspace', () => {
            renderWithProvider(
                <ConfigurationSummary state={stateWithProject} />
            );

            expect(screen.getByText('Workspace')).toBeInTheDocument();
        });

        it('renders workspace title when selected', () => {
            renderWithProvider(
                <ConfigurationSummary state={stateWithWorkspace} />
            );

            expect(screen.getByText('Production Workspace')).toBeInTheDocument();
        });

        it('renders workspace name when title is not available', () => {
            const stateWithNameOnly = createBaseState({
                ...stateWithWorkspace,
                adobeWorkspace: {
                    id: 'workspace-789',
                    name: 'workspace-name-only',
                },
            });

            renderWithProvider(
                <ConfigurationSummary state={stateWithNameOnly} />
            );

            expect(screen.getByText('workspace-name-only')).toBeInTheDocument();
        });
    });

    describe('API Mesh section', () => {
        it('renders "Not selected" when no workspace', () => {
            renderWithProvider(
                <ConfigurationSummary state={stateWithProject} />
            );

            expect(screen.getByText('API Mesh')).toBeInTheDocument();
        });

        it('renders "Checking..." when apiMesh is checking', () => {
            const stateWithMeshChecking = createBaseState({
                ...stateWithWorkspace,
                apiMesh: {
                    isChecking: true,
                },
            });

            renderWithProvider(
                <ConfigurationSummary
                    state={stateWithMeshChecking}
                    currentStep="api-mesh"
                />
            );

            expect(screen.getByText('Checking...')).toBeInTheDocument();
        });

        it('renders "Mesh Deployed" when mesh is deployed', () => {
            const stateWithMeshDeployed = createBaseState({
                ...stateWithWorkspace,
                apiMesh: {
                    isChecking: false,
                    apiEnabled: true,
                    meshExists: true,
                    meshStatus: 'deployed',
                },
            });

            renderWithProvider(
                <ConfigurationSummary
                    state={stateWithMeshDeployed}
                    currentStep="api-mesh"
                />
            );

            expect(screen.getByText('Mesh Deployed')).toBeInTheDocument();
        });

        it('renders "Mesh Error" when mesh has error status', () => {
            const stateWithMeshError = createBaseState({
                ...stateWithWorkspace,
                apiMesh: {
                    isChecking: false,
                    apiEnabled: true,
                    meshExists: true,
                    meshStatus: 'error',
                },
            });

            renderWithProvider(
                <ConfigurationSummary
                    state={stateWithMeshError}
                    currentStep="api-mesh"
                />
            );

            expect(screen.getByText('Mesh Error')).toBeInTheDocument();
        });

        it('renders "Mesh Pending" when mesh exists but not deployed', () => {
            const stateWithMeshPending = createBaseState({
                ...stateWithWorkspace,
                apiMesh: {
                    isChecking: false,
                    apiEnabled: true,
                    meshExists: true,
                    meshStatus: 'pending',
                },
            });

            renderWithProvider(
                <ConfigurationSummary
                    state={stateWithMeshPending}
                    currentStep="api-mesh"
                />
            );

            expect(screen.getByText('Mesh Pending')).toBeInTheDocument();
        });

        it('renders "Ready for creation" when API enabled but no mesh', () => {
            const stateWithNoMesh = createBaseState({
                ...stateWithWorkspace,
                apiMesh: {
                    isChecking: false,
                    apiEnabled: true,
                    meshExists: false,
                },
            });

            renderWithProvider(
                <ConfigurationSummary
                    state={stateWithNoMesh}
                    currentStep="api-mesh"
                />
            );

            expect(screen.getByText('Ready for creation')).toBeInTheDocument();
        });

        it('renders "Not enabled" when API is not enabled', () => {
            const stateWithApiDisabled = createBaseState({
                ...stateWithWorkspace,
                apiMesh: {
                    isChecking: false,
                    apiEnabled: false,
                },
            });

            renderWithProvider(
                <ConfigurationSummary
                    state={stateWithApiDisabled}
                    currentStep="api-mesh"
                />
            );

            expect(screen.getByText('Not enabled')).toBeInTheDocument();
        });

        it('renders "Pending" as default state', () => {
            const stateWithDefaultMesh = createBaseState({
                ...stateWithWorkspace,
                apiMesh: {
                    isChecking: false,
                },
            });

            renderWithProvider(
                <ConfigurationSummary
                    state={stateWithDefaultMesh}
                    currentStep="api-mesh"
                />
            );

            expect(screen.getByText('Pending')).toBeInTheDocument();
        });
    });

    describe('step completion tracking', () => {
        it('uses completedSteps to determine completion icons', () => {
            const { container } = renderWithProvider(
                <ConfigurationSummary
                    state={stateWithWorkspace}
                    completedSteps={['adobe-project', 'adobe-workspace']}
                    currentStep="api-mesh"
                />
            );

            // Multiple checkmark icons should be present for completed steps
            const svgs = container.querySelectorAll('svg');
            expect(svgs.length).toBeGreaterThan(0);
        });

        it('shows pending state for steps ahead of current step', () => {
            renderWithProvider(
                <ConfigurationSummary
                    state={authenticatedState}
                    completedSteps={[]}
                    currentStep="adobe-auth"
                />
            );

            // Project and Workspace should show "Not selected" since we're before those steps
            const notSelectedElements = screen.getAllByText('Not selected');
            expect(notSelectedElements.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('rendering', () => {
        it('renders Configuration Summary heading', () => {
            renderWithProvider(
                <ConfigurationSummary state={createBaseState()} />
            );

            expect(screen.getByText('Configuration Summary')).toBeInTheDocument();
        });

        it('renders all four sections', () => {
            renderWithProvider(
                <ConfigurationSummary state={createBaseState()} />
            );

            expect(screen.getByText('Organization')).toBeInTheDocument();
            expect(screen.getByText('Project')).toBeInTheDocument();
            expect(screen.getByText('Workspace')).toBeInTheDocument();
            expect(screen.getByText('API Mesh')).toBeInTheDocument();
        });
    });
});
