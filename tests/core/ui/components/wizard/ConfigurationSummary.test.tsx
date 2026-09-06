/**
 * ConfigurationSummary Component Tests
 *
 * Tests the wizard configuration summary component that displays
 * organization, project, and workspace status.
 * Note: API Mesh section was removed - mesh is now deployed during project creation.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { ConfigurationSummary } from '@/core/ui/components/wizard/ConfigurationSummary';
import { WizardState } from '@/types/webview';

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

        it('reports no organization when signed out, even with one still in state', () => {
            const state = createBaseState({
                adobeAuth: { isAuthenticated: false, isChecking: false },
                adobeOrg: { id: 'org-123', code: 'ORG123', name: 'Test Organization' },
            });

            renderWithProvider(<ConfigurationSummary state={state} />);

            expect(screen.getByText('Not authenticated')).toBeInTheDocument();
            expect(screen.queryByText('Test Organization')).not.toBeInTheDocument();
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

        // Counts include the Organization section, which is completed (green)
        // whenever the state is authenticated with an org. Workspace is absent
        // here, so it is 'empty' and contributes no icon at all.
        it('marks the project completed — a green check, not the pending clock', () => {
            const { container } = renderWithProvider(
                <ConfigurationSummary
                    state={stateWithProject}
                    completedSteps={['adobe-project']}
                />
            );

            expect(container.querySelectorAll('.text-green-600')).toHaveLength(2);
            expect(container.querySelectorAll('.text-blue-600')).toHaveLength(0);
        });

        it('marks a selected but uncompleted project pending — the clock, no check', () => {
            const { container } = renderWithProvider(
                <ConfigurationSummary state={stateWithProject} completedSteps={[]} />
            );

            expect(container.querySelectorAll('.text-blue-600')).toHaveLength(1);
            expect(container.querySelectorAll('.text-green-600')).toHaveLength(1);
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

    // Note: API Mesh section removed - mesh is now deployed automatically during project creation

    describe('step completion tracking', () => {
        it('completes exactly the sections named in completedSteps', () => {
            const { container } = renderWithProvider(
                <ConfigurationSummary
                    state={stateWithWorkspace}
                    completedSteps={['adobe-project']}
                />
            );

            // Organization + Project completed, Workspace still pending.
            expect(container.querySelectorAll('.text-green-600')).toHaveLength(2);
            expect(container.querySelectorAll('.text-blue-600')).toHaveLength(1);
        });

        it('completes nothing when completedSteps is omitted', () => {
            const { container } = renderWithProvider(
                <ConfigurationSummary state={stateWithWorkspace} />
            );

            // Only the Organization stays green; both wizard steps read pending.
            expect(container.querySelectorAll('.text-green-600')).toHaveLength(1);
            expect(container.querySelectorAll('.text-blue-600')).toHaveLength(2);
        });
    });

    describe('rendering', () => {
        it('renders Configuration Summary heading', () => {
            renderWithProvider(
                <ConfigurationSummary state={createBaseState()} />
            );

            expect(screen.getByText('Configuration Summary')).toBeInTheDocument();
        });

        it('renders all three sections (API Mesh removed - deployed during creation)', () => {
            renderWithProvider(
                <ConfigurationSummary state={createBaseState()} />
            );

            expect(screen.getByText('Organization')).toBeInTheDocument();
            expect(screen.getByText('Project')).toBeInTheDocument();
            expect(screen.getByText('Workspace')).toBeInTheDocument();
            // API Mesh section removed - mesh is now deployed automatically during project creation
            expect(screen.queryByText('API Mesh')).not.toBeInTheDocument();
        });
    });
});
