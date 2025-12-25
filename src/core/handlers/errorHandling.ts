/**
 * Error Handling Utilities
 *
 * Provides standardized error handling for message handlers.
 * Ensures consistent error response format: { success: false, error, code }
 */

import { ErrorCode } from '@/types/errorCodes';
import { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import { toError } from '@/types/typeGuards';

/**
 * Standard error response format
 */
export interface ErrorResponse {
    success: false;
    error: string;
    code?: ErrorCode;
}

/**
 * Create a standardized error response
 *
 * @param errorOrMessage - Error object or error message string
 * @param code - Optional error code for categorization
 * @returns Standardized error response object
 */
export function createErrorResponse(
    errorOrMessage: Error | string | unknown,
    code?: ErrorCode,
): ErrorResponse {
    let errorMessage: string;

    if (errorOrMessage instanceof Error) {
        errorMessage = errorOrMessage.message;
    } else if (typeof errorOrMessage === 'string') {
        errorMessage = errorOrMessage;
    } else {
        // Handle unknown types
        errorMessage = String(errorOrMessage);
    }

    const response: ErrorResponse = {
        success: false,
        error: errorMessage,
    };

    if (code !== undefined) {
        response.code = code;
    }

    return response;
}

/**
 * Wrap a handler function with standardized error handling
 *
 * Catches any errors thrown by the handler and converts them to
 * standardized error responses with logging.
 *
 * @param handler - The handler function to wrap
 * @param handlerName - Name for logging purposes
 * @returns Wrapped handler with error handling
 */
export function wrapHandler<P = unknown, R extends HandlerResponse = HandlerResponse>(
    handler: MessageHandler<P, R>,
    handlerName: string,
): MessageHandler<P, R | ErrorResponse> {
    return async (context: HandlerContext, payload?: P): Promise<R | ErrorResponse> => {
        try {
            return await handler(context, payload);
        } catch (error) {
            const err = toError(error);

            // Log the error with handler name
            context.logger.error(`[${handlerName}] Handler error`, err);

            // Extract error code if present on error object
            const errorCode = (error as { code?: ErrorCode }).code ?? ErrorCode.UNKNOWN;

            return createErrorResponse(err, errorCode);
        }
    };
}
