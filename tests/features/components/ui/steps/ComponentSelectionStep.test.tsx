import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ComponentSelectionStep } from '@/features/components/ui/steps/ComponentSelectionStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

// Mock WebviewClient
const mockPostMessage = jest.fn();
const mockOnMessage = jest.fn().mockReturnValue(jest.fn());

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => mockPostMessage(...args),
        onMessage: (...args: any[]) => mockOnMessage(...args),
    },
}));

describe('ComponentSelectionStep', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    const baseState: Partial<WizardState> = {
        currentStep: 'component-selection',
        components: undefined,
    };

    const mockComponentsData = {
        frontends: [
            { id: 'citisignal-nextjs', name: 'Headless CitiSignal', description: 'NextJS storefront' }
        ],
        backends: [
            { id: 'adobe-commerce-paas', name: 'Adobe Commerce PaaS', description: 'Commerce DSN' }
        ],
        integrations: [
            { id: 'target', name: 'Target', description: 'Adobe Target' }
        ],
        appBuilder: [
            { id: 'integration-service', name: 'Integration Service', description: 'Custom service' }
        ]
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn());
    });

    describe('Happy Path - Component Selection', () => {
        it('should render with available components', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(screen.getByText('Frontend')).toBeInTheDocument();
            expect(screen.getByText('Backend')).toBeInTheDocument();
            expect(screen.getByText('External Systems')).toBeInTheDocument();
            expect(screen.getByText('App Builder Apps')).toBeInTheDocument();
        });

        it('should allow frontend selection', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            const frontendPicker = screen.getByLabelText('Select frontend system');
            expect(frontendPicker).toBeInTheDocument();
        });

        it('should allow backend selection', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            const backendPicker = screen.getByLabelText('Select backend system');
            expect(backendPicker).toBeInTheDocument();
        });

        it('should enable continue when frontend and backend selected', () => {
            const stateWithSelections = {
                ...baseState,
                components: {
                    frontend: 'citisignal-nextjs',
                    backend: 'adobe-commerce-paas',
                    dependencies: ['commerce-mesh'],
                    services: ['catalog-service', 'live-search'],
                    integrations: [],
                    appBuilderApps: []
                }
            };

            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithSelections as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should update state when selections change', () => {
            const stateWithSelections = {
                ...baseState,
                components: {
                    frontend: 'citisignal-nextjs',
                    backend: 'adobe-commerce-paas',
                    dependencies: ['commerce-mesh'],
                    services: ['catalog-service', 'live-search'],
                    integrations: [],
                    appBuilderApps: []
                }
            };

            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithSelections as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    components: expect.objectContaining({
                        frontend: 'citisignal-nextjs',
                        backend: 'adobe-commerce-paas'
                    })
                })
            );
        });
    });

    describe('Required Dependencies', () => {
        it('should mark required dependencies as checked and disabled', () => {
            const stateWithFrontend = {
                ...baseState,
                components: {
                    frontend: 'citisignal-nextjs',
                    backend: '',
                    dependencies: ['commerce-mesh'],
                    services: [],
                    integrations: [],
                    appBuilderApps: []
                }
            };

            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            const meshCheckbox = screen.getByLabelText('API Mesh');
            expect(meshCheckbox).toBeChecked();
            expect(meshCheckbox).toBeDisabled();
        });

        it('should auto-select required dependencies when frontend selected', () => {
            const stateInitial = {
                ...baseState,
                components: {
                    frontend: '',
                    backend: '',
                    dependencies: [],
                    services: [],
                    integrations: [],
                    appBuilderApps: []
                }
            };

            const { rerender } = render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateInitial as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Simulate frontend selection
            const stateWithFrontend = {
                ...baseState,
                components: {
                    frontend: 'citisignal-nextjs',
                    backend: '',
                    dependencies: ['commerce-mesh'],
                    services: [],
                    integrations: [],
                    appBuilderApps: []
                }
            };

            rerender(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(mockUpdateState).toHaveBeenCalled();
        });

        it('should auto-select required services when backend selected', () => {
            const stateWithBackend = {
                ...baseState,
                components: {
                    frontend: '',
                    backend: 'adobe-commerce-paas',
                    dependencies: [],
                    services: ['catalog-service', 'live-search'],
                    integrations: [],
                    appBuilderApps: []
                }
            };

            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithBackend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            const catalogCheckbox = screen.getByLabelText('Catalog Service');
            const liveSearchCheckbox = screen.getByLabelText('Live Search');

            expect(catalogCheckbox).toBeChecked();
            expect(catalogCheckbox).toBeDisabled();
            expect(liveSearchCheckbox).toBeChecked();
            expect(liveSearchCheckbox).toBeDisabled();
        });
    });

    describe('Optional Components', () => {
        it('should allow toggling optional dependencies', () => {
            const stateWithFrontend = {
                ...baseState,
                components: {
                    frontend: 'citisignal-nextjs',
                    backend: '',
                    dependencies: ['commerce-mesh'],
                    services: [],
                    integrations: [],
                    appBuilderApps: []
                }
            };

            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            const demoInspectorCheckbox = screen.getByLabelText('Demo Inspector');
            expect(demoInspectorCheckbox).not.toBeDisabled();
        });

        it('should allow selecting external integrations', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            const targetCheckbox = screen.getByLabelText('Target');
            expect(targetCheckbox).toBeInTheDocument();
            expect(targetCheckbox).not.toBeChecked();
        });

        it('should allow selecting app builder apps', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            const appCheckbox = screen.getByLabelText('Integration Service');
            expect(appCheckbox).toBeInTheDocument();
            expect(appCheckbox).not.toBeChecked();
        });
    });

    describe('Backend Communication', () => {
        it('should send component selection to backend', () => {
            const stateWithSelections = {
                ...baseState,
                components: {
                    frontend: 'citisignal-nextjs',
                    backend: 'adobe-commerce-paas',
                    dependencies: ['commerce-mesh'],
                    services: ['catalog-service', 'live-search'],
                    integrations: [],
                    appBuilderApps: []
                }
            };

            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithSelections as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(mockPostMessage).toHaveBeenCalledWith(
                'update-component-selection',
                expect.objectContaining({
                    frontend: 'citisignal-nextjs',
                    backend: 'adobe-commerce-paas'
                })
            );
        });
    });

    describe('Validation', () => {
        it('should not allow proceed without frontend', () => {
            const stateNoFrontend = {
                ...baseState,
                components: {
                    frontend: '',
                    backend: 'adobe-commerce-paas',
                    dependencies: [],
                    services: ['catalog-service', 'live-search'],
                    integrations: [],
                    appBuilderApps: []
                }
            };

            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateNoFrontend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should not allow proceed without backend', () => {
            const stateNoBackend = {
                ...baseState,
                components: {
                    frontend: 'citisignal-nextjs',
                    backend: '',
                    dependencies: ['commerce-mesh'],
                    services: [],
                    integrations: [],
                    appBuilderApps: []
                }
            };

            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateNoBackend as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    describe('Edge Cases', () => {
        it('should initialize from state defaults', () => {
            const stateWithDefaults = {
                ...baseState,
                components: {
                    frontend: 'citisignal-nextjs',
                    backend: 'adobe-commerce-paas',
                    dependencies: ['commerce-mesh'],
                    services: ['catalog-service', 'live-search'],
                    integrations: ['target'],
                    appBuilderApps: ['integration-service']
                }
            };

            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithDefaults as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            const targetCheckbox = screen.getByLabelText('Target');
            const appCheckbox = screen.getByLabelText('Integration Service');

            expect(targetCheckbox).toBeChecked();
            expect(appCheckbox).toBeChecked();
        });

        it('should prevent duplicate backend messages', () => {
            const stateWithSelections = {
                ...baseState,
                components: {
                    frontend: 'citisignal-nextjs',
                    backend: 'adobe-commerce-paas',
                    dependencies: ['commerce-mesh'],
                    services: ['catalog-service', 'live-search'],
                    integrations: [],
                    appBuilderApps: []
                }
            };

            const { rerender } = render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithSelections as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            const initialCallCount = mockPostMessage.mock.calls.length;

            // Re-render with same state
            rerender(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={stateWithSelections as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Should not send duplicate messages
            expect(mockPostMessage.mock.calls.length).toBe(initialCallCount);
        });
    });
});
