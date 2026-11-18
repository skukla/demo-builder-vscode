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
 * Stopping ends the WAIT, as it always has in the wizard: creation's phases do not
 * read the signal, so the door's failure path (cleanup, the answer) runs at once.
 *
 * @module features/project-creation/handlers/creationRun
 */

import { executeProjectCreation } from './executor';
import { creationPath } from './executorPreflight';
import { withTimeout } from '@/core/utils/promiseUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/** The stop for each creation running in this window, by project folder. */
const running = new Map<string, AbortController>();

const TIMEOUT_MESSAGE =
    'Project creation timed out after 30 minutes. ' +
    'This may indicate a network issue or very large components. ' +
    'Please check your connection and try again.';

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
    const controller = new AbortController();
    const folder = creationPath(config);
    context.logger.debug('[Project Creation] Creating NEW AbortController', {
        previousExists: !!context.sharedState.projectCreationAbortController,
        timestamp: new Date().toISOString(),
    });
    context.sharedState.projectCreationAbortController = controller;
    running.set(folder, controller);
    try {
        await withTimeout(executeProjectCreation(context, config), {
            timeoutMs: TIMEOUTS.PROJECT_CREATION_OVERALL,
            timeoutMessage: TIMEOUT_MESSAGE,
            signal: controller.signal,
        });
    } finally {
        if (running.get(folder) === controller) running.delete(folder);
        if (context.sharedState.projectCreationAbortController === controller) {
            context.sharedState.projectCreationAbortController = undefined;
        }
    }
}

/**
 * Stop the creation running on a project folder, whichever door started it.
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
