/**
 * Shared test utilities for useDashboardStatus hook tests.
 *
 * NOTE: The `jest.mock('@/core/ui/utils/WebviewClient', ...)` call cannot live
 * here — `jest.mock` is hoisted per-module, so it must be declared in each
 * test file. This harness captures the message handlers, exposes the mock
 * unsubscribe fns, and wires up the default `beforeEach` behavior so the test
 * files share a single source of truth for setup.
 */

import { webviewClient } from '@/core/ui/utils/WebviewClient';

export interface DashboardStatusHarness {
    /** Returns the currently captured statusUpdate handler (set after render). */
    getStatusHandler: () => ((data: unknown) => void) | null;
    /** Returns the currently captured meshStatusUpdate handler (set after render). */
    getMeshStatusHandler: () => ((data: unknown) => void) | null;
    mockUnsubscribeStatus: jest.Mock;
    mockUnsubscribeMesh: jest.Mock;
    mockPostMessage: jest.Mock;
    mockOnMessage: jest.Mock;
    mockRequest: jest.Mock;
}

/**
 * Creates a harness wired into the (already-mocked) webviewClient. Call this
 * once per test file and invoke `harness.reset()`-equivalent logic via
 * {@link setupDashboardStatusMocks} inside `beforeEach`.
 */
export function createDashboardStatusHarness(): DashboardStatusHarness {
    let statusHandler: ((data: unknown) => void) | null = null;
    let meshStatusHandler: ((data: unknown) => void) | null = null;

    const mockUnsubscribeStatus = jest.fn();
    const mockUnsubscribeMesh = jest.fn();
    const mockPostMessage = webviewClient.postMessage as jest.Mock;
    const mockOnMessage = webviewClient.onMessage as jest.Mock;
    const mockRequest = webviewClient.request as jest.Mock;

    const harness: DashboardStatusHarness & {
        _setStatusHandler: (h: ((data: unknown) => void) | null) => void;
        _setMeshStatusHandler: (h: ((data: unknown) => void) | null) => void;
    } = {
        getStatusHandler: () => statusHandler,
        getMeshStatusHandler: () => meshStatusHandler,
        mockUnsubscribeStatus,
        mockUnsubscribeMesh,
        mockPostMessage,
        mockOnMessage,
        mockRequest,
        _setStatusHandler: (h) => {
            statusHandler = h;
        },
        _setMeshStatusHandler: (h) => {
            meshStatusHandler = h;
        },
    };

    return harness;
}

/**
 * Resets mocks and wires up the default `beforeEach` behavior for the given
 * harness. Mirrors the original test file's `beforeEach` exactly.
 */
export function setupDashboardStatusMocks(
    harness: DashboardStatusHarness & {
        _setStatusHandler?: (h: ((data: unknown) => void) | null) => void;
        _setMeshStatusHandler?: (h: ((data: unknown) => void) | null) => void;
    },
): void {
    jest.clearAllMocks();
    harness._setStatusHandler?.(null);
    harness._setMeshStatusHandler?.(null);

    // Setup message handler capture
    harness.mockOnMessage.mockImplementation((type: string, handler: (data: unknown) => void) => {
        if (type === 'statusUpdate') {
            harness._setStatusHandler?.(handler);
            return harness.mockUnsubscribeStatus;
        }
        if (type === 'meshStatusUpdate') {
            harness._setMeshStatusHandler?.(handler);
            return harness.mockUnsubscribeMesh;
        }
        return jest.fn();
    });

    // Default: request never resolves so aiReady stays in 'Verifying'
    harness.mockRequest.mockImplementation(() => new Promise(() => {}));
}
