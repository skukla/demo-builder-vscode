/**
 * Error Handling Utility Tests
 *
 * Tests for the standardized error handling wrapper function.
 * Ensures consistent error response format across all handlers.
 */

import { wrapHandler, createErrorResponse } from '@/core/handlers/errorHandling';
import { ErrorCode } from '@/types/errorCodes';
import { HandlerContext } from '@/types/handlers';

// Mock logger for testing
const createMockLogger = () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
});

// Create minimal mock context
const createMockContext = (): HandlerContext => ({
    logger: createMockLogger() as unknown as HandlerContext['logger'],
    debugLogger: createMockLogger() as unknown as HandlerContext['debugLogger'],
    context: {} as HandlerContext['context'],
    panel: undefined,
    stateManager: {} as HandlerContext['stateManager'],
    communicationManager: undefined,
    sendMessage: jest.fn(),
    sharedState: { isAuthenticating: false },
});

describe('errorHandling', () => {
    describe('createErrorResponse', () => {
        it('should create error response with message only', () => {
            const response = createErrorResponse('Something went wrong');

            expect(response).toEqual({
                success: false,
                error: 'Something went wrong',
            });
        });

        it('should create error response with error code', () => {
            const response = createErrorResponse('Auth failed', ErrorCode.AUTH_REQUIRED);

            expect(response).toEqual({
                success: false,
                error: 'Auth failed',
                code: ErrorCode.AUTH_REQUIRED,
            });
        });

        it('should create error response from Error object', () => {
            const error = new Error('Test error message');
            const response = createErrorResponse(error);

            expect(response).toEqual({
                success: false,
                error: 'Test error message',
            });
        });

        it('should create error response from Error object with code', () => {
            const error = new Error('Auth error');
            const response = createErrorResponse(error, ErrorCode.AUTH_EXPIRED);

            expect(response).toEqual({
                success: false,
                error: 'Auth error',
                code: ErrorCode.AUTH_EXPIRED,
            });
        });

        it('should handle unknown error types', () => {
            const response = createErrorResponse({ random: 'object' });

            expect(response.success).toBe(false);
            expect(response.error).toBeDefined();
        });
    });

    describe('wrapHandler', () => {
        it('should pass through successful handler result', async () => {
            const handler = jest.fn().mockResolvedValue({ success: true, data: 'test' });
            const wrapped = wrapHandler(handler, 'TestHandler');
            const context = createMockContext();

            const result = await wrapped(context, { input: 'data' });

            expect(result).toEqual({ success: true, data: 'test' });
            expect(handler).toHaveBeenCalledWith(context, { input: 'data' });
        });

        it('should catch errors and return standardized error response', async () => {
            const handler = jest.fn().mockRejectedValue(new Error('Handler failed'));
            const wrapped = wrapHandler(handler, 'TestHandler');
            const context = createMockContext();

            const result = await wrapped(context, {});

            expect(result).toEqual({
                success: false,
                error: 'Handler failed',
                code: ErrorCode.UNKNOWN,
            });
        });

        it('should log errors with handler name', async () => {
            const handler = jest.fn().mockRejectedValue(new Error('Test failure'));
            const wrapped = wrapHandler(handler, 'MyHandler');
            const context = createMockContext();

            await wrapped(context, {});

            expect(context.logger.error).toHaveBeenCalledWith(
                '[MyHandler] Handler error',
                expect.any(Error),
            );
        });

        it('should preserve custom error code from thrown error with code property', async () => {
            const customError = new Error('Custom error') as Error & { code: ErrorCode };
            customError.code = ErrorCode.MESH_CONFIG_INVALID;

            const handler = jest.fn().mockRejectedValue(customError);
            const wrapped = wrapHandler(handler, 'CustomHandler');
            const context = createMockContext();

            const result = await wrapped(context, {});

            expect(result.code).toBe(ErrorCode.MESH_CONFIG_INVALID);
        });

        it('should handle non-Error thrown values', async () => {
            const handler = jest.fn().mockRejectedValue('string error');
            const wrapped = wrapHandler(handler, 'StringErrorHandler');
            const context = createMockContext();

            const result = await wrapped(context, {});

            expect(result.success).toBe(false);
            expect(result.error).toContain('string error');
        });

        it('should work with async handlers', async () => {
            const handler = jest.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return { success: true, message: 'async complete' };
            });
            const wrapped = wrapHandler(handler, 'AsyncHandler');
            const context = createMockContext();

            const result = await wrapped(context, {});

            expect(result).toEqual({ success: true, message: 'async complete' });
        });
    });
});
