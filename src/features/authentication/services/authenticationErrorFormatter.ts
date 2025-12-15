/**
 * Error Formatting for Authentication Errors
 *
 * Categorizes errors into timeout/network/auth and provides structured
 * output for UI display with separate title, message, and technical details.
 *
 * **Use this formatter for:**
 * - User-facing authentication errors needing categorization
 * - Errors requiring structured output (title, message, technical)
 * - Timeout, network, and auth failure errors
 *
 * **Returns**: `{title: string; message: string; technical: string}`
 * (structured object for UI display)
 *
 * **See also**: `@/features/mesh/utils/errorFormatter.ts`
 * for simple string formatting of Adobe CLI errors
 *
 * @example
 * ```typescript
 * const formatted = AuthenticationErrorFormatter.formatError(error, {
 *     operation: 'login',
 *     timeout: 5000
 * });
 * // {
 * //   title: "Operation Timed Out",
 * //   message: "Login timed out after 5000ms. Please try again.",
 * //   technical: "Operation: login\nError: ...\nStack: ..."
 * // }
 * ```
 */

import { ErrorCode, getErrorTitle, getErrorCategory } from '@/types/errorCodes';
import { toAppError } from '@/types/errors';

export class AuthenticationErrorFormatter {
    /**
     * Format error with categorization and structured output
     *
     * Categorizes errors into:
     * - **Timeout**: Operation exceeded time limit
     * - **Network**: Connection/DNS errors
     * - **Auth**: Authentication/authorization failures
     * - **Generic**: Uncategorized errors (fallback)
     *
     * @param error - The error to format (Error, string, or unknown)
     * @param context - Operation context with timeout information
     * @param context.operation - Name of operation that failed (e.g., "login", "token refresh")
     * @param context.timeout - Optional timeout duration in milliseconds
     * @returns Structured error with title, user-friendly message, and technical details
     */
    static formatError(error: unknown, context: { operation: string; timeout?: number }): {
        title: string;
        message: string;
        technical: string;
        code: ErrorCode;
    } {
        // Convert to typed AppError for consistent handling
        const appError = toAppError(error);
        const err = error as { message?: string; stack?: string };
        const errorMessage = appError.message;

        // Use error code for categorization (no string matching!)
        const code = appError.code;
        const category = getErrorCategory(code);

        let title: string;
        let message: string;

        // Customize message based on error category
        switch (category) {
            case 'general':
                if (code === ErrorCode.TIMEOUT) {
                    title = getErrorTitle(code);
                    message = `${context.operation} timed out after ${context.timeout}ms. Please try again.`;
                } else if (code === ErrorCode.NETWORK) {
                    title = getErrorTitle(code);
                    message = 'No internet connection. Please check your network and try again.';
                } else {
                    title = getErrorTitle(code);
                    message = appError.userMessage;
                }
                break;

            case 'auth':
                title = getErrorTitle(code);
                message = 'Authentication failed. Please try logging in again.';
                break;

            default:
                // Use the AppError's built-in user message
                title = getErrorTitle(code);
                message = appError.userMessage;
        }

        const technical = `Operation: ${context.operation}\nCode: ${code}\nError: ${errorMessage}\nStack: ${err?.stack || 'N/A'}`;

        return { title, message, technical, code };
    }
}
