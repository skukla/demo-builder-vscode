/**
 * Tests for useMeshDeployment hook
 * Step 5: Create useMeshDeployment Hook
 *
 * Encapsulates mesh deployment logic and state management.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useMeshDeployment } from '@/features/mesh/ui/steps/useMeshDeployment';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

// Mock WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        request: jest.fn(),
        postMessage: jest.fn(),
    },
}));

// Mock TIMEOUTS
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        MESH_DEPLOY_TOTAL: 180000,
        MESH_VERIFY_POLL_INTERVAL: 10000,
        MESH_VERIFY_INITIAL_WAIT: 20000,
        PROGRESS_UPDATE_INTERVAL: 1000,
    },
}));

const mockWebviewClient = webviewClient as jest.Mocked<typeof webviewClient>;

describe('useMeshDeployment', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('initialization', () => {
        it('initializes with deploying state when hasMeshComponent is true', () => {
            const { result } = renderHook(() =>
                useMeshDeployment({ hasMeshComponent: true, workspaceId: 'ws-123' })
            );

            expect(result.current.state.status).toBe('deploying');
            expect(result.current.state.attempt).toBe(0);
        });

        it('initializes with success state when hasMeshComponent is false', () => {
            const { result } = renderHook(() =>
                useMeshDeployment({ hasMeshComponent: false, workspaceId: 'ws-123' })
            );

            // Should skip deployment if no mesh component
            expect(result.current.state.status).toBe('success');
        });
    });

    describe('deployment flow', () => {
        it('starts deployment on mount', async () => {
            mockWebviewClient.request.mockResolvedValueOnce({
                success: true,
                status: 'deploying',
            });

            const { result } = renderHook(() =>
                useMeshDeployment({ hasMeshComponent: true, workspaceId: 'ws-123' })
            );

            await waitFor(() => {
                expect(mockWebviewClient.request).toHaveBeenCalledWith(
                    'deploy-mesh-step',
                    expect.objectContaining({ workspaceId: 'ws-123' })
                );
            });
        });

        it('transitions to verifying after deployment command', async () => {
            mockWebviewClient.request.mockResolvedValueOnce({
                success: true,
                status: 'deployed',
            });

            const { result } = renderHook(() =>
                useMeshDeployment({ hasMeshComponent: true, workspaceId: 'ws-123' })
            );

            await waitFor(() => {
                expect(result.current.state.status).toBe('verifying');
            });
        });

        it('transitions to success on verification success', async () => {
            mockWebviewClient.request
                .mockResolvedValueOnce({ success: true, status: 'deployed' })
                .mockResolvedValueOnce({
                    success: true,
                    verified: true,
                    meshId: 'mesh-123',
                    endpoint: 'https://graph.adobe.io/...',
                });

            const { result } = renderHook(() =>
                useMeshDeployment({ hasMeshComponent: true, workspaceId: 'ws-123' })
            );

            // Wait for deployment to complete
            await waitFor(() => {
                expect(result.current.state.status).toBe('verifying');
            });

            // Advance past initial wait (20s) to trigger first verification
            await act(async () => {
                jest.advanceTimersByTime(20000);
            });

            await waitFor(() => {
                expect(result.current.state.status).toBe('success');
                expect(result.current.state.meshId).toBe('mesh-123');
            });
        });
    });

    describe('timeout handling', () => {
        it('transitions to timeout after MESH_DEPLOY_TOTAL', async () => {
            // Deployment succeeds but verification never completes
            mockWebviewClient.request
                .mockResolvedValueOnce({ success: true, status: 'deployed' })
                .mockResolvedValue({ success: true, verified: false });

            const { result } = renderHook(() =>
                useMeshDeployment({ hasMeshComponent: true, workspaceId: 'ws-123' })
            );

            // Wait for initial deployment
            await waitFor(() => {
                expect(result.current.state.status).toBe('verifying');
            });

            // Advance past timeout
            act(() => {
                jest.advanceTimersByTime(180000);
            });

            expect(result.current.state.status).toBe('timeout');
        });

        it('increments elapsed time during verification', async () => {
            mockWebviewClient.request
                .mockResolvedValueOnce({ success: true, status: 'deployed' })
                .mockResolvedValue({ success: true, verified: false });

            const { result } = renderHook(() =>
                useMeshDeployment({ hasMeshComponent: true, workspaceId: 'ws-123' })
            );

            await waitFor(() => {
                expect(result.current.state.status).toBe('verifying');
            });

            // Advance 30 seconds
            act(() => {
                jest.advanceTimersByTime(30000);
            });

            expect(result.current.state.elapsedSeconds).toBeGreaterThanOrEqual(30);
        });
    });

    describe('retry functionality', () => {
        it('retry resets state and restarts deployment', async () => {
            mockWebviewClient.request
                .mockResolvedValueOnce({ success: true, status: 'deployed' })
                .mockResolvedValue({ success: true, verified: false });

            const { result } = renderHook(() =>
                useMeshDeployment({ hasMeshComponent: true, workspaceId: 'ws-123' })
            );

            // Wait for timeout
            await waitFor(() => {
                expect(result.current.state.status).toBe('verifying');
            });

            act(() => {
                jest.advanceTimersByTime(180000);
            });

            expect(result.current.state.status).toBe('timeout');

            // Reset mock for retry
            mockWebviewClient.request.mockClear();
            mockWebviewClient.request.mockResolvedValueOnce({
                success: true,
                status: 'deployed',
            });

            // Retry
            act(() => {
                result.current.retry();
            });

            expect(result.current.state.status).toBe('deploying');
            expect(result.current.state.attempt).toBeGreaterThan(0);
        });
    });

    describe('error handling', () => {
        it('transitions to error on deployment failure', async () => {
            mockWebviewClient.request.mockRejectedValueOnce(new Error('Deployment failed'));

            const { result } = renderHook(() =>
                useMeshDeployment({ hasMeshComponent: true, workspaceId: 'ws-123' })
            );

            await waitFor(() => {
                expect(result.current.state.status).toBe('error');
                expect(result.current.state.errorMessage).toBe('Deployment failed');
            });
        });

        it('transitions to error on verification error', async () => {
            mockWebviewClient.request
                .mockResolvedValueOnce({ success: true, status: 'deployed' })
                .mockResolvedValueOnce({ success: false, error: 'Verification failed' });

            const { result } = renderHook(() =>
                useMeshDeployment({ hasMeshComponent: true, workspaceId: 'ws-123' })
            );

            // Wait for deployment to complete
            await waitFor(() => {
                expect(result.current.state.status).toBe('verifying');
            });

            // Advance past initial wait (20s) to trigger first verification
            await act(async () => {
                jest.advanceTimersByTime(20000);
            });

            await waitFor(() => {
                expect(result.current.state.status).toBe('error');
            });
        });
    });

    describe('cleanup', () => {
        it('cleans up timers on unmount', async () => {
            mockWebviewClient.request
                .mockResolvedValueOnce({ success: true, status: 'deployed' })
                .mockResolvedValue({ success: true, verified: false });

            const { result, unmount } = renderHook(() =>
                useMeshDeployment({ hasMeshComponent: true, workspaceId: 'ws-123' })
            );

            // Wait for deployment to start verification phase
            await waitFor(() => {
                expect(result.current.state.status).toBe('verifying');
            });

            // Should not throw when unmounting during active timers
            expect(() => unmount()).not.toThrow();
        });
    });
});
