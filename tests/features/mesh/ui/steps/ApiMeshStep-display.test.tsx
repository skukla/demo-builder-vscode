import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import {
    mockRequest,
    createBaseState,
    createMeshCheckResponse,
    renderApiMeshStep,
    setupMocks,
    cleanupTests,
} from './ApiMeshStep.testUtils';

describe('ApiMeshStep - Display & Layout', () => {
    beforeEach(() => {
        setupMocks();
    });

    afterEach(() => {
        cleanupTests();
    });

    describe('Initial Rendering', () => {
        it('should render checking state initially', () => {
            const state = createBaseState();
            renderApiMeshStep(state);

            expect(screen.getByTestId('loading-display')).toBeInTheDocument();
            expect(screen.getByText('Checking API Mesh API...')).toBeInTheDocument();
        });

        it('should render two-column layout', () => {
            const state = createBaseState();
            renderApiMeshStep(state);

            expect(screen.getByTestId('left-content')).toBeInTheDocument();
            expect(screen.getByTestId('right-content')).toBeInTheDocument();
        });

        it('should render configuration summary', () => {
            const state = createBaseState();
            renderApiMeshStep(state);

            expect(screen.getByTestId('config-summary')).toBeInTheDocument();
        });
    });

    describe('Loading States', () => {
        it('should display loading during initial check', () => {
            const state = createBaseState();
            renderApiMeshStep(state);

            expect(screen.getByTestId('loading-display')).toBeInTheDocument();
            expect(screen.getByText('Checking API Mesh API...')).toBeInTheDocument();
        });

        it('should display loading during mesh creation', async () => {
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
                                    resolve({
                                        success: true,
                                        meshId: 'new-mesh-123',
                                    }),
                                100
                            )
                        )
                );

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });

            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const createButton = screen.getByText('Create Mesh');
            await user.click(createButton);

            await waitFor(() => {
                expect(screen.getByText('Creating API Mesh...')).toBeInTheDocument();
            });
        });
    });

    describe('Success States', () => {
        it('should display success when mesh exists and deployed', async () => {
            mockRequest.mockResolvedValue(
                createMeshCheckResponse({
                    meshStatus: 'deployed',
                })
            );

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('API Mesh Deployed')).toBeInTheDocument();
            });
        });

        it('should display ready for mesh creation when no mesh exists', async () => {
            mockRequest.mockResolvedValue(
                createMeshCheckResponse({
                    meshExists: false,
                })
            );

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('Ready for Mesh Creation')).toBeInTheDocument();
                expect(screen.getByText('Create Mesh')).toBeInTheDocument();
            });
        });
    });

    describe('Error States', () => {
        it('should display error when API not enabled', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                apiEnabled: false,
                error: 'API Mesh API is not enabled for this workspace.',
            });

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('API Mesh API Not Enabled')).toBeInTheDocument();
                expect(
                    screen.getByText('API Mesh API is not enabled for this workspace.')
                ).toBeInTheDocument();
            });
        });

        it('should show retry button on error', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                apiEnabled: false,
                error: 'Connection failed',
            });

            const state = createBaseState();
            renderApiMeshStep(state);

            await waitFor(() => {
                expect(screen.getByText('Retry')).toBeInTheDocument();
            });
        });

        it('should display error mesh status', async () => {
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

    describe('Navigation Controls', () => {
        it('should allow back navigation on error', async () => {
            mockRequest.mockResolvedValue({
                success: false,
                apiEnabled: false,
                error: 'Connection failed',
            });

            const mockOnBack = jest.fn();
            const state = createBaseState();
            renderApiMeshStep(state, jest.fn(), jest.fn(), mockOnBack);

            await waitFor(() => {
                expect(screen.getByText('Back')).toBeInTheDocument();
            });

            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const backButton = screen.getByText('Back');
            await user.click(backButton);

            expect(mockOnBack).toHaveBeenCalled();
        });
    });
});
