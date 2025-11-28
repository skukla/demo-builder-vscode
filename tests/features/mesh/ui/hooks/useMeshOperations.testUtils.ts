/**
 * Shared test utilities for useMeshOperations hook tests
 */

import { WizardState } from '@/types/webview';
import { ErrorCode } from '@/types/errorCodes';
import '@testing-library/jest-dom';

// Mock WebviewClient
export const mockPostMessage = jest.fn();
export const mockOnMessage = jest.fn().mockReturnValue(jest.fn());
export const mockRequest = jest.fn();

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => mockPostMessage(...args),
        onMessage: (...args: any[]) => mockOnMessage(...args),
        request: (...args: any[]) => mockRequest(...args),
    },
}));

/**
 * Base wizard state for tests
 */
export const baseState: Partial<WizardState> = {
    currentStep: 'api-mesh',
    adobeAuth: {
        isAuthenticated: true,
        isChecking: false,
    },
    adobeOrg: {
        id: 'org-123',
        code: 'TEST_ORG',
        name: 'Test Organization',
    },
    adobeWorkspace: {
        id: 'workspace-123',
        name: 'Test Workspace',
    },
    apiMesh: undefined,
};

/**
 * Check API Mesh response factory with error code
 */
export const createCheckResponse = (overrides?: any) => ({
    success: true,
    apiEnabled: true,
    meshExists: true,
    meshId: 'mesh-123',
    meshStatus: 'deployed' as const,
    endpoint: 'https://mesh.adobe.io/endpoint',
    ...overrides,
});

/**
 * Create API Mesh response factory with error code
 */
export const createMeshResponse = (overrides?: any) => ({
    success: true,
    meshId: 'new-mesh-123',
    endpoint: 'https://mesh.adobe.io/new',
    ...overrides,
});

/**
 * Error response factory with error code
 */
export const createErrorResponse = (error: string, code?: ErrorCode) => ({
    success: false,
    apiEnabled: false,
    error,
    code,
});

/**
 * Reset all mocks
 */
export function resetMocks(): void {
    jest.clearAllMocks();
    mockOnMessage.mockReturnValue(jest.fn());
    mockRequest.mockResolvedValue({ success: false });
}
