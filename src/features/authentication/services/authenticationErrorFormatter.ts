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
    } {
        const err = error as { message?: string; stack?: string };
        const errorMessage = err?.message || String(error);

        let title = 'Authentication Error';
        let message = errorMessage;

        // Detect timeout errors
        if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('timed out')) {
            title = 'Operation Timed Out';
            message = `${context.operation} timed out after ${context.timeout}ms. Please try again.`;
        }

        // Detect network errors
        else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('enotfound')) {
            title = 'Network Error';
            message = 'No internet connection. Please check your network and try again.';
        }

        // Detect auth errors
        else if (errorMessage.toLowerCase().includes('auth') || errorMessage.toLowerCase().includes('unauthorized')) {
            title = 'Authentication Failed';
            message = 'Authentication failed. Please try logging in again.';
        }

        const technical = `Operation: ${context.operation}\nError: ${errorMessage}\nStack: ${err?.stack || 'N/A'}`;

        return { title, message, technical };
    }
}
