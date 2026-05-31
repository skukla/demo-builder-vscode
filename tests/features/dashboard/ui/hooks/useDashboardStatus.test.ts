/**
 * useDashboardStatus Hook Tests
 *
 * Tests for the extracted dashboard status hook.
 * Verifies state management, subscriptions, and computed status displays.
 *
 * Covers: Initial State, Status Updates, Mesh Status Updates,
 * Demo Status Display, Cleanup, and StrictMode Compatibility.
 * Display-derivation and AI Ready Badge tests live in
 * `useDashboardStatus-display.test.ts`.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

// Mock the WebviewClient - must be before import (jest.mock is hoisted per-module).
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(),
        request: jest.fn(),
    },
}));

import { useDashboardStatus } from '@/features/dashboard/ui/hooks/useDashboardStatus';
import {
    createDashboardStatusHarness,
    setupDashboardStatusMocks,
} from './useDashboardStatus.testUtils';

describe('useDashboardStatus', () => {
    const harness = createDashboardStatusHarness();
    const statusHandler = () => harness.getStatusHandler();
    const meshStatusHandler = () => harness.getMeshStatusHandler();
    const { mockUnsubscribeStatus, mockUnsubscribeMesh, mockPostMessage, mockOnMessage } = harness;

    beforeEach(() => {
        setupDashboardStatusMocks(harness);
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

            expect(mockPostMessage).toHaveBeenCalledWith('requestStatus');
        });

        it('should subscribe to status and mesh updates', () => {
            renderHook(() => useDashboardStatus());

            expect(mockOnMessage).toHaveBeenCalledWith('statusUpdate', expect.any(Function));
            expect(mockOnMessage).toHaveBeenCalledWith('meshStatusUpdate', expect.any(Function));
        });
    });

    describe('Status Updates', () => {
        it('should update projectStatus on statusUpdate message', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler()?.({
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
                statusHandler()?.({
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
                statusHandler()?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'stopped',
                });
            });

            expect(result.current.isRunning).toBe(false);
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
                statusHandler()?.({
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
                statusHandler()?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                });
            });

            // Then update mesh status
            act(() => {
                meshStatusHandler()?.({
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
                statusHandler()?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'deploying', message: 'Deploying...' },
                });
            });

            expect(result.current.meshStatus).toBe('deploying');

            // Simulate update check trying to set checking status
            act(() => {
                statusHandler()?.({
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
                meshStatusHandler()?.({
                    status: 'deployed',
                });
            });

            expect(result.current.isTransitioning).toBe(false);
        });
    });

    describe('Demo Status Display', () => {
        it('should return Stopped for ready status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler()?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Stopped');
            expect(result.current.demoStatusDisplay.color).toBe('gray');
        });

        it('should return Starting... for starting status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler()?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'starting',
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Starting...');
            expect(result.current.demoStatusDisplay.color).toBe('blue');
        });

        it('should return Running on port X for running status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler()?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'running',
                    port: 3000,
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Running on port 3000');
            expect(result.current.demoStatusDisplay.color).toBe('green');
        });

        it('should return Restart needed when running with config changes', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler()?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'running',
                    port: 3000,
                    frontendConfigChanged: true,
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Restart needed');
            expect(result.current.demoStatusDisplay.color).toBe('yellow');
        });

        it('should return Stopping... for stopping status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler()?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'stopping',
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Stopping...');
            expect(result.current.demoStatusDisplay.color).toBe('yellow');
        });

        it('should return Error for error status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler()?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'error',
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Error');
            expect(result.current.demoStatusDisplay.color).toBe('red');
        });

        it('should return Configuring... for configuring status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler()?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'configuring',
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Configuring...');
            expect(result.current.demoStatusDisplay.color).toBe('blue');
        });
    });

    describe('Cleanup', () => {
        it('should unsubscribe on unmount', () => {
            const { unmount } = renderHook(() => useDashboardStatus());

            unmount();

            expect(mockUnsubscribeStatus).toHaveBeenCalled();
            expect(mockUnsubscribeMesh).toHaveBeenCalled();
        });
    });

    describe('StrictMode Compatibility', () => {
        it('should only request status once in StrictMode', () => {
            const { rerender } = renderHook(() => useDashboardStatus());

            // Simulate StrictMode double-mount
            rerender();

            // Should only be called once
            expect(mockPostMessage).toHaveBeenCalledTimes(1);
            expect(mockPostMessage).toHaveBeenCalledWith('requestStatus');
        });
    });
});
