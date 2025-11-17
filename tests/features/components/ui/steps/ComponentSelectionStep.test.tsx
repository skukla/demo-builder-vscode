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
            { id: 'experience-platform', name: 'Experience Platform', description: 'Adobe Experience Platform' }
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

            const platformCheckbox = screen.getByLabelText('Experience Platform');
            expect(platformCheckbox).toBeInTheDocument();
            expect(platformCheckbox).not.toBeChecked();
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
                    integrations: ['experience-platform'],
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

            const platformCheckbox = screen.getByLabelText('Experience Platform');
            const appCheckbox = screen.getByLabelText('Integration Service');

            expect(platformCheckbox).toBeChecked();
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

    describe('Focus Management', () => {
        it('should set up MutationObserver for focus management', () => {
            // Mock MutationObserver to verify it's being set up
            const mockObserve = jest.fn();
            const mockDisconnect = jest.fn();

            const OriginalMutationObserver = global.MutationObserver;
            global.MutationObserver = jest.fn().mockImplementation(() => ({
                observe: mockObserve,
                disconnect: mockDisconnect,
                takeRecords: jest.fn(),
            })) as any;

            const { unmount } = render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // MutationObserver should be created and observe called
            expect(global.MutationObserver).toHaveBeenCalled();
            expect(mockObserve).toHaveBeenCalled();

            // Cleanup on unmount
            unmount();
            expect(mockDisconnect).toHaveBeenCalled();

            global.MutationObserver = OriginalMutationObserver;
        });

        it('should have a fallback timeout for focus management', async () => {
            // Verify that a timeout is set up (fallback to TIMEOUTS.FOCUS_FALLBACK)
            jest.useFakeTimers();

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

            // Verify pending timers exist (fallback timeout)
            expect(jest.getTimerCount()).toBeGreaterThan(0);

            jest.useRealTimers();
        });

        it('should attempt to focus frontend picker on mount', () => {
            // This is an integration test that verifies the focus logic runs
            // We can't easily test the actual focus() call without mocking too many internals
            // The important thing is that the component mounts without errors
            // and the focus management code executes

            const { container } = render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        componentsData={mockComponentsData}
                    />
                </Provider>
            );

            // Verify the frontend picker container exists (ref target)
            const frontendSection = container.querySelector('[aria-label="Select frontend system"]');
            expect(frontendSection).toBeInTheDocument();
        });

        it('should dispatch keyboard event before focusing to trigger Spectrum focus ring', () => {
            // This test documents that we dispatch a Tab keyboard event before focusing
            // to trigger Spectrum's focus-visible detection for the blue outline

            const mockButton = document.createElement('button');
            const dispatchEventSpy = jest.spyOn(mockButton, 'dispatchEvent');
            const focusSpy = jest.spyOn(mockButton, 'focus');

            // Mock querySelector to return our button
            const querySelectorSpy = jest.spyOn(Element.prototype, 'querySelector');
            querySelectorSpy.mockReturnValue(mockButton);

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

            // Verify keyboard event was dispatched before focus
            expect(dispatchEventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'keydown',
                    key: 'Tab',
                    code: 'Tab',
                    keyCode: 9
                })
            );

            // Verify focus was called after keyboard event
            expect(focusSpy).toHaveBeenCalled();

            // Cleanup
            dispatchEventSpy.mockRestore();
            focusSpy.mockRestore();
            querySelectorSpy.mockRestore();
        });
    });
});
