import { render, screen } from '@testing-library/react';
import React from 'react';
import { ReviewStep } from '@/features/project-creation/ui/steps/ReviewStep';
import { WizardState } from '@/types/webview';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

describe('ReviewStep', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();
    const mockOnNext = jest.fn();
    const mockOnBack = jest.fn();

    const mockComponentsData = {
        frontends: [
            { id: 'citisignal-nextjs', name: 'CitiSignal Next.js', description: 'Next.js frontend' }
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
            frontend: 'citisignal-nextjs',
            backend: 'commerce-paas',
            dependencies: ['commerce-mesh'],
            integrations: [],
            appBuilderApps: [],
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
        it('should render review heading', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText(/Ready to create/i)).toBeInTheDocument();
        });

        it('should display project name', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText('my-demo-project')).toBeInTheDocument();
        });

        it('should display frontend component', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(screen.getByText('CitiSignal Next.js')).toBeInTheDocument();
        });

        it('should display backend component', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(screen.getByText('Commerce PaaS')).toBeInTheDocument();
        });

        it('should display API Mesh dependency', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(screen.getByText('API Mesh for Adobe Developer App Builder')).toBeInTheDocument();
        });

        it('should display selected components', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Should show frontend and backend components by their display names
            expect(screen.getByText('CitiSignal Next.js')).toBeInTheDocument();
            expect(screen.getByText('Commerce PaaS')).toBeInTheDocument();
        });

        it('should display API Mesh dependency', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Should show API Mesh by its full name
            expect(screen.getByText('API Mesh for Adobe Developer App Builder')).toBeInTheDocument();
        });

        it('should enable Continue button automatically', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
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
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={stateWithoutMesh as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
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
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={stateWithoutWorkspace as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
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
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={stateWithoutComponents as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Should render without crashing
            expect(screen.getByText('my-demo-project')).toBeInTheDocument();
        });
    });

    describe('Edge Cases - Comprehensive Component List', () => {
        it('should display all dependencies when multiple are selected', () => {
            const stateWithMultipleDeps = {
                ...completeState,
                components: {
                    ...completeState.components!,
                    dependencies: ['commerce-mesh', 'demo-inspector'],
                },
            };

            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={stateWithMultipleDeps as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // All dependencies should be visible by their display names
            expect(screen.getByText('API Mesh for Adobe Developer App Builder')).toBeInTheDocument();
            expect(screen.getByText('Demo Inspector')).toBeInTheDocument();
        });

        it('should display all integrations when multiple are selected', () => {
            const stateWithIntegrations = {
                ...completeState,
                components: {
                    ...completeState.components!,
                    integrations: ['aem', 'experience-platform'],
                },
            };

            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={stateWithIntegrations as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Integrations should be listed by their display names
            expect(screen.getByText('Adobe Experience Manager')).toBeInTheDocument();
            expect(screen.getByText('Adobe Experience Platform')).toBeInTheDocument();
        });

        it('should display App Builder apps when selected', () => {
            const stateWithApps = {
                ...completeState,
                components: {
                    ...completeState.components!,
                    appBuilderApps: ['custom-app-1', 'custom-app-2'],
                },
            };

            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={stateWithApps as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // App Builder apps should be visible by their display names
            expect(screen.getByText('Custom App 1')).toBeInTheDocument();
            expect(screen.getByText('Custom App 2')).toBeInTheDocument();
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
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={minimalState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
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
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={stateWithNulls as unknown as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Should render without crashing
            expect(screen.getByText('my-demo-project')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('should have clear status indicator', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Should have "Ready to create" status text
            expect(screen.getByText('Ready to create')).toBeInTheDocument();
        });

        it('should have clear section labels', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Review sections should be clearly labeled
            expect(screen.getByText(/my-demo-project/i)).toBeInTheDocument();
        });
    });
});
