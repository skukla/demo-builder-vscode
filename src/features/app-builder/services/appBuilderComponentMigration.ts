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
    /** True only when EVERY component reached the new destination. */
    success: boolean;
    /** Ids now live at the new destination. Empty after an abort — see `rolledBack`. */
    moved: string[];
    /** What aborted the move. */
    failed: Array<{ id: string; error: string }>;
    /**
     * True when an abort was fully undone: every component that had already moved
     * is back at the old destination and the project points there again.
     */
    rolledBack?: boolean;
    /**
     * Components the rollback could NOT restore. Non-empty means the project is
     * genuinely inconsistent — these are gone from the old destination and may or
     * may not be at the new one. Never report a clean abort while this has entries.
     */
    stranded?: Array<{ id: string; error: string }>;
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

    // The destination being moved TO, captured before a rollback reverts
    // `project.adobe` — the rollback tears the moved components down here.
    const destination = project.adobe ? { ...project.adobe } : undefined;
    const moved: string[] = [];

    for (const id of ids) {
        const state = project.appBuilderComponents?.[id];
        if (!state) continue;

        const deployed = await deployAppBuilderComponent(project, id, deps);
        if (!deployed.success) {
            // All-or-nothing: a half-moved project is the worst outcome, so undo
            // whatever already moved rather than leaving the set split across two
            // Console projects. This component needs no undo — its deploy failed,
            // so it never left the old destination.
            const stranded = await rollback(project, moved, previous, destination, deps);
            return {
                success: false,
                moved: [],
                failed: [
                    { id, error: deployed.error ?? 'Deploy to the new destination failed.' },
                ],
                rolledBack: stranded.length === 0,
                stranded,
            };
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

    return { success: true, moved, failed: [] };
}

/**
 * Put already-moved components back, and point the project at the old destination.
 *
 * A move is deploy-to-new then teardown-at-old, so undoing one is the same
 * operation reversed: deploy back to the old destination, then tear it down at
 * the new one. Walked in reverse order, so the most recently moved is restored
 * first.
 *
 * A component whose restore DEPLOY fails is not torn down at the new
 * destination — it is the only copy left, and removing it would turn a failed
 * rollback into data loss.
 *
 * @param project - the project; its `adobe` is reverted to `previous` here
 * @param moved - ids already moved, in the order they moved
 * @param previous - the destination to restore to
 * @param destination - the destination being abandoned (where teardown happens)
 * @param deps - runner deps
 * @returns components that could NOT be restored — empty means a clean undo
 */
async function rollback(
    project: Project,
    moved: string[],
    previous: ProjectAdobeRef | undefined,
    destination: ProjectAdobeRef | undefined,
    deps: AppBuilderComponentRunnerDeps,
): Promise<Array<{ id: string; error: string }>> {
    // No previous destination means nothing was ever torn down, so nothing is
    // missing and there is nowhere to put anything back to.
    if (!previous || moved.length === 0) {
        return [];
    }

    // Reverting FIRST is what makes the restore deploys target the old
    // destination — `deployAppBuilderComponent` resolves `project.adobe`.
    project.adobe = previous as Project['adobe'];

    const stranded: Array<{ id: string; error: string }> = [];
    for (const id of [...moved].reverse()) {
        const state = project.appBuilderComponents?.[id];
        if (!state) continue;

        const restored = await deployAppBuilderComponent(project, id, deps);
        if (!restored.success) {
            stranded.push({ id, error: restored.error ?? 'Could not restore.' });
            continue;
        }

        if (destination) {
            try {
                await teardownRemote({ ...project, adobe: destination } as Project, id, state, deps);
            } catch (error) {
                deps.logger.warn(
                    `[Destination] "${id}" was restored, but tearing it down at the abandoned`
                        + ` destination failed: ${(error as Error).message}`,
                );
            }
        }
    }

    await deps.saveProject(project);
    return stranded;
}
