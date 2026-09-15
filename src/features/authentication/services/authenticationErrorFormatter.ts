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

import { classifyTransience, extractErrorMessage, type FailureShape } from '@/core/errors';
import { ErrorCode, getErrorTitle, getErrorCategory } from '@/types/errorCodes';

/**
 * The ErrorCode an auth failure carries, from what the failure looks like.
 *
 * Deliberately local to this formatter. A SHARED version of this is what was just
 * retired: a generic classifier cannot know which provider produced a string, and its
 * guess was reaching people as advice. Here the provider IS known.
 */
function codeForAuthFailure(error: unknown): ErrorCode {
    const explicit = (error as { code?: ErrorCode } | undefined)?.code;
    if (explicit && Object.values(ErrorCode).includes(explicit)) return explicit;
    switch (classifyTransience(error).kind) {
        case 'timeout':
            return ErrorCode.TIMEOUT;
        case 'network':
            return ErrorCode.NETWORK;
        case 'auth':
            return ErrorCode.AUTH_REQUIRED;
        default:
            return ErrorCode.UNKNOWN;
    }
}

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
        const err = error as { message?: string; stack?: string };
        const errorMessage = extractErrorMessage(error);
        // A domain error that carries its OWN user-facing sentence has already done the
        // translating, and it knew what happened. Honour it. This is what taking the
        // SHAPE forward instead of the class hierarchy buys: anything implementing
        // FailureShape takes part, without inheriting from anything.
        const authored = (error as Partial<FailureShape> | null)?.userMessage;
        // An EMPTY message must not render as an empty sentence. The retired AppError
        // fell back to the code's title for this, and a blank line where an explanation
        // belongs is worse than a vague one.
        const fallback = errorMessage || getErrorTitle(codeForAuthFailure(error));

        // A PER-PROVIDER FORMATTER, which is the one place classifying by message text
        // earns its keep: this knows it is looking at Adobe IMS and Console failures and
        // turns them into something an SC can act on. The comment here used to say
        // "no string matching!" while calling `toAppError`, which matched strings --
        // the classification simply happened one module away.
        const code = codeForAuthFailure(error);
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
                    message = authored ?? fallback;
                }
                break;

            case 'auth':
                title = getErrorTitle(code);
                message = 'Authentication failed. Please try logging in again.';
                break;

            default:
                title = getErrorTitle(code);
                message = authored ?? fallback;
        }

        const technical = `Operation: ${context.operation}\nCode: ${code}\nError: ${errorMessage}\nStack: ${err?.stack || 'N/A'}`;

        return { title, message, technical, code };
    }
}
