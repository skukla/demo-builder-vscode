import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ApiMeshStep } from '@/features/mesh/ui/steps/ApiMeshStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

// Mock WebviewClient
const mockPostMessage = jest.fn();
const mockOnMessage = jest.fn().mockReturnValue(jest.fn());
const mockRequest = jest.fn();

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => mockPostMessage(...args),
        onMessage: (...args: any[]) => mockOnMessage(...args),
        request: (...args: any[]) => mockRequest(...args),
    },
}));

// Mock LoadingDisplay
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message, subMessage }: { message: string; subMessage?: string }) => (
        <div data-testid="loading-display">
            <div>{message}</div>
            {subMessage && <div>{subMessage}</div>}
        </div>
    ),
}));

// Mock FadeTransition
jest.mock('@/core/ui/components/ui/FadeTransition', () => ({
    FadeTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock ConfigurationSummary
jest.mock('@/features/project-creation/ui/components/ConfigurationSummary', () => ({
    ConfigurationSummary: () => <div data-testid="config-summary">Summary</div>,
}));

// Mock TwoColumnLayout
jest.mock('@/core/ui/components/layout/TwoColumnLayout', () => ({
    TwoColumnLayout: ({ leftContent, rightContent }: any) => (
        <div>
            <div data-testid="left-content">{leftContent}</div>
            <div data-testid="right-content">{rightContent}</div>
        </div>
    ),
}));

// Mock Modal and other complex components
jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/core/ui/components/ui/NumberedInstructions', () => ({
    NumberedInstructions: () => <div>Instructions</div>,
}));

