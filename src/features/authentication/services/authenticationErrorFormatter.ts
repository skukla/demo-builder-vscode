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

/**
 * A sentence an SC can act on for the two Adobe refusals that reach a deploy with no
 * explanation of their own, or `undefined` when the text is neither.
 *
 * Both were read off real failures on 2026-09-17/18:
 *
 * - **Missing licence.** Console and Runtime answer `403 … doesn't have the matching
 *   licenses` (template `ERR_MSG_OPERATION_NOT_ALLOWED`) when the signed-in person is
 *   not a developer on every product profile the project's credential uses. The
 *   project then also reads as read-only in Developer Console. Only an org admin can
 *   change profile membership, so the sentence says who.
 * - **Licence service down.** Console answers `504 Gateway Timeout` when its own call
 *   to Adobe's licence service times out. Nothing the SC does fixes that; waiting does.
 */
export function explainAdobeAccessFailure(text: string): string | undefined {
    if (/matching licenses|ERR_MSG_OPERATION_NOT_ALLOWED/i.test(text)) {
        return (
            'Adobe refused this because your login is not a developer on every product ' +
            "profile this project's credential uses. An admin of this Adobe organization " +
            'can fix it in Admin Console by adding you as a developer on those product ' +
            'profiles. Details are in Debug Logs.'
        );
    }
    const timedOut = /504/.test(text) && /Gateway Timeout|timed out/i.test(text);
    if (timedOut && /CoreConsoleAPISDK|licenses/i.test(text)) {
        return (
            "Adobe's Developer Console did not answer in time. This is on Adobe's side — " +
            'try again in a few minutes. Details are in Debug Logs.'
        );
    }
    return undefined;
}
