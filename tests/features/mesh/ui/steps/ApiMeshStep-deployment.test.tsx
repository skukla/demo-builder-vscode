import { screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    mockRequest,
    createBaseState,
    createMeshCheckResponse,
    createMeshCreationResponse,
    renderApiMeshStep,
    setupMocks,
} from './ApiMeshStep.testUtils';

describe('ApiMeshStep - Deployment Operations', () => {
    beforeEach(() => {
        setupMocks();
    });

    describe('Mesh Creation Flow', () => {
        it('should trigger mesh creation when Create Mesh clicked', async () => {
            mockRequest
                .mockResolvedValueOnce(
                    createMeshCheckResponse({
                        meshExists: false,
                    })
                )
                .mockResolvedValueOnce(createMeshCreationResponse());

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const createButton = screen.getByText('Create Mesh');
            fireEvent.click(createButton);

            await waitFor(() => {
                expect(mockRequest).toHaveBeenCalledWith('create-api-mesh', {
                    workspaceId: 'workspace-123',
                });
            });
        });

        it('should show loading during mesh creation', async () => {
            mockRequest
                .mockResolvedValueOnce(
                    createMeshCheckResponse({
                        meshExists: false,
                    })
                )
                .mockImplementationOnce(
                    () =>
                        new Promise((resolve) =>
                            setTimeout(
                                () =>
                                    resolve(
                                        createMeshCreationResponse({
                                            meshId: 'new-mesh-123',
                                        })
                                    ),
                                100
                            )
                        )
                );

            const state = createBaseState();
            renderApiMeshStep(state);

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
                .mockResolvedValueOnce(
                    createMeshCheckResponse({
                        meshExists: false,
                    })
                )
                .mockResolvedValueOnce(createMeshCreationResponse());

            const mockSetCanProceed = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, jest.fn(), mockSetCanProceed);

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const createButton = screen.getByText('Create Mesh');
            fireEvent.click(createButton);

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });

        it('should update state after successful mesh creation', async () => {
            mockRequest
                .mockResolvedValueOnce(
                    createMeshCheckResponse({
                        meshExists: false,
                    })
                )
                .mockResolvedValueOnce(
                    createMeshCreationResponse({
                        meshId: 'new-mesh-123',
                        endpoint: 'https://mesh.adobe.io/new',
                    })
                );

            const mockUpdateState = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, mockUpdateState);

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const createButton = screen.getByText('Create Mesh');
            fireEvent.click(createButton);

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        apiMesh: expect.objectContaining({
                            meshId: 'new-mesh-123',
                            endpoint: 'https://mesh.adobe.io/new',
                        }),
                    })
                );
            });
        });
    });

    describe('Mesh Recreation', () => {
        it('should trigger mesh recreation for error mesh', async () => {
            mockRequest
                .mockResolvedValueOnce(
                    createMeshCheckResponse({
                        meshStatus: 'error',
                        meshId: 'error-mesh-123',
                    })
                )
                .mockResolvedValueOnce(createMeshCreationResponse());

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('Recreate Mesh')).toBeInTheDocument();
            });

            const recreateButton = screen.getByText('Recreate Mesh');
            fireEvent.click(recreateButton);

            await waitFor(() => {
                expect(mockRequest).toHaveBeenCalledWith('create-api-mesh', {
                    workspaceId: 'workspace-123',
                });
            });
        });
    });

    describe('Deployment Status Updates', () => {
        it('should reflect deployed status in state', async () => {
            mockRequest.mockResolvedValue(
                createMeshCheckResponse({
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
                        meshStatus: 'deployed',
                        endpoint: 'https://mesh.adobe.io/endpoint',
                    }),
                });
            });
        });

        it('should handle partial deployment response', async () => {
            mockRequest
                .mockResolvedValueOnce(
                    createMeshCheckResponse({
                        meshExists: false,
                    })
                )
                .mockResolvedValueOnce({
                    success: true,
                    meshId: 'partial-mesh-123',
                    // No endpoint provided
                });

            const mockUpdateState = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, mockUpdateState);

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const createButton = screen.getByText('Create Mesh');
            fireEvent.click(createButton);

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        apiMesh: expect.objectContaining({
                            meshId: 'partial-mesh-123',
                        }),
                    })
                );
            });
        });
    });

    describe('Timeout Handling', () => {
        it('should handle timeout during mesh creation', async () => {
            mockRequest
                .mockResolvedValueOnce(
                    createMeshCheckResponse({
                        meshExists: false,
                    })
                )
                .mockResolvedValueOnce({
                    success: true,
                    message: 'Mesh creation submitted, but verification timed out',
                });

            const mockSetCanProceed = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, jest.fn(), mockSetCanProceed);

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const createButton = screen.getByText('Create Mesh');
            fireEvent.click(createButton);

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });

        it('should allow proceeding after timeout', async () => {
            mockRequest
                .mockResolvedValueOnce(
                    createMeshCheckResponse({
                        meshExists: false,
                    })
                )
                .mockResolvedValueOnce({
                    success: true,
                    message: 'Mesh creation submitted, but verification timed out',
                });

            const mockSetCanProceed = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, jest.fn(), mockSetCanProceed);

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
});
