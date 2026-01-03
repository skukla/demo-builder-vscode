import { render, screen } from '@testing-library/react';
import React from 'react';
import { ReviewStep } from '@/features/project-creation/ui/steps/ReviewStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

describe('ReviewStep', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();
    const mockOnNext = jest.fn();
    const mockOnBack = jest.fn();

    const mockComponentsData = {
        frontends: [
            { id: 'headless', name: 'CitiSignal Next.js', description: 'Next.js frontend' }
        ],
        backends: [
            { id: 'commerce-paas', name: 'Commerce PaaS', description: 'Commerce backend' }
        ],
        dependencies: [
            { id: 'commerce-mesh', name: 'API Mesh for Adobe Developer App Builder', description: 'GraphQL mesh' },
            { id: 'demo-inspector', name: 'Demo Inspector', description: 'Inspector tool' }
        ],
        integrations: [
            { id: 'aem', name: 'Adobe Experience Manager', description: 'AEM integration' },
            { id: 'experience-platform', name: 'Adobe Experience Platform', description: 'Experience Platform integration' }
        ],
        appBuilder: [
            { id: 'custom-app-1', name: 'Custom App 1', description: 'Custom app' },
            { id: 'custom-app-2', name: 'Custom App 2', description: 'Custom app 2' }
        ]
    };

    const completeState: Partial<WizardState> = {
        currentStep: 'review',
        projectName: 'my-demo-project',
        projectTemplate: 'citisignal',
        adobeAuth: {
            isAuthenticated: true,
            isChecking: false,
        },
        adobeOrg: {
            id: 'org123',
            code: 'ORG123',
            name: 'Test Organization',
        },
        adobeProject: {
            id: 'proj456',
            name: 'Test Project',
        },
        adobeWorkspace: {
            id: 'ws789',
            name: 'Test Workspace',
        },
        components: {
            frontend: 'headless',
            backend: 'commerce-paas',
            dependencies: ['commerce-mesh'],
            integrations: [],
            appBuilder: [],
        },
        apiMesh: {
            isChecking: false,
            apiEnabled: true,
            meshExists: true,
            meshId: 'test-mesh-id',
            meshStatus: 'deployed',
            endpoint: 'https://example.com/graphql',
        },
        componentConfigs: {},
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Happy Path - Review Display', () => {
        it('should render project name as heading', () => {
            render(
                <>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </>
            );

            // Project name should be displayed as the main heading
            expect(screen.getByRole('heading', { name: 'my-demo-project' })).toBeInTheDocument();
        });

        it('should display project name', () => {
            render(
                <>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </>
            );

            expect(screen.getByText('my-demo-project')).toBeInTheDocument();
        });

        it('should display frontend component', () => {
            render(
                <>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            expect(screen.getByText('CitiSignal Next.js')).toBeInTheDocument();
        });

        it('should display backend component', () => {
            render(
                <>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            expect(screen.getByText('Commerce PaaS')).toBeInTheDocument();
        });

        it('should display API Mesh dependency', () => {
            render(
                <>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            expect(screen.getByText('API Mesh for Adobe Developer App Builder')).toBeInTheDocument();
        });

        it('should display selected components', () => {
            render(
                <>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Should show frontend and backend components by their display names
            expect(screen.getByText('CitiSignal Next.js')).toBeInTheDocument();
            expect(screen.getByText('Commerce PaaS')).toBeInTheDocument();
        });

        it('should display API Mesh dependency', () => {
            render(
                <>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Should show API Mesh by its full name
            expect(screen.getByText('API Mesh for Adobe Developer App Builder')).toBeInTheDocument();
        });

        it('should enable Continue button automatically', () => {
            render(
                <>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </>
            );

            // Review step should always allow proceeding
            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });
    });

    describe('Edge Cases - Missing Optional Data', () => {
        it('should handle missing API Mesh configuration', () => {
            const stateWithoutMesh = {
                ...completeState,
                apiMesh: undefined,
            };

            render(
                <>
                    <ReviewStep
                        state={stateWithoutMesh as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </>
            );

            // Should render without crashing
            expect(screen.getByText('my-demo-project')).toBeInTheDocument();
        });

        it('should handle missing workspace', () => {
            const stateWithoutWorkspace = {
                ...completeState,
                adobeWorkspace: undefined,
            };

            render(
                <>
                    <ReviewStep
                        state={stateWithoutWorkspace as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </>
            );

            // Should render without crashing
            expect(screen.getByText('my-demo-project')).toBeInTheDocument();
        });

        it('should handle empty components', () => {
            const stateWithoutComponents = {
                ...completeState,
                components: undefined,
            };

            render(
                <>
                    <ReviewStep
                        state={stateWithoutComponents as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </>
            );

            // Should render without crashing
            expect(screen.getByText('my-demo-project')).toBeInTheDocument();
        });
    });

    describe('Edge Cases - Comprehensive Component List', () => {
        it('should display dependencies when selected (demo-inspector is excluded as it is a submodule)', () => {
            const stateWithMultipleDeps = {
                ...completeState,
                components: {
                    ...completeState.components!,
                    dependencies: ['commerce-mesh', 'demo-inspector'],
                },
            };

            render(
                <>
                    <ReviewStep
                        state={stateWithMultipleDeps as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Mesh is shown as "Middleware" row, demo-inspector is filtered out (it's a frontend submodule)
            expect(screen.getByText('Middleware')).toBeInTheDocument();
        });

        it('should display integrations as comma-separated list', () => {
            const stateWithIntegrations = {
                ...completeState,
                components: {
                    ...completeState.components!,
                    integrations: ['aem', 'experience-platform'],
                },
            };

            render(
                <>
                    <ReviewStep
                        state={stateWithIntegrations as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Integrations should be displayed as comma-separated list
            expect(screen.getByText('Adobe Experience Manager, Adobe Experience Platform')).toBeInTheDocument();
        });

        it('should display App Builder apps as comma-separated list', () => {
            const stateWithApps = {
                ...completeState,
                components: {
                    ...completeState.components!,
                    appBuilder: ['custom-app-1', 'custom-app-2'],
                },
            };

            render(
                <>
                    <ReviewStep
                        state={stateWithApps as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // App Builder apps should be displayed as comma-separated list
            expect(screen.getByText('Custom App 1, Custom App 2')).toBeInTheDocument();
        });
    });

    describe('Error Conditions', () => {
        it('should handle minimal state without crashing', () => {
            const minimalState = {
                currentStep: 'review',
                projectName: 'test',
                projectTemplate: 'citisignal',
                componentConfigs: {},
                adobeAuth: { isAuthenticated: false, isChecking: false },
            } as WizardState;

            render(
                <>
                    <ReviewStep
                        state={minimalState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </>
            );

            // Should render without crashing
            expect(screen.getByText('test')).toBeInTheDocument();
        });

        it('should handle null/undefined values gracefully', () => {
            const stateWithNulls = {
                ...completeState,
                adobeOrg: null,
                adobeProject: null,
                adobeWorkspace: null,
            };

            render(
                <>
                    <ReviewStep
                        state={stateWithNulls as unknown as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </>
            );

            // Should render without crashing
            expect(screen.getByText('my-demo-project')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('should display Adobe context breadcrumb', () => {
            render(
                <>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Should show org, project, workspace as breadcrumb
            expect(screen.getByText(/Test Organization/)).toBeInTheDocument();
        });

        it('should have clear section labels', () => {
            render(
                <>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </>
            );

            // Review sections should be clearly labeled with uppercase titles
            expect(screen.getByText('COMPONENTS')).toBeInTheDocument();
        });
    });
});
