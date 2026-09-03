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

import '../../../../helpers/webviewClientMock';
import { renderHook, act } from '@testing-library/react';

import { useDashboardStatus } from '@/features/dashboard/ui/hooks/useDashboardStatus';
import type { EdsStorefrontStatus } from '@/features/dashboard/ui/hooks/dashboardStatusTypes';
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
                text: 'Deployed',
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

        it('should return Update needed for config-changed', () => {
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
                text: 'Update needed',
            });
        });

        // Moved down from ProjectDashboardScreen-mesh.test.tsx when the mesh
        // display left the dashboard with the grid: the vocabulary is the hook's
        // responsibility, and this was the one case the hook did not yet pin.
        it('should return Not deployed for not-deployed', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                mocks.state.statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'not-deployed' },
                });
            });

            expect(result.current.meshStatusDisplay?.text).toBe('Not deployed');
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

        it('should return Deploy failed for error', () => {
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
                text: 'Deploy failed',
            });
        });
    });
});

/**
 * `remedy` — which fix a bad state needs, decided where the state is named.
 *
 * The Frontend badge used to report "Republish needed" and "Restart needed" and
 * offer neither fix; the republish sat in the ActionGrid's More overflow under a
 * comment reading "rarely used actions", and no restart affordance existed at
 * all. Status and remedy had drifted apart, so nobody wired them back together.
 *
 * The state and its fix are now decided in one place. The zone that renders the
 * status maps `remedy` to a StatusCard action — the same mechanism the AI and
 * IMS Org badges already use.
 */
describe('demoStatusDisplay — remedy', () => {
    let mocksForRemedy: TestMocks;

    beforeEach(() => {
        mocksForRemedy = setupMocks();
    });

    const edsHook = (storefront?: EdsStorefrontStatus) =>
        renderHook(() => useDashboardStatus({ initialEdsStorefrontStatus: storefront }, true));

    it('asks for a republish when the storefront has drifted', () => {
        expect(edsHook('stale').result.current.demoStatusDisplay).toEqual({
            color: 'yellow',
            text: 'Republish needed',
            remedy: 'republish',
        });
    });

    it('asks for a republish after the user declined one', () => {
        // Previously tinted orange purely to mark "you were already asked" — a
        // distinction with no different action behind it.
        expect(edsHook('update-declined').result.current.demoStatusDisplay).toEqual({
            color: 'yellow',
            text: 'Republish needed',
            remedy: 'republish',
        });
    });

    it.each<EdsStorefrontStatus>(['published', 'not-published'])(
        'offers no remedy when %s',
        (status) => {
            // Not-published is not drift — publishing for the first time is Sync
            // Storefront's job, and offering "Republish" would name the wrong verb.
            expect(edsHook(status).result.current.demoStatusDisplay.remedy).toBeUndefined();
        }
    );

    it('spells the empty state the same way the project card does', () => {
        // The casing the two old switches disagreed on.
        expect(edsHook('not-published').result.current.demoStatusDisplay.text).toBe(
            'Not published'
        );
    });

    it('asks for a restart when a running demo config changed', () => {
        const { result } = renderHook(() => useDashboardStatus());

        act(() => {
            mocksForRemedy.state.statusHandler?.({
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
                port: 3000,
                frontendConfigChanged: true,
            });
        });

        expect(result.current.demoStatusDisplay).toEqual({
            color: 'yellow',
            text: 'Restart needed',
            remedy: 'restart',
        });
    });

    it('offers no remedy for a healthy running demo — control', () => {
        const { result } = renderHook(() => useDashboardStatus());

        act(() => {
            mocksForRemedy.state.statusHandler?.({
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
                port: 3000,
            });
        });

        expect(result.current.demoStatusDisplay.text).toBe('Running on port 3000');
        expect(result.current.demoStatusDisplay.remedy).toBeUndefined();
    });
});
