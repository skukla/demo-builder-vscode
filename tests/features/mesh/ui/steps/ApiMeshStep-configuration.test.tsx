import { waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    mockRequest,
    createBaseState,
    createMeshCheckResponse,
    renderApiMeshStep,
    setupMocks,
} from './ApiMeshStep.testUtils';

describe('ApiMeshStep - Configuration & Status Checking', () => {
    beforeEach(() => {
        setupMocks();
    });

    describe('Initial Check', () => {
        it('should check mesh API on mount', () => {
            const state = createBaseState();
            renderApiMeshStep(state);

            expect(mockRequest).toHaveBeenCalledWith('check-api-mesh', {
                workspaceId: 'workspace-123',
                selectedComponents: [],
            });
        });
    });

    describe('State Updates', () => {
        it('should update state when mesh check succeeds', async () => {
            mockRequest.mockResolvedValue(
                createMeshCheckResponse({
                    meshId: 'mesh-123',
                    meshStatus: 'deployed',
                    endpoint: 'https://mesh.adobe.io/endpoint',
                })
            );

            const mockUpdateState = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, mockUpdateState);

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith({
                    apiMesh: expect.objectContaining({
                        isChecking: false,
                        apiEnabled: true,
                        meshExists: true,
                        meshId: 'mesh-123',
                        meshStatus: 'deployed',
                        endpoint: 'https://mesh.adobe.io/endpoint',
                    }),
                });
            });
        });

        it('should update state with API disabled status', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                apiEnabled: false,
                error: 'API not enabled',
            });

            const mockUpdateState = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, mockUpdateState);

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith({
                    apiMesh: expect.objectContaining({
                        isChecking: false,
                        apiEnabled: false,
                        meshExists: false,
                        error: 'API not enabled',
                    }),
                });
            });
        });

        it('should update state when no mesh exists', async () => {
            mockRequest.mockResolvedValue(
                createMeshCheckResponse({
                    meshExists: false,
                    meshId: undefined,
                    meshStatus: undefined,
                    endpoint: undefined,
                })
            );

            const mockUpdateState = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, mockUpdateState);

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith({
                    apiMesh: expect.objectContaining({
                        isChecking: false,
                        apiEnabled: true,
                        meshExists: false,
                    }),
                });
            });
        });
    });

    describe('Proceed Control', () => {
        it('should enable proceed when mesh deployed', async () => {
            mockRequest.mockResolvedValue(
                createMeshCheckResponse({
                    meshStatus: 'deployed',
                })
            );

            const mockSetCanProceed = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, jest.fn(), mockSetCanProceed);

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });

        it('should disable proceed when API not enabled', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                apiEnabled: false,
                error: 'API not enabled',
            });

            const mockSetCanProceed = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, jest.fn(), mockSetCanProceed);

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(false);
            });
        });

        it('should disable proceed when no mesh exists', async () => {
            mockRequest.mockResolvedValue(
                createMeshCheckResponse({
                    meshExists: false,
                })
            );

            const mockSetCanProceed = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, jest.fn(), mockSetCanProceed);

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(false);
            });
        });

        it('should enable proceed for mesh in error state', async () => {
            mockRequest.mockResolvedValue(
                createMeshCheckResponse({
                    meshStatus: 'error',
                })
            );

            const mockSetCanProceed = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, jest.fn(), mockSetCanProceed);

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });
    });

    describe('Retry Functionality', () => {
        it('should trigger recheck when retry clicked', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                apiEnabled: false,
                error: 'Connection failed',
            });

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                const retryButton = document.querySelector('button');
                expect(retryButton).toHaveTextContent('Retry');
            });

            const retryButton = document.querySelector('button') as HTMLButtonElement;
            fireEvent.click(retryButton);

            // Initial check + retry = 2 calls
            expect(mockRequest).toHaveBeenCalledTimes(2);
        });
    });
});
