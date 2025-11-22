import { renderHook, act, waitFor } from '@testing-library/react';
import { useMeshOperations } from '@/features/mesh/ui/steps/hooks/useMeshOperations';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

// Mock webviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        request: jest.fn(),
        postMessage: jest.fn(),
    },
}));

describe('useMeshOperations', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    const workspace = {
        id: 'workspace-123',
        name: 'Test Workspace',
        title: 'Test Workspace',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('checkMesh operation', () => {
        it('sets isChecking state during check', async () => {
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                apiEnabled: true,
                meshExists: false,
                meshStatus: 'pending',
            });

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            expect(result.current.isChecking).toBe(false);

            act(() => {
                result.current.checkMesh();
            });

            expect(result.current.isChecking).toBe(true);

            await waitFor(() => {
                expect(result.current.isChecking).toBe(false);
            });
        });

        it('calls webviewClient.request with correct parameters', async () => {
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                apiEnabled: true,
                meshExists: false,
                meshStatus: 'pending',
            });

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                await result.current.checkMesh();
            });

            expect(webviewClient.request).toHaveBeenCalledWith('check-api-mesh', {
                workspaceId: 'workspace-123',
                selectedComponents: [],
            });
        });

        it('updates state when API is enabled and mesh exists', async () => {
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                apiEnabled: true,
                meshExists: true,
                meshId: 'mesh-123',
                meshStatus: 'deployed',
                endpoint: 'https://mesh.adobe.io/endpoint',
            });

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                await result.current.checkMesh();
            });

            expect(mockUpdateState).toHaveBeenCalledWith({
                apiMesh: {
                    isChecking: false,
                    apiEnabled: true,
                    meshExists: true,
                    meshId: 'mesh-123',
                    meshStatus: 'deployed',
                    endpoint: 'https://mesh.adobe.io/endpoint',
                },
            });

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('updates state when API is enabled but no mesh exists', async () => {
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                apiEnabled: true,
                meshExists: false,
                meshStatus: 'pending',
            });

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                await result.current.checkMesh();
            });

            expect(mockUpdateState).toHaveBeenCalledWith({
                apiMesh: {
                    isChecking: false,
                    apiEnabled: true,
                    meshExists: false,
                    meshStatus: 'pending',
                },
            });

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('sets error when API is not enabled', async () => {
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: false,
                error: 'API Mesh API is not enabled for this workspace.',
                setupInstructions: [
                    { step: 'Enable API Mesh', details: 'Go to console' },
                ],
            });

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                await result.current.checkMesh();
            });

            expect(result.current.error).toBe('API Mesh API is not enabled for this workspace.');
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('handles network errors gracefully', async () => {
            (webviewClient.request as jest.Mock).mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                await result.current.checkMesh();
            });

            expect(result.current.error).toBe('Network error');
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    describe('createMesh operation', () => {
        it('sets isChecking state during creation', async () => {
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                meshId: 'mesh-new',
                endpoint: 'https://mesh.adobe.io/new',
                meshStatus: 'deployed',
            });

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            expect(result.current.isChecking).toBe(false);

            act(() => {
                result.current.createMesh();
            });

            expect(result.current.isChecking).toBe(true);

            await waitFor(() => {
                expect(result.current.isChecking).toBe(false);
            });
        });

        it('calls webviewClient.request with correct parameters', async () => {
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                meshId: 'mesh-new',
                endpoint: 'https://mesh.adobe.io/new',
                meshStatus: 'deployed',
            });

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                await result.current.createMesh();
            });

            expect(webviewClient.request).toHaveBeenCalledWith('create-api-mesh', {
                workspaceId: 'workspace-123',
            });
        });

        it('updates state when mesh is created successfully', async () => {
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                meshId: 'mesh-new',
                endpoint: 'https://mesh.adobe.io/new',
                meshStatus: 'deployed',
            });

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                await result.current.createMesh();
            });

            expect(mockUpdateState).toHaveBeenCalledWith({
                apiMesh: {
                    isChecking: false,
                    apiEnabled: true,
                    meshExists: true,
                    meshId: 'mesh-new',
                    meshStatus: 'deployed',
                    endpoint: 'https://mesh.adobe.io/new',
                    message: undefined,
                },
            });

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('handles timeout scenario (mesh submitted but not verified)', async () => {
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                meshId: undefined, // No ID yet
                endpoint: undefined,
                meshStatus: 'pending',
                message: 'Mesh submitted successfully but verification timed out',
            });

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                await result.current.createMesh();
            });

            expect(mockUpdateState).toHaveBeenCalledWith({
                apiMesh: {
                    isChecking: false,
                    apiEnabled: true,
                    meshExists: true,
                    meshId: undefined,
                    meshStatus: 'pending',
                    endpoint: undefined,
                    message: 'Mesh submitted successfully but verification timed out',
                },
            });

            // Should still allow proceeding even with timeout
            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('handles mesh creation error', async () => {
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: false,
                error: 'Failed to create mesh configuration',
            });

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                await result.current.createMesh();
            });

            expect(result.current.error).toBe('Failed to create mesh configuration');
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('handles mesh error state after creation', async () => {
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: false,
                meshExists: true,
                meshId: 'mesh-error',
                meshStatus: 'error',
                error: 'Mesh deployed but encountered errors',
            });

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                await result.current.createMesh();
            });

            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    apiMesh: expect.objectContaining({
                        meshStatus: 'error',
                        error: 'Mesh deployed but encountered errors',
                    }),
                })
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    describe('recreateMesh operation', () => {
        it('deletes existing mesh then creates new one', async () => {
            const deleteMock = jest.fn().mockResolvedValue({ success: true });
            const createMock = jest.fn().mockResolvedValue({
                success: true,
                meshId: 'mesh-recreated',
                endpoint: 'https://mesh.adobe.io/recreated',
                meshStatus: 'deployed',
            });

            (webviewClient.request as jest.Mock)
                .mockImplementationOnce(deleteMock)
                .mockImplementationOnce(createMock);

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                await result.current.recreateMesh();
            });

            expect(webviewClient.request).toHaveBeenCalledWith('delete-api-mesh', {
                workspaceId: 'workspace-123',
            });

            expect(webviewClient.request).toHaveBeenCalledWith('create-api-mesh', {
                workspaceId: 'workspace-123',
            });
        });

        it('updates progress messages during recreate', async () => {
            (webviewClient.request as jest.Mock)
                .mockResolvedValueOnce({ success: true })
                .mockResolvedValueOnce({
                    success: true,
                    meshId: 'mesh-recreated',
                    endpoint: 'https://mesh.adobe.io/recreated',
                    meshStatus: 'deployed',
                });

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                await result.current.recreateMesh();
            });

            // Should update messages during the process
            expect(result.current.message).toBeDefined();
        });

        it('handles deletion failure gracefully', async () => {
            (webviewClient.request as jest.Mock).mockRejectedValue(new Error('Failed to delete mesh'));

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                await result.current.recreateMesh();
            });

            expect(result.current.error).toBe('Failed to delete mesh');
            expect(result.current.isChecking).toBe(false);
        });
    });

    describe('Progress message updates', () => {
        it('updates message state during operations', async () => {
            (webviewClient.request as jest.Mock).mockImplementation(() =>
                new Promise(resolve =>
                    setTimeout(() =>
                        resolve({
                            success: true,
                            apiEnabled: true,
                            meshExists: false,
                        }),
                        100
                    )
                )
            );

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            await act(async () => {
                result.current.checkMesh();
            });

            // Message should be set during check
            expect(result.current.message).toBeDefined();
        });

        it('clears error when starting new operation', async () => {
            (webviewClient.request as jest.Mock)
                .mockRejectedValueOnce(new Error('First error'))
                .mockResolvedValueOnce({
                    success: true,
                    apiEnabled: true,
                    meshExists: false,
                });

            const { result } = renderHook(() =>
                useMeshOperations(workspace, mockUpdateState, mockSetCanProceed)
            );

            // First call with error
            await act(async () => {
                await result.current.checkMesh();
            });
            expect(result.current.error).toBe('First error');

            // Second call should clear error
            await act(async () => {
                await result.current.checkMesh();
            });
            expect(result.current.error).toBeUndefined();
        });
    });
});
