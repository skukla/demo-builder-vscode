/**
 * Updating an integration and the systems it uses as a PAIR (owner, 2026-09-18).
 *
 * The pair's code changes together, so updating one half alone leaves a
 * mismatch nothing warns about. From either member's id, `pairUpdateOrder`
 * names what updates and in what order: the systems first (the order the pair
 * is added in, since the integration reads the system's address), then the
 * integration, each when it has newer code recorded OR its last deploy failed,
 * so the pair ends deployed. The member asked for is always included, so an
 * update check that is out of date still fetches it.
 *
 * `updateIntegrationPair` runs that order: every member the update covers says
 * so at once (the first updates, the rest wait their turn), a failed member
 * stops the rest and says what it left alone. Extracted from the dashboard's
 * update handler (AB-73) so the extension's update check can run the same
 * update for any project, not only the open one. The guard chain runs BEFORE
 * this, at the boundary that calls it.
 *
 * @module features/app-builder/services/integrationPairUpdate
 */

import {
    updateAppBuilderComponent,
    type AppBuilderComponentRunnerDeps,
    type RunnerResult,
} from './appBuilderComponentRunner';
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { integrationUsing, systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import type { AppBuilderComponentRowStatus, OperationPosition } from '@/types/webviewPayloads';

export interface PairUpdateDeps {
    /**
     * The runner deps for one member. `position` says which of the pair this
     * member is, for a progress line that names it; undefined for a lone update.
     */
    runnerDepsFor: (position: OperationPosition | undefined) => Promise<AppBuilderComponentRunnerDeps>;
    /** Tell a member's card what it is doing (the grid, when the project is open). */
    postRowStatus: (id: string, status: AppBuilderComponentRowStatus, message?: string) => Promise<void>;
}

/** What a member's name is to the SC: its recorded name, else its id. */
export function componentNameOf(project: Project, id: string): string {
    return getAppBuilderComponent(project, id)?.name ?? id;
}

function needsUpdate(project: Project, id: string): boolean {
    const state = getAppBuilderComponent(project, id);
    return Boolean(state?.updateAvailable) || state?.status === 'error';
}

/**
 * What an update asked for `id` updates, in order: the systems of its pair, then
 * the integration, each when it has newer code recorded or its last deploy
 * failed. The member asked for is always included.
 */
export function pairUpdateOrder(
    project: Project,
    id: string,
    catalog: readonly AppBuilderComponentCatalogEntry[],
): string[] {
    const integrationId = getAppBuilderComponent(project, id)?.kind === 'system'
        ? integrationUsing(project, id, catalog)
        : id;
    const members = integrationId ? [...systemsUsedBy(project, integrationId, catalog), integrationId] : [id];
    return members.filter((member) => member === id || needsUpdate(project, member));
}

/** Update one member, telegraphing its row, with deps built for its place in the pair. */
async function updateOne(
    project: Project,
    id: string,
    position: OperationPosition | undefined,
    deps: PairUpdateDeps,
): Promise<RunnerResult> {
    await deps.postRowStatus(id, 'deploying', 'Updating');
    const result = await updateAppBuilderComponent(project, id, await deps.runnerDepsFor(position));
    if (result.success) {
        await deps.postRowStatus(id, 'deployed');
    } else {
        await deps.postRowStatus(id, 'error', result.error);
    }
    return result;
}

/** Cards that were waiting go back to their own status, saying why nothing happened. */
async function releaseWaiting(project: Project, ids: string[], failedName: string, deps: PairUpdateDeps): Promise<void> {
    for (const id of ids) {
        const status = getAppBuilderComponent(project, id)?.status ?? 'not-deployed';
        await deps.postRowStatus(id, status, `Left as it is: ${failedName} did not update.`);
    }
}

/**
 * Update each member of `order` in turn; the first failure stops the rest and
 * says what it left alone.
 *
 * @param project - the project the pair is in
 * @param order - the members to update, in order (`pairUpdateOrder`)
 * @param deps - the runner deps per member and where row statuses go
 * @returns the last member's result, or the failure that stopped the pair
 */
export async function updateIntegrationPair(
    project: Project,
    order: string[],
    deps: PairUpdateDeps,
): Promise<RunnerResult> {
    // Every card the update covers says so at once: the first updates, the rest
    // wait their turn (owner, 2026-09-18).
    for (const waiting of order.slice(1)) {
        await deps.postRowStatus(waiting, 'deploying', 'Waiting to update');
    }
    let last: RunnerResult = { success: true };
    for (const [index, memberId] of order.entries()) {
        // A pair updates two things back to back: each one's reports say which.
        const position =
            order.length > 1
                ? { index: index + 1, total: order.length, name: componentNameOf(project, memberId) }
                : undefined;
        last = await updateOne(project, memberId, position, deps);
        const rest = order.slice(index + 1);
        if (!last.success && rest.length > 0) {
            const failedName = componentNameOf(project, memberId);
            await releaseWaiting(project, rest, failedName, deps);
            const left = rest.map((restId) => componentNameOf(project, restId)).join(' and ');
            const why = last.error ?? 'no reason given';
            return { success: false, error: `${failedName} did not update, so ${left} was left as it is: ${why}` };
        }
    }
    return last;
}
