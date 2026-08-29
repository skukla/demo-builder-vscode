/**
 * Shared test utilities for MeshDeploymentVerifier tests
 *
 * NOTE: Mock dependencies (jest.mock) must be set up in each test file
 * before importing this module, as Jest requires mocks to be at the top level.
 */

/** Canonical command-executor fake (ADR-016). */
export { createMockCommandExecutor as createMockCommandManager } from '../../../helpers/commandExecutorFake';
import type { CommandResult } from '@/core/shell/types';
import { createSuccessResult, createFailureResult } from '../../../helpers/commandResultFake';

/**
 * CONVERTED 2026-08-28 (ADR-015): waitForMeshDeployment receives its executor
 * instead of fetching one, so this no longer touches the service registry —
 * it records the fake the suites will HAND IN via createDefaultOptions().
 * Kept as a named function so the four sibling suites did not have to change
 * a line.
 */
let handedInExecutor: any;
export function setupServiceLocatorMock(mockCommandManager: any) {
    handedInExecutor = mockCommandManager;
}

/**
 * Factory for creating deployed mesh status response
 */
export function createDeployedStatusResponse(meshId: string = 'mesh123'): CommandResult {
    return createSuccessResult(JSON.stringify({
            meshStatus: 'deployed',
            meshId,
        }));
}

/**
 * Factory for creating success mesh status response
 */
export function createSuccessStatusResponse(meshId: string = 'mesh123'): CommandResult {
    return createSuccessResult(JSON.stringify({
            meshStatus: 'success',
            meshId,
        }));
}

/**
 * Factory for creating pending mesh status response
 */
export function createPendingStatusResponse(): CommandResult {
    return createSuccessResult(JSON.stringify({
            meshStatus: 'pending',
        }));
}

/**
 * Factory for creating building mesh status response
 */
export function createBuildingStatusResponse(): CommandResult {
    return createSuccessResult(JSON.stringify({
            meshStatus: 'building',
        }));
}

/**
 * Factory for creating error mesh status response
 */
export function createErrorStatusResponse(): CommandResult {
    return createSuccessResult(JSON.stringify({
            meshStatus: 'error',
            error: 'Mesh deployment failed with error status',
        }));
}

/**
 * Factory for creating failed mesh status response
 */
export function createFailedStatusResponse(): CommandResult {
    return createSuccessResult(JSON.stringify({
            meshStatus: 'failed',
        }));
}

/**
 * Factory for creating endpoint response (text format)
 */
export function createEndpointTextResponse(endpoint: string = 'https://example.com/graphql'): CommandResult {
    return createSuccessResult(`Endpoint: ${endpoint}`);
}

/**
 * Factory for creating endpoint response (JSON format)
 */
export function createEndpointJsonResponse(endpoint: string = 'https://example.com/graphql'): CommandResult {
    return createSuccessResult(JSON.stringify({
            endpoint,
        }));
}

/**
 * Factory for creating failed describe command response
 */
export function createDescribeFailureResponse(): CommandResult {
    return createFailureResult('Failed to describe');
}

/**
 * Factory for creating malformed JSON response
 */
export function createMalformedJsonResponse(): CommandResult {
    return createSuccessResult('not json');
}

/**
 * Factory for creating non-zero exit code response
 */
export function createCommandFailureResponse(stderr: string = 'Command failed'): CommandResult {
    return createFailureResult(stderr);
}

/** Canonical logger fake (ADR-016). Re-exported so existing imports keep working. */
export { createMockLogger } from '../../../helpers/loggerFake';

/**
 * Default verification options for testing
 */
export function createDefaultOptions() {
    return {
        commandManager: handedInExecutor,
        initialWait: 100,
        pollInterval: 100,
        maxRetries: 5,
    };
}

/**
 * Advances timers and allows promises to resolve
 */
export async function advanceTimersAndResolve(ms: number) {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
}
