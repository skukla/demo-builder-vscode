/**
 * Authentication's own error taxonomy.
 *
 * One class today, and it earns its place: the org-mismatch failure is the one this
 * feature throws that CALLERS BRANCH ON rather than merely report. The UI routes it
 * through `ensureOrgContext` and a forced sign-in recovery; agents treat it as
 * non-retryable.
 *
 * It used to be a generic `AuthError` from the retired central hierarchy
 * (owner-decided 2026-09-11). That class filled its user-facing sentence from
 * `getErrorTitle(code)` — a generic title looked up from a code — so it could not
 * name which provider failed or what to do about it, which is exactly why a shared
 * base class is the wrong home for an error. Here, the message is written knowing
 * what happened.
 *
 * @module features/authentication/services/authenticationErrors
 */
import type { FailureShape } from '@/core/errors';
import { ErrorCode } from '@/types/errorCodes';

/**
 * The Adobe CLI is pointed at a different organization than the operation needs.
 *
 * NO TERMINAL INSTRUCTION in the user-facing message, deliberately: this is
 * recoverable inside the app, and telling someone to go and run a CLI command sends
 * them somewhere the extension was about to take them anyway.
 */
export class AdobeOrgMismatchError extends Error implements FailureShape {
    public readonly code = ErrorCode.ORG_MISMATCH;

    public readonly userMessage =
        'This operation needs a different Adobe organization. ' +
        'Select the correct organization to continue.';

    /** Recoverable in the app, through the org-context guard rather than a retry. */
    public readonly recoverable = true;

    constructor(
        message = 'Adobe CLI is targeting a different organization than this operation needs.',
    ) {
        super(message);
        this.name = 'AdobeOrgMismatchError';

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

/** Structural, not textual — the test is what it IS, never what its message says. */
export function isAdobeOrgMismatch(error: unknown): error is AdobeOrgMismatchError {
    return error instanceof AdobeOrgMismatchError;
}
