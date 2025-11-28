/**
 * Tests for ErrorCode integration in useMeshOperations hook
 *
 * Verifies that the hook extracts and exposes error codes from backend responses.
 */

// Import mock exports from testUtils
import {
    mockRequest,
    baseState,
    createCheckResponse,
    createErrorResponse,
    resetMocks,
} from './useMeshOperations.testUtils';

// Mock WebviewClient - must be in test file for proper hoisting
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: any[]) => {
            const { mockPostMessage } = require('./useMeshOperations.testUtils');
            return mockPostMessage(...args);
        },
        onMessage: (...args: any[]) => {
            const { mockOnMessage } = require('./useMeshOperations.testUtils');
            return mockOnMessage(...args);
        },
        request: (...args: any[]) => {
            const { mockRequest } = require('./useMeshOperations.testUtils');
            return mockRequest(...args);
        },
    },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { ErrorCode } from '@/types/errorCodes';
import { useMeshOperations } from '@/features/mesh/ui/hooks/useMeshOperations';
import { WizardState } from '@/types/webview';

describe('useMeshOperations error code handling', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        resetMocks();
        mockUpdateState.mockClear();
        mockSetCanProceed.mockClear();
        // Prevent auto-run of runCheck on mount
        mockRequest.mockResolvedValue(createCheckResponse());
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('extracts TIMEOUT error code from check response', async () => {
        mockRequest.mockResolvedValue(
            createErrorResponse('Operation timed out', ErrorCode.TIMEOUT)
        );

        const { result } = renderHook(() =>
            useMeshOperations({
                state: baseState as WizardState,
                updateState: mockUpdateState,
                setCanProceed: mockSetCanProceed,
            })
        );

        // Wait for auto-run check to complete
        await waitFor(() => {
            expect(result.current.isChecking).toBe(false);
        });

        expect(result.current.error).toBe('Operation timed out');
        expect(result.current.errorCode).toBe(ErrorCode.TIMEOUT);
    });

    it('extracts NETWORK error code from check response', async () => {
        mockRequest.mockResolvedValue(
            createErrorResponse('Network connection failed', ErrorCode.NETWORK)
        );

        const { result } = renderHook(() =>
            useMeshOperations({
                state: baseState as WizardState,
                updateState: mockUpdateState,
                setCanProceed: mockSetCanProceed,
            })
        );

        await waitFor(() => {
            expect(result.current.isChecking).toBe(false);
        });

        expect(result.current.error).toBe('Network connection failed');
        expect(result.current.errorCode).toBe(ErrorCode.NETWORK);
    });

    it('extracts MESH_DEPLOY_FAILED error code', async () => {
        mockRequest.mockResolvedValue(
            createErrorResponse('Mesh deployment failed', ErrorCode.MESH_DEPLOY_FAILED)
        );

        const { result } = renderHook(() =>
            useMeshOperations({
                state: baseState as WizardState,
                updateState: mockUpdateState,
                setCanProceed: mockSetCanProceed,
            })
        );

        await waitFor(() => {
            expect(result.current.isChecking).toBe(false);
        });

        expect(result.current.error).toBe('Mesh deployment failed');
        expect(result.current.errorCode).toBe(ErrorCode.MESH_DEPLOY_FAILED);
    });

    it('passes error code to updateState in apiMesh', async () => {
        mockRequest.mockResolvedValue(
            createErrorResponse('Operation timed out', ErrorCode.TIMEOUT)
        );

        renderHook(() =>
            useMeshOperations({
                state: baseState as WizardState,
                updateState: mockUpdateState,
                setCanProceed: mockSetCanProceed,
            })
        );

        await waitFor(() => {
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    apiMesh: expect.objectContaining({
                        error: 'Operation timed out',
                        code: ErrorCode.TIMEOUT,
                    }),
                })
            );
        });
    });

    it('returns undefined errorCode when no error', async () => {
        mockRequest.mockResolvedValue(createCheckResponse());

        const { result } = renderHook(() =>
            useMeshOperations({
                state: baseState as WizardState,
                updateState: mockUpdateState,
                setCanProceed: mockSetCanProceed,
            })
        );

        await waitFor(() => {
            expect(result.current.isChecking).toBe(false);
        });

        expect(result.current.error).toBeUndefined();
        expect(result.current.errorCode).toBeUndefined();
    });

    it('handles response without code field (backward compatibility)', async () => {
        // Legacy response without code field
        mockRequest.mockResolvedValue({
            success: false,
            apiEnabled: false,
            error: 'Some legacy error',
            // No code field
        });

        const { result } = renderHook(() =>
            useMeshOperations({
                state: baseState as WizardState,
                updateState: mockUpdateState,
                setCanProceed: mockSetCanProceed,
            })
        );

        await waitFor(() => {
            expect(result.current.isChecking).toBe(false);
        });

        expect(result.current.error).toBe('Some legacy error');
        expect(result.current.errorCode).toBeUndefined();
    });

    it('clears errorCode on successful check', async () => {
        // First: error response
        mockRequest.mockResolvedValueOnce(
            createErrorResponse('Operation timed out', ErrorCode.TIMEOUT)
        );

        const { result, rerender } = renderHook(() =>
            useMeshOperations({
                state: baseState as WizardState,
                updateState: mockUpdateState,
                setCanProceed: mockSetCanProceed,
            })
        );

        await waitFor(() => {
            expect(result.current.errorCode).toBe(ErrorCode.TIMEOUT);
        });

        // Second: success response
        mockRequest.mockResolvedValue(createCheckResponse());

        await act(async () => {
            await result.current.runCheck();
        });

        await waitFor(() => {
            expect(result.current.error).toBeUndefined();
            expect(result.current.errorCode).toBeUndefined();
        });
    });
});
