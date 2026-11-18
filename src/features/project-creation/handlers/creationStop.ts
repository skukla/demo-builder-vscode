/**
 * A creation's step boundaries: where a stopped creation ends.
 *
 * Stop (the wizard's Cancel, the agent's `cancel_project_creation`) and the 30-minute
 * limit abort the run's controller (`creationRun.ts`). A step that is running is not
 * interrupted: it finishes, and the creation ends at the boundary after it, so no
 * further step starts and the cleanup that follows sees everything that was made
 * (F274). Before 2026-11-18 no step read the signal, and the steps after a stop still
 * ran, after the cleanup.
 *
 * @module features/project-creation/handlers/creationStop
 */

import { ErrorCode } from '@/types/errorCodes';

/** The message a stopped creation ends with; the doors read it as a cancellation. */
const CREATION_CANCELLED_MESSAGE = 'Project creation cancelled by user';

/**
 * The error a stopped creation ends with: coded CANCELLED, as `withTimeout` codes a
 * cancelled wait, so every door reads it the same way.
 *
 * @returns the error
 */
export function creationCancelledError(): Error & { code: ErrorCode } {
    return Object.assign(new Error(CREATION_CANCELLED_MESSAGE), { code: ErrorCode.CANCELLED });
}

/**
 * The check a creation makes before each step starts.
 *
 * @param signal - the run's stop; none means the creation cannot be stopped
 * @returns a check that throws the cancelled error once the run has been stopped
 */
export function stepBoundary(signal: AbortSignal | undefined): () => void {
    return () => {
        if (signal?.aborted) throw creationCancelledError();
    };
}
