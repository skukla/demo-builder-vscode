/**
 * The creation run: where a project creation gets its time limit and its stop.
 *
 * Every door that creates a project starts it here: the wizard's `create-project`
 * handler and the agent's `create_project`, `create_project_from_file` and
 * `copy_project`. Until 2026-11-18 the wizard wrapped creation in the limit and an
 * abort controller itself and the agent called creation bare, so an agent creation
 * that hung never ended and nothing could stop it (PL-104 fix 14). The limit and the
 * stop belong to the run, so a door cannot skip them.
 *
 * Stopping lets the running step finish (F274). Stop and the limit abort the run's
 * controller; creation checks it before each step (`creationStop.ts`), so no further
 * step starts. The run answers only once the running step has ended, so the door's
 * cleanup, which runs on that answer, sees and removes what the step made. Until
 * 2026-11-18 the stop ended only the wait: the door cleaned up at once while the step
 * carried on and the steps after it still ran, making things nothing removed. A step
 * that never ends is waited for `PROJECT_CREATION_STOP_GRACE`; then the run answers
 * anyway, and its error says a step was still running.
 *
 * @module features/project-creation/handlers/creationRun
 */

import { creationReporter } from './creationProgress';
import { startCreationLimit } from './creationLimit';
import { claimCreationStop, creationCancelledError } from './creationStop';
import { executeProjectCreation } from './executor';
import { creationPath } from './executorPreflight';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { TimeoutError } from '@/core/utils/timeoutError';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

const TIMEOUT_MESSAGE =
    'Project creation timed out after 30 minutes. ' +
    'This may indicate a network issue or very large components. ' +
    'Please check your connection and try again.';

const STILL_RUNNING_NOTE =
    ' A step was still running when the cleanup started, so it may have left something behind.';

/**
 * Run one creation under the 30-minute limit, stoppable by its project folder
 * (`stopCreation`) or by the context's controller (the wizard's Cancel).
 *
 * @param context - the door's handler context; its `sharedState` holds the controller
 * @param config - the creation config, as `buildProjectConfig` assembled it
 * @throws the creation's own error, a timeout, or a cancellation
 */
export async function runCreation(
    context: HandlerContext,
    config: ProjectCreationConfig,
): Promise<void> {
    // The run's stop: the one the door already holds (an agent's run, whose storefront
    // setup came first, F275), or a new one registered for this folder.
    const stop = claimCreationStop(creationPath(config));
    const { controller } = stop;
    context.logger.debug('[Project Creation] Creating NEW AbortController', {
        previousExists: !!context.sharedState.projectCreationAbortController,
        timestamp: new Date().toISOString(),
    });
    context.sharedState.projectCreationAbortController = controller;
    const startedAt = Date.now();
    // The limit counts the time the run works, not the time it waits on the SC (F307).
    const limit = startCreationLimit(TIMEOUTS.PROJECT_CREATION_OVERALL, TIMEOUT_MESSAGE, controller.signal);
    const creation = executeProjectCreation(context, config, controller.signal);
    try {
        await Promise.race([creation, limit.expired, cancelledBy(controller.signal)]);
    } catch (error) {
        // The creation's own error: it has already ended, so there is nothing to wait for.
        if (!controller.signal.aborted && !(error instanceof TimeoutError)) throw error;
        controller.abort(); // the limit stops the steps too
        throw await afterRunningStep(context, creation, error, startedAt);
    } finally {
        limit.stop();
        stop.release();
        if (context.sharedState.projectCreationAbortController === controller) {
            context.sharedState.projectCreationAbortController = undefined;
        }
    }
}


/**
 * Wait for the step that was running when the run was stopped, saying so meanwhile.
 *
 * @param context - the door's context, for the progress line and the log
 * @param creation - the stopped creation, which ends at its next step boundary
 * @param error - the stop or the timeout the run answers with
 * @param startedAt - when the run began, so the screen's clock carries on
 * @returns that error, noting a step still running if the wait ran out first
 */
async function afterRunningStep(
    context: HandlerContext,
    creation: Promise<void>,
    error: unknown,
    startedAt: number,
): Promise<unknown> {
    // Creation's own reporter, to the screen and to an agent; line 2 is the stage's detail.
    creationReporter(context.sendMessage, startedAt).report(
        OPERATION_STAGES.stoppingCreation.label,
        0,
    );
    if (await endsWithin(creation, TIMEOUTS.PROJECT_CREATION_STOP_GRACE)) return error;
    context.logger.warn('[Project Creation] A step was still running when the stop wait ran out');
    if (error instanceof Error) error.message += STILL_RUNNING_NOTE;
    return error;
}

/** Rejects with the cancelled error once the run is stopped. */
function cancelledBy(signal: AbortSignal): Promise<never> {
    return new Promise<never>((_resolve, reject) => {
        if (signal.aborted) reject(creationCancelledError());
        else signal.addEventListener('abort', () => reject(creationCancelledError()), { once: true });
    });
}

/** Whether a promise settles, either way, within `ms`. */
async function endsWithin(promise: Promise<void>, ms: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outOfTime = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
    });
    const ended = promise.then(
        () => true,
        () => true,
    );
    try {
        return await Promise.race([ended, outOfTime]);
    } finally {
        clearTimeout(timer);
    }
}
