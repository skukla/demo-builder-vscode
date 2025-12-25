/**
 * useMeshStatus Hook Tests
 *
 * Tests for the mesh status subscription hook.
 * Verifies message subscription, status display formatting, and cleanup.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

// Mock the WebviewClient - must be before import
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(),
    },
}));

import { useMeshStatus } from '@/features/mesh/ui/hooks/useMeshStatus';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

describe('useMeshStatus', () => {
    let meshStatusHandler: ((data: unknown) => void) | null = null;
    const mockUnsubscribe = jest.fn();
    const mockOnMessage = webviewClient.onMessage as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        meshStatusHandler = null;

        // Setup message handler capture
        mockOnMessage.mockImplementation((type: string, handler: (data: unknown) => void) => {
            if (type === 'meshStatusUpdate') {
                meshStatusHandler = handler;
                return mockUnsubscribe;
            }
            return jest.fn();
        });
    });

    describe('Initial State', () => {
        it('should return undefined status initially', () => {
            const { result } = renderHook(() => useMeshStatus());

            expect(result.current.status).toBeUndefined();
        });

        it('should return null display initially', () => {
            const { result } = renderHook(() => useMeshStatus());

            expect(result.current.display).toBeNull();
        });

        it('should subscribe to meshStatusUpdate messages', () => {
            renderHook(() => useMeshStatus());

            expect(mockOnMessage).toHaveBeenCalledWith('meshStatusUpdate', expect.any(Function));
        });
    });

    describe('Status Updates', () => {
        it('should update status on meshStatusUpdate message with deployed', () => {
            const { result } = renderHook(() => useMeshStatus());

            act(() => {
                meshStatusHandler?.({
                    status: 'deployed',
                    endpoint: 'https://mesh.example.com',
                });
            });

            expect(result.current.status).toBe('deployed');
            expect(result.current.display).toEqual({
                color: 'green',
                text: 'Deployed',
            });
        });

        it('should update status for checking state', () => {
            const { result } = renderHook(() => useMeshStatus());

            act(() => {
                meshStatusHandler?.({
                    status: 'checking',
                });
            });

            expect(result.current.status).toBe('checking');
            expect(result.current.display).toEqual({
                color: 'blue',
                text: 'Checking status...',
            });
        });

        it('should update status for deploying state', () => {
            const { result } = renderHook(() => useMeshStatus());

            act(() => {
                meshStatusHandler?.({
                    status: 'deploying',
                    message: 'Uploading config...',
                });
            });

            expect(result.current.status).toBe('deploying');
            expect(result.current.display).toEqual({
                color: 'blue',
                text: 'Uploading config...',
            });
        });

        it('should update status for not-deployed state', () => {
            const { result } = renderHook(() => useMeshStatus());

            act(() => {
                meshStatusHandler?.({
                    status: 'not-deployed',
                });
            });

            expect(result.current.status).toBe('not-deployed');
            expect(result.current.display).toEqual({
                color: 'gray',
                text: 'Not deployed',
            });
        });

        it('should update status for needs-auth state', () => {
            const { result } = renderHook(() => useMeshStatus());

            act(() => {
                meshStatusHandler?.({
                    status: 'needs-auth',
                });
            });

            expect(result.current.status).toBe('needs-auth');
            expect(result.current.display).toEqual({
                color: 'yellow',
                text: 'Session expired',
            });
        });

        it('should update status for config-changed state', () => {
            const { result } = renderHook(() => useMeshStatus());

            act(() => {
                meshStatusHandler?.({
                    status: 'config-changed',
                });
            });

            expect(result.current.status).toBe('config-changed');
            expect(result.current.display).toEqual({
                color: 'yellow',
                text: 'Redeploy needed',
            });
        });

        it('should update status for error state', () => {
            const { result } = renderHook(() => useMeshStatus());

            act(() => {
                meshStatusHandler?.({
                    status: 'error',
                    message: 'Deployment failed',
                });
            });

            expect(result.current.status).toBe('error');
            expect(result.current.display).toEqual({
                color: 'red',
                text: 'Deployment error',
            });
        });

        it('should update status for authenticating state', () => {
            const { result } = renderHook(() => useMeshStatus());

            act(() => {
                meshStatusHandler?.({
                    status: 'authenticating',
                    message: 'Opening browser...',
                });
            });

            expect(result.current.status).toBe('authenticating');
            expect(result.current.display).toEqual({
                color: 'blue',
                text: 'Opening browser...',
            });
        });

        it('should update status for config-incomplete state', () => {
            const { result } = renderHook(() => useMeshStatus());

            act(() => {
                meshStatusHandler?.({
                    status: 'config-incomplete',
                });
            });

            expect(result.current.status).toBe('config-incomplete');
            expect(result.current.display).toEqual({
                color: 'orange',
                text: 'Missing configuration',
            });
        });
    });

    describe('Message Field', () => {
        it('should use custom message for deploying status', () => {
            const { result } = renderHook(() => useMeshStatus());

            act(() => {
                meshStatusHandler?.({
                    status: 'deploying',
                    message: 'Submitting to Adobe...',
                });
            });

            expect(result.current.display?.text).toBe('Submitting to Adobe...');
        });

        it('should use default message when custom message not provided', () => {
            const { result } = renderHook(() => useMeshStatus());

            act(() => {
                meshStatusHandler?.({
                    status: 'deploying',
                });
            });

            expect(result.current.display?.text).toBe('Deploying...');
        });
    });

    describe('Endpoint Field', () => {
        it('should include endpoint in return when available', () => {
            const { result } = renderHook(() => useMeshStatus());

            act(() => {
                meshStatusHandler?.({
                    status: 'deployed',
                    endpoint: 'https://mesh.example.com/graphql',
                });
            });

            expect(result.current.endpoint).toBe('https://mesh.example.com/graphql');
        });

        it('should return undefined endpoint when not provided', () => {
            const { result } = renderHook(() => useMeshStatus());

            act(() => {
                meshStatusHandler?.({
                    status: 'deployed',
                });
            });

            expect(result.current.endpoint).toBeUndefined();
        });
    });

    describe('Cleanup', () => {
        it('should unsubscribe on unmount', () => {
            const { unmount } = renderHook(() => useMeshStatus());

            unmount();

            expect(mockUnsubscribe).toHaveBeenCalled();
        });
    });
});
