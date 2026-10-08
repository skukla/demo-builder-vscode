/**
 * What a removal leaves to clean up: the pair cleanup, and keeping or handing on
 * a workspace when cleanup did not finish.
 *
 * Split from `appBuilderComponentRunner.ts` (decompose-god-file, 2026-10-07); that file keeps the
 * shared contract (`RunnerResult`, `AppBuilderComponentRunnerDeps`).
 *
 * @module features/app-builder/services/appBuilderRemovalCleanup
 */

import type { AppBuilderComponentRunnerDeps, RunnerResult } from './appBuilderComponentRunner';
import {
    checkRuntimeLeftovers,
    cleanUpBeforeUndeploy,
    type CleanupOutcome,
    type TeardownTarget,
} from './appBuilderComponentTeardown';
import type { RemoveOptions } from './appBuilderRemoveRun';
import { catalogEntryFor, entryFromState } from './componentEntry';
import { workspaceTakesLeftovers } from './componentWorkspace';
import type { AppBuilderComponentState, Project } from '@/types/base';

const NOTHING_UNFINISHED: CleanupOutcome = { unfinished: [] };

/**
 * The clean-up before the undeploy, unless it already ran: a system removed with its pair
 * (`cleanedUp`), or a removal retried after it stopped on leftovers (`removalCleanedUp`),
 * whose ERP actions the clean-up would call are gone.
 */
export function cleanUpUnlessDone(
    project: Project,
    id: string,
    state: AppBuilderComponentState,
    systems: string[],
    deps: AppBuilderComponentRunnerDeps,
    options: RemoveOptions,
): Promise<CleanupOutcome> {
    if (options.cleanedUp || state.removalCleanedUp) return Promise.resolve(NOTHING_UNFINISHED);
    return cleanUpPair(project, id, state, systems, deps);
}

/**
 * Leftovers Runtime would not delete, or a namespace that could not be checked: a workspace
 * of the component's own takes them with it when the removal deletes it (owner, 2026-09-27),
 * and the summary says which. Anywhere else the removal stops and keeps the card, the folder
 * and the workspace, so nothing is orphaned and Remove again picks up there (2026-09-26).
 */
export async function keepOrLetWorkspaceTake(
    project: Project,
    id: string,
    removing: string[],
    checked: Awaited<ReturnType<typeof checkRuntimeLeftovers>> | undefined,
    options: RemoveOptions,
    deps: AppBuilderComponentRunnerDeps,
): Promise<RunnerResult | undefined> {
    const state = project.appBuilderComponents?.[id];
    const own =
        state && workspaceTakesLeftovers(project, id, removing) ? state.workspace : undefined;
    if (!own || !checked?.stopped) {
        return state ? keepForRetry(project, state, checked, options, deps) : undefined;
    }
    checked.cleanup.goneWithWorkspace = own.title ?? own.name;
    return undefined;
}

/**
 * Stop a removal whose leftovers are not all gone, keeping everything that names them, or
 * answer undefined to let it finish. Remove anyway (`force`) finishes regardless.
 */
async function keepForRetry(
    project: Project,
    state: AppBuilderComponentState,
    checked: Awaited<ReturnType<typeof checkRuntimeLeftovers>> | undefined,
    options: RemoveOptions,
    deps: AppBuilderComponentRunnerDeps,
): Promise<RunnerResult | undefined> {
    if (!checked?.stopped || options.force) return undefined;
    state.removalStopped = checked.stopped.error;
    state.removalCleanedUp = true;
    await deps.saveProject(project);
    return { ...checked.stopped, runtimeCleanup: checked.cleanup };
}

/** The catalog entry behind a record: the catalog's, else one read off the record. */
function entryFor(
    project: Project,
    id: string,
    state: AppBuilderComponentState,
    deps: AppBuilderComponentRunnerDeps,
) {
    return catalogEntryFor(project, id, deps.catalog) ?? entryFromState(id, state);
}

/**
 * The clean-up for a component and the systems removed with it, all before any
 * undeploy, so a failure in either stops the pair with nothing removed.
 */
async function cleanUpPair(
    project: Project,
    id: string,
    state: AppBuilderComponentState,
    systems: string[],
    deps: AppBuilderComponentRunnerDeps,
): Promise<CleanupOutcome> {
    const targets: TeardownTarget[] = [
        { project, id, state, entry: entryFor(project, id, state, deps) },
    ];
    for (const systemId of systems) {
        const system = project.appBuilderComponents?.[systemId];
        if (system)
            targets.push({
                project,
                id: systemId,
                state: system,
                entry: entryFor(project, systemId, system, deps),
            });
    }
    const [own, ...rest] = await sequence(targets, (target) => cleanUpBeforeUndeploy(target, deps));
    return { ...own, unfinished: [...own.unfinished, ...rest.flatMap((r) => r.unfinished)] };
}

/** Run `fn` over `items` one at a time, in order. */
async function sequence<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = [];
    for (const item of items) results.push(await fn(item));
    return results;
}
