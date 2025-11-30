import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import {
    mockRequest,
    createBaseState,
    createMeshCheckResponse,
    createErrorResponse,
    renderApiMeshStep,
    setupMocks,
    cleanupTests,
} from './ApiMeshStep.testUtils';

describe('ApiMeshStep - Error Handling & Edge Cases', () => {
    beforeEach(() => {
        setupMocks();
    });

    afterEach(() => {
        cleanupTests();
    });

    describe('API Not Enabled Errors', () => {
        it('should display error when API not enabled', async () => {
            mockRequest.mockResolvedValue(
                createErrorResponse('API Mesh API is not enabled for this workspace.')
            );

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('API Mesh API Not Enabled')).toBeInTheDocument();
                expect(
                    screen.getByText('API Mesh API is not enabled for this workspace.')
                ).toBeInTheDocument();
            });
        });

        it('should disable proceed when API not enabled', async () => {
            mockRequest.mockResolvedValue(createErrorResponse('API not enabled'));

            const mockSetCanProceed = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, jest.fn(), mockSetCanProceed);

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(false);
            });
        });

        it('should update state with error information', async () => {
            mockRequest.mockResolvedValue(createErrorResponse('API not enabled'));

            const mockUpdateState = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, mockUpdateState);

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith({
                    apiMesh: expect.objectContaining({
                        apiEnabled: false,
                        error: 'API not enabled',
                    }),
                });
            });
        });
    });

    describe('Connection Errors', () => {
        it('should show retry button on connection error', async () => {
            mockRequest.mockResolvedValue(createErrorResponse('Connection failed'));

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('Retry')).toBeInTheDocument();
            });
        });

        it('should trigger recheck when retry clicked', async () => {
            const user = userEvent.setup();
            mockRequest.mockResolvedValue(createErrorResponse('Connection failed'));

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('Retry')).toBeInTheDocument();
            });

            const retryButton = screen.getByText('Retry');
            await user.click(retryButton);

            // Initial check + retry = 2 calls
            expect(mockRequest).toHaveBeenCalledTimes(2);
        });

        it('should clear previous error on retry', async () => {
            const user = userEvent.setup();
            mockRequest
                .mockResolvedValueOnce(createErrorResponse('Connection failed'))
                .mockResolvedValueOnce(createMeshCheckResponse());

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('Retry')).toBeInTheDocument();
            });

            const retryButton = screen.getByText('Retry');
            await user.click(retryButton);

            await waitFor(() => {
                expect(screen.getByText('API Mesh Deployed')).toBeInTheDocument();
            });
        });
    });

    describe('Mesh Creation Errors', () => {
        it('should handle mesh creation failure', async () => {
            const user = userEvent.setup();
            mockRequest
                .mockResolvedValueOnce(
                    createMeshCheckResponse({
                        meshExists: false,
                    })
                )
                .mockResolvedValueOnce({
                    success: false,
                    error: 'Failed to create mesh',
                });

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const createButton = screen.getByText('Create Mesh');
            await user.click(createButton);

            await waitFor(() => {
                expect(screen.getByText('Failed to create mesh')).toBeInTheDocument();
            });
        });

        it('should disable proceed after mesh creation failure', async () => {
            const user = userEvent.setup();
            mockRequest
                .mockResolvedValueOnce(
                    createMeshCheckResponse({
                        meshExists: false,
                    })
                )
                .mockResolvedValueOnce({
                    success: false,
                    error: 'Failed to create mesh',
                });

            const mockSetCanProceed = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, jest.fn(), mockSetCanProceed);

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const createButton = screen.getByText('Create Mesh');
            await user.click(createButton);

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(false);
            });
        });

        it('should update state with creation error', async () => {
            const user = userEvent.setup();
            mockRequest
                .mockResolvedValueOnce(
                    createMeshCheckResponse({
                        meshExists: false,
                    })
                )
                .mockResolvedValueOnce({
                    success: false,
                    error: 'Failed to create mesh',
                });

            const mockUpdateState = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, mockUpdateState);

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const createButton = screen.getByText('Create Mesh');
            await user.click(createButton);

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        apiMesh: expect.objectContaining({
                            error: 'Failed to create mesh',
                        }),
                    })
                );
            });
        });
    });

    describe('Mesh Error State', () => {
        it('should handle mesh in error state', async () => {
            mockRequest.mockResolvedValue(
                createMeshCheckResponse({
                    meshStatus: 'error',
                })
            );

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('Mesh in Error State')).toBeInTheDocument();
            });
        });

        it('should allow proceeding with mesh in error state', async () => {
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

        it('should show recreate button for error mesh', async () => {
            mockRequest.mockResolvedValue(
                createMeshCheckResponse({
                    meshStatus: 'error',
                })
            );

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('Recreate Mesh')).toBeInTheDocument();
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle missing workspace ID gracefully', async () => {
            const state = createBaseState({
                adobeWorkspace: undefined,
            } as any);

            renderApiMeshStep(state);

            // Should still render without crashing
            expect(screen.getByTestId('loading-display')).toBeInTheDocument();
        });

        it('should handle undefined response', async () => {
            mockRequest.mockResolvedValue(undefined);

            const state = createBaseState();
            renderApiMeshStep(state);

            // Should handle gracefully without crashing
            await waitFor(() => {
                expect(screen.getByTestId('loading-display')).toBeInTheDocument();
            });
        });

        it('should handle network timeout', async () => {
            mockRequest.mockRejectedValue(new Error('Network timeout'));

            const state = createBaseState();
            renderApiMeshStep(state);

            // Should render and not crash
            expect(screen.getByTestId('loading-display')).toBeInTheDocument();
        });

        it('should allow back navigation on any error', async () => {
            const user = userEvent.setup();
            mockRequest.mockResolvedValue(createErrorResponse('Generic error'));

            const mockOnBack = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, jest.fn(), jest.fn(), mockOnBack);

            await waitFor(() => {
                expect(screen.getByText('Back')).toBeInTheDocument();
            });

            const backButton = screen.getByText('Back');
            await user.click(backButton);

            expect(mockOnBack).toHaveBeenCalled();
        });
    });

    describe('Validation Errors', () => {
        it('should handle malformed mesh status', async () => {
            mockRequest.mockResolvedValue(
                createMeshCheckResponse({
                    meshStatus: 'unknown-status' as any,
                })
            );

            const state = createBaseState();
            renderApiMeshStep(state);

            // Should render without crashing
            await waitFor(() => {
                expect(screen.getByTestId('loading-display')).toBeInTheDocument();
            });
        });

        it('should handle missing mesh ID for existing mesh', async () => {
            mockRequest.mockResolvedValue({
                success: true,
                apiEnabled: true,
                meshExists: true,
                meshStatus: 'deployed',
                // meshId is missing
            });

            const mockUpdateState = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, mockUpdateState);

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        apiMesh: expect.objectContaining({
                            meshExists: true,
                        }),
                    })
                );
            });
        });
    });
});
