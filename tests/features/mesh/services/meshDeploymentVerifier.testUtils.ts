/**
 * Shared test utilities for MeshDeploymentVerifier tests
 *
 * NOTE: Mock dependencies (jest.mock) must be set up in each test file
 * before importing this module, as Jest requires mocks to be at the top level.
 */

/**
 * Creates a mock command manager for testing
 */
export function createMockCommandManager() {
    return {
        execute: jest.fn(),
    };
}

/**
 * Sets up the ServiceLocator mock with a command manager
 */
export function setupServiceLocatorMock(mockCommandManager: any) {
    const { ServiceLocator } = require('@/core/di');
    ServiceLocator.getCommandExecutor.mockReturnValue(mockCommandManager);
}

/**
 * Factory for creating deployed mesh status response
 */
export function createDeployedStatusResponse(meshId: string = 'mesh123') {
    return {
        code: 0,
        stdout: JSON.stringify({
            meshStatus: 'deployed',
            meshId,
        }),
    };
}

/**
 * Factory for creating success mesh status response
 */
export function createSuccessStatusResponse(meshId: string = 'mesh123') {
    return {
        code: 0,
        stdout: JSON.stringify({
            meshStatus: 'success',
            meshId,
        }),
    };
}

/**
 * Factory for creating pending mesh status response
 */
export function createPendingStatusResponse() {
    return {
        code: 0,
        stdout: JSON.stringify({
            meshStatus: 'pending',
        }),
    };
}

/**
 * Factory for creating building mesh status response
 */
export function createBuildingStatusResponse() {
    return {
        code: 0,
        stdout: JSON.stringify({
            meshStatus: 'building',
        }),
    };
}

/**
 * Factory for creating error mesh status response
 */
export function createErrorStatusResponse() {
    return {
        code: 0,
        stdout: JSON.stringify({
            meshStatus: 'error',
            error: 'Mesh deployment failed with error status',
        }),
    };
}

/**
 * Factory for creating failed mesh status response
 */
export function createFailedStatusResponse() {
    return {
        code: 0,
        stdout: JSON.stringify({
            meshStatus: 'failed',
        }),
    };
}

/**
 * Factory for creating endpoint response (text format)
 */
export function createEndpointTextResponse(endpoint: string = 'https://example.com/graphql') {
    return {
        code: 0,
        stdout: `Endpoint: ${endpoint}`,
    };
}

/**
 * Factory for creating endpoint response (JSON format)
 */
export function createEndpointJsonResponse(endpoint: string = 'https://example.com/graphql') {
    return {
        code: 0,
        stdout: JSON.stringify({
            endpoint,
        }),
    };
}

/**
 * Factory for creating failed describe command response
 */
export function createDescribeFailureResponse() {
    return {
        code: 1,
        stderr: 'Failed to describe',
    };
}

/**
 * Factory for creating malformed JSON response
 */
export function createMalformedJsonResponse() {
    return {
        code: 0,
        stdout: 'not json',
    };
}

/**
 * Factory for creating non-zero exit code response
 */
export function createCommandFailureResponse(stderr: string = 'Command failed') {
    return {
        code: 1,
        stderr,
    };
}

/**
 * Factory for creating a mock logger
 */
export function createMockLogger() {
    return {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
}

/**
 * Default verification options for testing
 */
export function createDefaultOptions() {
    return {
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
