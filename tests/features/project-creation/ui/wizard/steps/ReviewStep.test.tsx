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

    // Mock component data - IDs must match those used in stacks.json
    // headless-paas stack uses: frontend='headless', backend='adobe-commerce-paas', dependencies=['headless-commerce-mesh']
    const mockComponentsData = {
        frontends: [
            { id: 'headless', name: 'CitiSignal Next.js', description: 'Next.js frontend' }
        ],
        backends: [
            { id: 'adobe-commerce-paas', name: 'Commerce PaaS', description: 'Commerce backend' }
        ],
        dependencies: [
            { id: 'demo-inspector', name: 'Demo Inspector', description: 'Inspector tool' }
        ],
        mesh: [
            { id: 'headless-commerce-mesh', name: 'Headless Commerce API Mesh', description: 'GraphQL mesh', subType: 'mesh' },
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

    // Complete state for headless-paas stack
    // The ReviewStep derives components from selectedStack via getStackById()
    const completeState: Partial<WizardState> = {
        currentStep: 'review',
        projectName: 'my-demo-project',
        projectTemplate: 'citisignal',
        selectedStack: 'headless-paas', // Source of truth for components
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
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={completeState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Project name should be displayed as the main heading
            expect(screen.getByRole('heading', { name: 'my-demo-project' })).toBeInTheDocument();
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

        it('should display frontend component from stack', () => {
            // headless-paas stack has frontend: 'headless' → "CitiSignal Next.js"
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

        it('should display backend component from stack', () => {
            // headless-paas stack has backend: 'adobe-commerce-paas' → "Commerce PaaS"
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

        it('should display API Mesh dependency from stack', () => {
            // headless-paas stack has dependencies: ['headless-commerce-mesh']
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

            expect(screen.getByText('Headless Commerce API Mesh')).toBeInTheDocument();
        });

        it('should display all stack components', () => {
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

            // Should show frontend and backend components derived from selectedStack
            expect(screen.getByText('CitiSignal Next.js')).toBeInTheDocument();
            expect(screen.getByText('Commerce PaaS')).toBeInTheDocument();
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

        it('should handle missing selectedStack', () => {
            const stateWithoutStack = {
                ...completeState,
                selectedStack: undefined,
            };

            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={stateWithoutStack as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Should render without crashing
            expect(screen.getByText('my-demo-project')).toBeInTheDocument();
        });
    });

    describe('Edge Cases - Stack-Derived Components', () => {
        it('should display Middleware section for stack with mesh dependency', () => {
            // headless-paas stack has headless-commerce-mesh in dependencies
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

            // Mesh is shown as "Middleware" row
            expect(screen.getByText('Middleware')).toBeInTheDocument();
        });

        it('should show deployed status for mesh when meshStatus is deployed', () => {
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

            // Should show "Deployed" indicator for deployed mesh
            expect(screen.getByText('Deployed')).toBeInTheDocument();
        });

        it('should handle different stacks with different dependencies', () => {
            // eds-paas stack uses eds-commerce-mesh instead of headless-commerce-mesh
            const edsComponentsData = {
                ...mockComponentsData,
                frontends: [{ id: 'eds-storefront', name: 'Edge Delivery Storefront', description: 'EDS frontend' }],
                dependencies: [
                    { id: 'demo-inspector', name: 'Demo Inspector', description: 'Inspector tool' }
                ],
                mesh: [
                    { id: 'eds-commerce-mesh', name: 'EDS Commerce API Mesh', description: 'GraphQL mesh', subType: 'mesh' },
                ],
            };

            const edsState = {
                ...completeState,
                selectedStack: 'eds-paas',
            };

            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={edsState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={edsComponentsData}
                    />
                </Provider>
            );

            // Should show EDS frontend and mesh
            expect(screen.getByText('Edge Delivery Storefront')).toBeInTheDocument();
            expect(screen.getByText('EDS Commerce API Mesh')).toBeInTheDocument();
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
        it('should display Adobe context breadcrumb', () => {
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

            // Should show org, project, workspace as breadcrumb
            expect(screen.getByText(/Test Organization/)).toBeInTheDocument();
        });

        it('should have clear section labels', () => {
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

            // Review sections should be clearly labeled with uppercase titles
            expect(screen.getByText('COMPONENTS')).toBeInTheDocument();
        });
    });

    describe('Demo Inspector display', () => {
        it('should show Demo Inspector when in selectedAddons', () => {
            // Demo Inspector is enabled via selectedAddons (stack optionalAddons can default it)
            const stateWithDemoInspectorInAddons: Partial<WizardState> = {
                ...completeState,
                selectedAddons: ['demo-inspector'],
            };

            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={stateWithDemoInspectorInAddons as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(screen.getByText('Demo Inspector')).toBeInTheDocument();
        });

        it('should not show Demo Inspector when not in selectedAddons', () => {
            // Demo Inspector requires explicit selection via selectedAddons
            const stateWithoutDemoInspector: Partial<WizardState> = {
                ...completeState,
                selectedAddons: [], // No addons selected
            };

            render(
                <Provider theme={defaultTheme}>
                    <ReviewStep
                        state={stateWithoutDemoInspector as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(screen.queryByText('Demo Inspector')).not.toBeInTheDocument();
        });
    });
});
