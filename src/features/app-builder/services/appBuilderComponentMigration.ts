/**
 * Moving a project's App Builder components when its Adobe destination changes.
 *
 * The destination is PROJECT-scoped — one `organization`/`projectId`/`workspace`
 * for every integration — so a change moves them all rather than leaving some
 * behind in a Console project the project no longer points at.
 *
 * "Delete and recreate" describes the REMOTE artifacts only. The local clones do
 * not move: `deployAppBuilderComponent` re-runs a component's deploy tail with no
 * re-clone, and `teardownRemote` drops the remote entities without touching the
 * folder, the keyed state, or the API picks. `removeAppBuilderComponent` would
 * take all three, which is why this does not use it.
 *
 * @module features/app-builder/services/appBuilderComponentMigration
 */

import {
    deployAppBuilderComponent,
    teardownRemote,
    type AppBuilderComponentRunnerDeps,
} from './appBuilderComponentRunner';
import type { ProjectAdobeRef } from '@/core/shell/orgContextEnv';
import type { Project } from '@/types';

export interface MigrationResult {
    /** True only when every component reached the new destination. */
    success: boolean;
    /** Ids now live at the new destination. */
    moved: string[];
    /** Ids that never made it, with the reason. Each is still live at the OLD one. */
    failed: Array<{ id: string; error: string }>;
}

/**
 * Move every component to the destination `project.adobe` now names.
 *
 * **Recreate before delete.** Each component is deployed to the new destination
 * first and only then torn down at the old one. Reversed, a failure halfway
 * leaves it gone from both; this way it stays live where it was and the run
 * reports which ones did not move. Namespaces differ per project+workspace, so
 * being briefly live at both collides with nothing.
 *
 * A teardown failure does NOT fail the component: it is already serving from the
 * new destination, and an orphaned deployment at the old one is untidy rather
 * than broken. Same collect-don't-throw treatment `removeAppBuilderComponent`
 * gives its own teardown.
 *
 * @param project - the project, with `adobe` ALREADY holding the new destination
 * @param previous - the destination being left, from `setProjectDestination`
 * @param deps - runner deps (catalog, subscriber, logger, saveProject)
 * @returns which components moved and which did not
 */
export async function moveAppBuilderComponentsToDestination(
    project: Project,
    previous: ProjectAdobeRef | undefined,
    deps: AppBuilderComponentRunnerDeps,
): Promise<MigrationResult> {
    const ids = Object.keys(project.appBuilderComponents ?? {});
    if (ids.length === 0) {
        return { success: true, moved: [], failed: [] };
    }

    // Before any deploy: the subscribe PUT sets the workspace's APIs to EXACTLY
    // the union it is given, and this is the first reconcile against the NEW
    // workspace. Skip it and every moved component deploys into a workspace
    // subscribed to nothing it needs.
    await deps.subscribeRequiredApis(deps.catalog, project);

    const moved: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
        const state = project.appBuilderComponents?.[id];
        if (!state) continue;

        const deployed = await deployAppBuilderComponent(project, id, deps);
        if (!deployed.success) {
            // Deliberately no teardown: the component is still serving from the
            // old destination, which is the recoverable state.
            failed.push({ id, error: deployed.error ?? 'Deploy to the new destination failed.' });
            continue;
        }

        if (previous) {
            try {
                await teardownRemote({ ...project, adobe: previous } as Project, id, state, deps);
            } catch (error) {
                deps.logger.warn(
                    `[Destination] "${id}" moved, but tearing it down at the old destination` +
                        ` failed: ${(error as Error).message}`,
                );
            }
        }
        moved.push(id);
    }

    return { success: failed.length === 0, moved, failed };
}
