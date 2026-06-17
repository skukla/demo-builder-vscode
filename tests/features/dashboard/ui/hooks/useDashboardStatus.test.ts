/**
 * useDashboardStatus Hook Tests — Core
 *
 * Covers the hook's core state-management behavior: initial state,
 * status/mesh-status message handling, cleanup, StrictMode-safety, and
 * derived values. Display-string computations are tested in
 * `useDashboardStatus-statusDisplay.test.ts`; AI badge state is tested in
 * `useDashboardStatus-aiReady.test.ts`.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(),
        request: jest.fn(),
    },
}));

import { useDashboardStatus } from '@/features/dashboard/ui/hooks/useDashboardStatus';
import { setupMocks, type TestMocks } from './useDashboardStatus.testUtils';

describe('useDashboardStatus', () => {
    let mocks: TestMocks;

    beforeEach(() => {
        mocks = setupMocks();
    });

    describe('Initial State', () => {
        it('should return initial state values', () => {
            const { result } = renderHook(() => useDashboardStatus());

            expect(result.current.projectStatus).toBeNull();
            expect(result.current.isRunning).toBe(false);
            expect(result.current.isTransitioning).toBe(false);
        });

        it('should request status on mount', () => {
            renderHook(() => useDashboardStatus());

            expect(mocks.mockPostMessage).toHaveBeenCalledWith('requestStatus');
        });

        it('should subscribe to status and mesh updates', () => {
            renderHook(() => useDashboardStatus());

            expect(mocks.mockOnMessage).toHaveBeenCalledWith('statusUpdate', expect.any(Function));
            expect(mocks.mockOnMessage).toHaveBeenCalledWith('meshStatusUpdate', expect.any(Function));
        });
    });

    describe('Status Updates', () => {
        it('should update projectStatus on statusUpdate message', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                });
            });

            expect(result.current.projectStatus).toEqual({
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
            });
        });

        it('should set isRunning true when status is running', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'running',
                });
            });

            expect(result.current.isRunning).toBe(true);
        });

        it('should set isRunning false when status is not running', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'stopped',
                });
            });

            expect(result.current.isRunning).toBe(false);
        });

        it('should expose orgMismatch from the status payload', () => {
            const { result } = renderHook(() => useDashboardStatus());

            expect(result.current.orgMismatch).toBeUndefined();

            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'running',
                    orgMismatch: { expectedOrg: 'org-A', currentOrg: 'Org B' },
                });
            });

            expect(result.current.orgMismatch).toEqual({ expectedOrg: 'org-A', currentOrg: 'Org B' });
        });

        it('should clear transitioning state on definitive status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            // Set transitioning
            act(() => {
                result.current.setIsTransitioning(true);
            });

            expect(result.current.isTransitioning).toBe(true);

            // Receive definitive status
            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'running',
                });
            });

            expect(result.current.isTransitioning).toBe(false);
        });
    });

    describe('Mesh Status Updates', () => {
        it('should update mesh status on meshStatusUpdate message', () => {
            const { result } = renderHook(() => useDashboardStatus());

            // First set project status
            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                });
            });

            // Then update mesh status
            act(() => {
                mocks.state.meshStatusHandler?.({
                    status: 'deployed',
                    endpoint: 'https://example.com/mesh',
                });
            });

            expect(result.current.meshStatus).toBe('deployed');
        });

        it('should preserve mesh status during deployment when checking', () => {
            const { result } = renderHook(() => useDashboardStatus());

            // Set initial status with deploying mesh
            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'deploying', message: 'Deploying...' },
                });
            });

            expect(result.current.meshStatus).toBe('deploying');

            // Simulate update check trying to set checking status
            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'checking' },
                });
            });

            // Should preserve deploying status
            expect(result.current.meshStatus).toBe('deploying');
        });

        it('should clear transitioning when mesh operation completes', () => {
            const { result } = renderHook(() => useDashboardStatus());

            // Set transitioning
            act(() => {
                result.current.setIsTransitioning(true);
            });

            // Mesh deployment completes
            act(() => {
                mocks.state.meshStatusHandler?.({
                    status: 'deployed',
                });
            });

            expect(result.current.isTransitioning).toBe(false);
        });
    });

    describe('Derived Values', () => {
        it('should return displayName from projectStatus', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                mocks.state.statusHandler?.({
                    name: 'My Demo Project',
                    path: '/test/path',
                    status: 'ready',
                });
            });

            expect(result.current.displayName).toBe('My Demo Project');
        });

        it('should return default displayName when no projectStatus', () => {
            const { result } = renderHook(() => useDashboardStatus());

            expect(result.current.displayName).toBe('');
        });

        it('should return status from projectStatus', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'running',
                    port: 3000,
                });
            });

            expect(result.current.status).toBe('running');
        });

        it('should return undefined status when no projectStatus', () => {
            const { result } = renderHook(() => useDashboardStatus());

            expect(result.current.status).toBeUndefined();
        });
    });

    describe('Cleanup', () => {
        it('should unsubscribe on unmount', () => {
            const { unmount } = renderHook(() => useDashboardStatus());

            unmount();

            expect(mocks.mockUnsubscribeStatus).toHaveBeenCalled();
            expect(mocks.mockUnsubscribeMesh).toHaveBeenCalled();
        });
    });

    describe('StrictMode Compatibility', () => {
        it('should only request status once in StrictMode', () => {
            const { rerender } = renderHook(() => useDashboardStatus());

            // Simulate StrictMode double-mount
            rerender();

            // Should only be called once
            expect(mocks.mockPostMessage).toHaveBeenCalledTimes(1);
            expect(mocks.mockPostMessage).toHaveBeenCalledWith('requestStatus');
        });
    });
});
