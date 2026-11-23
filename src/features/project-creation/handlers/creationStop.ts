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
 * The stop itself is registered here by project folder, for the whole run: an agent's
 * storefront setup and its creation share one (F275).
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

/** The stop for each creation running in this window, by project folder. */
const running = new Map<string, AbortController>();

/** One part of a run's hold on its stop. */
export interface CreationStop {
    /** Aborted by Stop, `cancel_project_creation` or the time limit. */
    readonly signal: AbortSignal;
    /** The controller behind it: a door's own Cancel aborts it (the wizard's sharedState). */
    readonly controller: AbortController;
    /** Unregister the stop, when this part registered it; a part that joined leaves it. */
    release(): void;
}

/**
 * Hold the stop for a project folder: the one already registered there, or a new one.
 *
 * The agent's door claims it when its run starts, so storefront setup and creation join
 * the same stop and `cancel_project_creation` reaches the run in either (F275). Until
 * 2026-11-18 only creation registered one, so a stop during the agent's storefront setup
 * answered "no creation running". A stop that was already used is not joined: a new run
 * on the folder (the wizard's setup started again) gets a fresh one.
 *
 * @param folder - the folder the creation builds (`creationPath`)
 * @returns this part's hold on the stop
 */
export function claimCreationStop(folder: string): CreationStop {
    const held = running.get(folder);
    const joined = held !== undefined && !held.signal.aborted;
    const controller = joined ? held : new AbortController();
    if (!joined) running.set(folder, controller);
    return {
        signal: controller.signal,
        controller,
        release: () => {
            if (!joined && running.get(folder) === controller) running.delete(folder);
        },
    };
}

/**
 * Stop the creation running on a project folder, whichever door started it and
 * whichever part of the run it is in.
 *
 * @param projectPath - the folder the creation builds (`creationPath`)
 * @returns true when a creation was running there and has been stopped
 */
export function stopCreation(projectPath: string): boolean {
    const controller = running.get(projectPath);
    if (!controller) return false;
    controller.abort();
    return true;
}