describe('ApiMeshStep', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();
    const mockOnBack = jest.fn();

    const baseState: Partial<WizardState> = {
        currentStep: 'api-mesh',
        adobeAuth: {
            isAuthenticated: true,
            isChecking: false,
        },
        adobeOrg: {
            id: 'org-123',
            code: 'TEST_ORG',
            name: 'Test Organization',
        },
        adobeWorkspace: {
            id: 'workspace-123',
            name: 'Test Workspace',
        },
        apiMesh: undefined,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn());
        mockRequest.mockResolvedValue({ success: false });
    });

    describe('Happy Path - Mesh Enabled and Deployed', () => {
        it('should render checking state initially', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            expect(screen.getByTestId('loading-display')).toBeInTheDocument();
            expect(screen.getByText('Checking API Mesh API...')).toBeInTheDocument();
        });

        it('should check mesh API on mount', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            expect(mockRequest).toHaveBeenCalledWith('check-api-mesh', {
                workspaceId: 'workspace-123',
                selectedComponents: []
            });
        });

        it('should display success when mesh exists and deployed', async () => {
            mockRequest.mockResolvedValue({
                success: true,
                apiEnabled: true,
                meshExists: true,
                meshId: 'mesh-123',
                meshStatus: 'deployed',
                endpoint: 'https://mesh.adobe.io/endpoint'
            });

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('API Mesh Deployed')).toBeInTheDocument();
            });

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should update state when mesh check succeeds', async () => {
            mockRequest.mockResolvedValue({
                success: true,
                apiEnabled: true,
                meshExists: true,
                meshId: 'mesh-123',
                meshStatus: 'deployed',
                endpoint: 'https://mesh.adobe.io/endpoint'
            });

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith({
                    apiMesh: expect.objectContaining({
                        isChecking: false,
                        apiEnabled: true,
                        meshExists: true,
                        meshId: 'mesh-123',
                        meshStatus: 'deployed',
                        endpoint: 'https://mesh.adobe.io/endpoint'
                    })
                });
            });
        });
    });

    describe('Mesh Creation Flow', () => {
        it('should display create mesh prompt when API enabled but no mesh', async () => {
            mockRequest.mockResolvedValue({
                success: true,
                apiEnabled: true,
                meshExists: false
            });

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('Ready for Mesh Creation')).toBeInTheDocument();
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should trigger mesh creation when Create Mesh clicked', async () => {
            mockRequest
                .mockResolvedValueOnce({
                    success: true,
                    apiEnabled: true,
                    meshExists: false
                })
                .mockResolvedValueOnce({
                    success: true,
                    meshId: 'new-mesh-123',
                    endpoint: 'https://mesh.adobe.io/new'
                });

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const createButton = screen.getByText('Create Mesh');
            fireEvent.click(createButton);

            await waitFor(() => {
                expect(mockRequest).toHaveBeenCalledWith('create-api-mesh', {
                    workspaceId: 'workspace-123'
                });
            });
        });

        it('should show loading during mesh creation', async () => {
            mockRequest
                .mockResolvedValueOnce({
                    success: true,
                    apiEnabled: true,
                    meshExists: false
                })
                .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({
                    success: true,
                    meshId: 'new-mesh-123'
                }), 100)));

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const createButton = screen.getByText('Create Mesh');
            fireEvent.click(createButton);

            await waitFor(() => {
                expect(screen.getByText('Creating API Mesh...')).toBeInTheDocument();
            });
        });

        it('should enable continue after successful mesh creation', async () => {
            mockRequest
                .mockResolvedValueOnce({
                    success: true,
                    apiEnabled: true,
                    meshExists: false
                })
                .mockResolvedValueOnce({
                    success: true,
                    meshId: 'new-mesh-123',
                    endpoint: 'https://mesh.adobe.io/new'
                });

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const createButton = screen.getByText('Create Mesh');
            fireEvent.click(createButton);

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });
    });

    describe('Error Handling', () => {
        it('should display error when API not enabled', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                apiEnabled: false,
                error: 'API Mesh API is not enabled for this workspace.'
            });

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('API Mesh API Not Enabled')).toBeInTheDocument();
                expect(screen.getByText('API Mesh API is not enabled for this workspace.')).toBeInTheDocument();
            });

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should show retry button on error', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                apiEnabled: false,
                error: 'Connection failed'
            });

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('Retry')).toBeInTheDocument();
            });
        });

        it('should trigger recheck when retry clicked', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                apiEnabled: false,
                error: 'Connection failed'
            });

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('Retry')).toBeInTheDocument();
            });

            const retryButton = screen.getByText('Retry');
            fireEvent.click(retryButton);

            // Initial check + retry = 2 calls
            expect(mockRequest).toHaveBeenCalledTimes(2);
        });

        it('should handle mesh creation failure', async () => {
            mockRequest
                .mockResolvedValueOnce({
                    success: true,
                    apiEnabled: true,
                    meshExists: false
                })
                .mockResolvedValueOnce({
                    success: false,
                    error: 'Failed to create mesh'
                });

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const createButton = screen.getByText('Create Mesh');
            fireEvent.click(createButton);

            await waitFor(() => {
                expect(screen.getByText('Failed to create mesh')).toBeInTheDocument();
            });

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    describe('Mesh Error State', () => {
        it('should display error mesh status', async () => {
            mockRequest.mockResolvedValue({
                success: true,
                apiEnabled: true,
                meshExists: true,
                meshId: 'mesh-123',
                meshStatus: 'error'
            });

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('Mesh in Error State')).toBeInTheDocument();
            });

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should show recreate button for error mesh', async () => {
            mockRequest.mockResolvedValue({
                success: true,
                apiEnabled: true,
                meshExists: true,
                meshId: 'mesh-123',
                meshStatus: 'error'
            });

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('Recreate Mesh')).toBeInTheDocument();
            });
        });
    });

    describe('Configuration Summary', () => {
        it('should render configuration summary', () => {
            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            expect(screen.getByTestId('config-summary')).toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        it('should handle timeout during mesh creation', async () => {
            mockRequest
                .mockResolvedValueOnce({
                    success: true,
                    apiEnabled: true,
                    meshExists: false
                })
                .mockResolvedValueOnce({
                    success: true,
                    message: 'Mesh creation submitted, but verification timed out'
                });

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const createButton = screen.getByText('Create Mesh');
            fireEvent.click(createButton);

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });

        it('should allow back navigation on error', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                apiEnabled: false,
                error: 'Connection failed'
            });

            render(
                <Provider theme={defaultTheme}>
                    <ApiMeshStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                        onBack={mockOnBack}
                    />
                </Provider>
            );

            await waitFor(() => {
                expect(screen.getByText('Back')).toBeInTheDocument();
            });

            const backButton = screen.getByText('Back');
            fireEvent.click(backButton);

            expect(mockOnBack).toHaveBeenCalled();
        });
    });
});
