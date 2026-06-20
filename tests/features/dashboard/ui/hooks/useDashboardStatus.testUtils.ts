/**
 * Shared test utilities for useDashboardStatus tests.
 *
 * IMPORTANT: each test file MUST declare its own
 * `jest.mock('@/core/ui/utils/WebviewClient', ...)` at the top. Jest only
 * hoists jest.mock calls within a single file — placing the mock here
 * would NOT apply to importing test files.
 *
 * The `setupMocks()` factory captures the `statusUpdate` and
 * `meshStatusUpdate` handlers registered by the hook on mount, so tests
 * can drive the hook by calling `state.statusHandler?.(...)` or
 * `state.meshStatusHandler?.(...)`.
 */

import { act } from '@testing-library/react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/** Mutable handler refs captured from the hook's `onMessage` subscriptions. */
export interface HandlerRefs {
    statusHandler: ((data: unknown) => void) | null;
    meshStatusHandler: ((data: unknown) => void) | null;
    orgHandler: ((data: unknown) => void) | null;
}

/** Mocks + handler refs returned from `setupMocks()`. */
export interface TestMocks {
    state: HandlerRefs;
    mockPostMessage: jest.Mock;
    mockOnMessage: jest.Mock;
    mockRequest: jest.Mock;
    mockUnsubscribeStatus: jest.Mock;
    mockUnsubscribeMesh: jest.Mock;
}

/**
 * Reset all WebviewClient mocks and re-install the handler-capture
 * implementation. Call from `beforeEach` in each test file.
 */
export function setupMocks(): TestMocks {
    jest.clearAllMocks();

    const state: HandlerRefs = {
        statusHandler: null,
        meshStatusHandler: null,
        orgHandler: null,
    };
    const mockUnsubscribeStatus = jest.fn();
    const mockUnsubscribeMesh = jest.fn();
    const mockPostMessage = webviewClient.postMessage as jest.Mock;
    const mockOnMessage = webviewClient.onMessage as jest.Mock;
    const mockRequest = webviewClient.request as jest.Mock;

    mockOnMessage.mockImplementation((type: string, handler: (data: unknown) => void) => {
        if (type === 'statusUpdate') {
            state.statusHandler = handler;
            return mockUnsubscribeStatus;
        }
        if (type === 'meshStatusUpdate') {
            state.meshStatusHandler = handler;
            return mockUnsubscribeMesh;
        }
        if (type === 'checkResult') {
            state.orgHandler = handler;
            return jest.fn();
        }
        return jest.fn();
    });

    // Default: request never resolves so aiReady stays in 'Verifying'.
    // AI Ready tests override this with their own mockResolvedValue.
    mockRequest.mockImplementation(() => new Promise(() => {}));

    return {
        state,
        mockPostMessage,
        mockOnMessage,
        mockRequest,
        mockUnsubscribeStatus,
        mockUnsubscribeMesh,
    };
}

// ─── AI Ready test helpers ───────────────────────────────────────────────

/** Build an "ok" check entry for the verify-ai-setup response shape. */
export const okCheck = (name: string) => ({ name, status: 'ok' as const });

/** Build a failing check entry (warning) with a default message. */
export const failCheck = (name: string) => ({
    name,
    status: 'warning' as const,
    message: 'Missing',
});

/**
 * Construct a verify-ai-setup mock response. All fields are overridable —
 * defaults represent the "everything green" success path.
 */
export const buildVerifyResponse = (overrides: {
    checks?: Array<{ name: string; status: 'ok' | 'warning' | 'error'; message?: string }>;
    inventory?: {
        skills?: unknown[];
        mcps?: unknown[];
        sessionMcps?: unknown[];
        skillsError?: string;
        mcpsError?: string;
    };
} = {}) => ({
    success: true,
    status: 'ok',
    checks: overrides.checks ?? [
        okCheck('AGENTS.md'),
        okCheck('.claude/mcp.json'),
        okCheck('mcp-binary'),
        okCheck('skill-files'),
    ],
    inventory: {
        skills: overrides.inventory?.skills ?? [],
        mcps: overrides.inventory?.mcps ?? [],
        sessionMcps: overrides.inventory?.sessionMcps ?? [],
        ...(overrides.inventory?.skillsError !== undefined
            ? { skillsError: overrides.inventory.skillsError }
            : {}),
        ...(overrides.inventory?.mcpsError !== undefined
            ? { mcpsError: overrides.inventory.mcpsError }
            : {}),
    },
});

/**
 * Flush enough microtasks for the verify-ai-setup promise chain to settle.
 * The hook awaits multiple promises before applying state updates.
 */
export const flushVerify = async (): Promise<void> => {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
};
