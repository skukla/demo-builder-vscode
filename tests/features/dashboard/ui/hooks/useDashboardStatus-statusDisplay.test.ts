/**
 * useDashboardStatus Hook Tests — Status Display Strings
 *
 * Covers the `demoStatusDisplay` and `meshStatusDisplay` derived strings:
 * how each underlying status value (running / stopping / deploying / etc.)
 * maps to user-facing text + color.
 *
 * Core hook behavior is in `useDashboardStatus.test.ts`; AI badge state is
 * in `useDashboardStatus-aiReady.test.ts`.
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

describe('useDashboardStatus — Status Display Strings', () => {
    let mocks: TestMocks;

    beforeEach(() => {
        mocks = setupMocks();
    });

    describe('Demo Status Display', () => {
        it('should return Stopped for ready status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                mocks.state.statusHandler?.({
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
                mocks.state.statusHandler?.({
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
                mocks.state.statusHandler?.({
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
                mocks.state.statusHandler?.({
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
                mocks.state.statusHandler?.({
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
                mocks.state.statusHandler?.({
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
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'configuring',
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Configuring...');
            expect(result.current.demoStatusDisplay.color).toBe('blue');
        });
    });

    describe('Mesh Status Display', () => {
        it('should return Loading status... initially when hasMesh is true', () => {
            const { result } = renderHook(() => useDashboardStatus({ hasMesh: true }));

            expect(result.current.meshStatusDisplay).toEqual({
                color: 'blue',
                text: 'Loading status...',
            });
        });

        it('should return null when no mesh and status loaded', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    // No mesh property
                });
            });

            expect(result.current.meshStatusDisplay).toBeNull();
        });

        it('should return Deployed for deployed mesh', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'deployed' },
                });
            });

            expect(result.current.meshStatusDisplay).toEqual({
                color: 'green',
                text: 'Mesh Deployed',
            });
        });

        it('should return Session expired for needs-auth', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'needs-auth' },
                });
            });

            expect(result.current.meshStatusDisplay).toEqual({
                color: 'yellow',
                text: 'Session expired',
            });
        });

        it('should return Redeploy Mesh for config-changed', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'config-changed' },
                });
            });

            expect(result.current.meshStatusDisplay).toEqual({
                color: 'yellow',
                text: 'Redeploy Mesh',
            });
        });

        it('should return Deploying... with message for deploying', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'deploying', message: 'Uploading config...' },
                });
            });

            expect(result.current.meshStatusDisplay).toEqual({
                color: 'blue',
                text: 'Uploading config...',
            });
        });

        it('should return Mesh Error for error', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'error' },
                });
            });

            expect(result.current.meshStatusDisplay).toEqual({
                color: 'red',
                text: 'Mesh Error',
            });
        });
    });
});
