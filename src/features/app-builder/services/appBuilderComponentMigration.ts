/**
 * Moving a project's App Builder components when its Adobe destination changes.
 *
 * The destination is PROJECT-scoped — one `organization`/`projectId`/`workspace`
 * for every component that lives in the project's workspace — so a change moves
 * them all rather than leaving some behind in a Console project the project no
 * longer points at. A component in a workspace of its own (AB-23) is not moved by
 * a change of the project's workspace within the same Adobe project; into a
 * DIFFERENT Adobe project it is removed from the old one and added in the new one,
 * after everything else has moved (`componentRelocation`, owner 2026-09-21). That is
 * the one part of a move that deletes, and the handler confirms it first.
 *
 * ## What lives in the project's workspace is deployed, never deleted
 *
 * A move deploys each such component to the new destination and LEAVES the old
 * deployment serving. Undeploy is the only irreversible step in the operation,
 * nobody asked for cleanup, and the previous namespace is a free rollback when the
 * new destination turns out wrong — worth more to a demo tool than tidiness. Idle
 * Runtime actions cost essentially nothing.
 *
 * It is also the only safe default: nothing here inspects the source, so tearing
 * down could remove a deployment another local project pointed at the same
 * destination still depends on.
 *
 * Overwriting at the TARGET is Adobe's own documented behaviour — "deploying
 * actions will overwrite any previous deployments" (aio-cli-plugin-app README) —
 * so a move simply deploys and lets that stand.
 *
 * The local clones never move either: `deployAppBuilderComponent` re-runs a
 * component's deploy tail with no re-clone.
 *
 * @module features/app-builder/services/appBuilderComponentMigration
 */

import { entriesThatNeedApis } from './apiSubscriber';
import { ownWorkspaceGroups, relocateGroup, type WorkspaceGroup } from './componentRelocation';
import {
    deployAppBuilderComponent,
    type AppBuilderComponentRunnerDeps,
} from './appBuilderComponentRunner';
import type { ProjectAdobeRef } from '@/core/shell/orgContextEnv';
import { cardInFlightLabel } from '@/core/vscode/progressRegister';
import type { Project } from '@/types/base';

/**
 * What a card is told during a move. A narrow local union rather than the
 * dashboard's `AppBuilderComponentRowStatus`: this feature must not import from
 * another feature, and a move only ever produces these three.
 */
export type MigrationRowStatus = 'deploying' | 'deployed' | 'error';

/**
 * Tell one component's card what it is doing right now.
 *
 * OPTIONAL, because the migration must stay callable without a webview. The
 * project-scoped progress notification cannot cover this: it has no owning card,
 * so without a per-component push a multi-minute move leaves every card reading
 * DEPLOYED and the grid looking idle (found by inspection 2026-08-07).
 */
export type OnMigrationRowStatus = (
    id: string,
    status: MigrationRowStatus,
    message?: string
) => void | Promise<void>;

export interface MigrationResult {
    /** True only when EVERY component reached the new destination. */
    success: boolean;
    /**
     * Ids now deployed at the NEW destination. On an abort this names the ones
     * that already landed — they stay there, and saying so beats pretending the
     * run left no trace.
     */
    moved: string[];
    /** What aborted the move. */
    failed: Array<{ id: string; error: string }>;
    /** True when an abort pointed the project back at the previous destination. */
    rolledBack?: boolean;
}

/**
 * Deploy every component to the destination `project.adobe` now names.
 *
 * @param project - the project, with `adobe` ALREADY holding the new destination
 * @param previous - the destination being left, from `setProjectDestination`
 * @param deps - runner deps (catalog, subscriber, logger, saveProject)
 * @param onRowStatus - optional per-card channel; see {@link OnMigrationRowStatus}
 * @returns which components reached the new destination, and what stopped it
 */
export async function moveAppBuilderComponentsToDestination(
    project: Project,
    previous: ProjectAdobeRef | undefined,
    deps: AppBuilderComponentRunnerDeps,
    onRowStatus?: OnMigrationRowStatus,
): Promise<MigrationResult> {
    const ids = projectWorkspaceIds(project);
    // A component in a workspace of its own moves only when the Adobe project
    // changes: its workspace belongs to the Adobe project being left (AB-23).
    const groups = previous && !sameAdobeProject(previous, project.adobe) ? ownWorkspaceGroups(project) : [];
    if ((ids.length === 0 && groups.length === 0) || sameDestination(previous, project.adobe)) {
        return { success: true, moved: [], failed: [] };
    }

    // Mark EVERY card before any slow work, including the subscribe. Marking each
    // one inside the loop instead left the whole grid reading DEPLOYED until the
    // subscribe round trip returned — reported live 2026-08-07 as "I see the move
    // happening, but the cards still just say Deployed". The move is in flight for
    // all of them from this point, so saying so is accurate as well as faster.
    for (const id of [...ids, ...groups.flatMap((group) => group.members)]) {
        const entry = project.appBuilderComponents?.[id];
        if (entry) await onRowStatus?.(id, 'deploying', inFlightLabelFor(entry.kind));
    }

    // Everything a successful deploy will WRITE, captured before the first one runs.
    //
    // `recordDeployOutcome` persists namespace-scoped `endpoint`/`url`/
    // `deployedUrls` onto the keyed entry and mirrors status onto the component
    // instance. Reverting `project.adobe` alone left those naming the destination
    // the move abandoned, so after an abort the header said one Console project
    // while the mesh card offered an Endpoint in another (live 2026-08-08).
    const before = {
        components: structuredClone(project.appBuilderComponents ?? {}),
        instances: structuredClone(project.componentInstances ?? {}),
    };
    // Abort. Nothing was destroyed remotely, so undoing is bookkeeping: point the
    // project back and restore every record the deploys wrote. No redeploy, no
    // teardown. The restored values are TRUE, not merely older: the previous
    // deployment was never removed, so its endpoint is still serving.
    const rollBack = async (failure: { id: string; error: string }, moved: string[]) => {
        if (previous) {
            project.adobe = previous as Project['adobe'];
            project.appBuilderComponents = before.components;
            project.componentInstances = before.instances;
            await deps.saveProject(project);
            await restoreStorefront(project, deps);
        }
        return { success: false, moved, failed: [failure], rolledBack: Boolean(previous) };
    };

    // Before any deploy: the subscribe PUT sets the workspace's APIs to EXACTLY
    // the union it is given, and this is the first reconcile against the NEW
    // workspace. Skip it and every moved component deploys into a workspace
    // subscribed to nothing it needs.
    //
    // Only what runs in the project's workspace: a component with a workspace of
    // its own is subscribed there, and its APIs on this credential would be
    // entitlements nothing here uses (AB-23).
    const onProjectWorkspace = entriesThatNeedApis(deps.catalog, project).filter(
        (entry) => !project.appBuilderComponents?.[entry.id]?.workspace,
    );
    await deps.subscribeRequiredApis(onProjectWorkspace, project);

    const moved: string[] = [];
    for (const id of ids) {
        if (!project.appBuilderComponents?.[id]) continue;

        const deployed = await deployAppBuilderComponent(project, id, deps);
        if (!deployed.success) {
            await onRowStatus?.(id, 'error', deployed.error);
            return rollBack({ id, error: deployed.error ?? 'Deploy to the new destination failed.' }, moved);
        }
        // Settle this card as it lands rather than batching at the end — that
        // per-component sequencing IS the feedback a project-scoped notification
        // cannot give.
        await onRowStatus?.(id, 'deployed');
        moved.push(id);
    }

    return relocateAll(project, groups, previous as ProjectAdobeRef, { deps, onRowStatus, moved, rollBack });
}

/**
 * Move each own-workspace group into the new Adobe project, after everything in the
 * project's workspace has landed.
 *
 * Until a group's old side is gone the whole move can still be rolled back, and is
 * when the first group cannot be cleaned up. After that there is nothing to go back
 * to, so a failure is reported against its component and the move carries on.
 */
async function relocateAll(
    project: Project,
    groups: WorkspaceGroup[],
    previous: ProjectAdobeRef,
    run: {
        deps: AppBuilderComponentRunnerDeps;
        onRowStatus?: OnMigrationRowStatus;
        moved: string[];
        rollBack: (failure: { id: string; error: string }, moved: string[]) => Promise<MigrationResult>;
    },
): Promise<MigrationResult> {
    const { deps, onRowStatus, moved } = run;
    const failed: MigrationResult['failed'] = [];
    let anyReleased = false;
    for (const group of groups) {
        const result = await relocateGroup(project, group, previous, deps);
        moved.push(...result.moved);
        for (const id of result.moved) await onRowStatus?.(id, 'deployed');
        if (!result.failed) {
            anyReleased = true;
            continue;
        }
        await onRowStatus?.(result.failed.id, 'error', result.failed.error);
        if (!result.released && !anyReleased) return run.rollBack(result.failed, moved);
        anyReleased ||= result.released;
        failed.push(result.failed);
    }
    return failed.length > 0
        ? { success: false, moved, failed, rolledBack: false }
        : { success: true, moved, failed: [] };
}

/**
 * The components that live in the project's workspace — every one without a
 * workspace of its own (AB-23), which a change of the project's workspace does not
 * touch.
 *
 * @param project - the project
 * @returns their ids
 */
function projectWorkspaceIds(project: Project): string[] {
    return Object.entries(project.appBuilderComponents ?? {})
        .filter(([, state]) => !state.workspace)
        .map(([id]) => id);
}

/** Whether two destinations are in the same Adobe project. */
function sameAdobeProject(a: ProjectAdobeRef, b: ProjectAdobeRef | undefined): boolean {
    return a.projectId === b?.projectId;
}

/**
 * Re-publish the storefront against the RESTORED endpoints.
 *
 * A deploy of a component that provides env vars republishes the storefront with
 * its new endpoint (`republishIfProvided` inside the runner). That is the one part
 * of a move visible outside this extension, so an abort that skips it leaves the
 * storefront calling the abandoned destination's mesh while every local record
 * says otherwise.
 *
 * Best-effort: the records are already correct by the time this runs, and a
 * publish failure must not turn a handled abort into an unhandled throw.
 *
 * @param project - the project, with records already restored
 * @param deps - runner deps (supplies `republishStorefront`)
 */
async function restoreStorefront(
    project: Project,
    deps: AppBuilderComponentRunnerDeps,
): Promise<void> {
    try {
        await deps.republishStorefront({
            project,
            secrets: deps.secrets,
            logger: deps.logger,
        });
    } catch (error) {
        deps.logger.warn(
            '[Destination] Rolled back locally, but re-publishing the storefront failed. It may'
                + ` still point at the abandoned destination: ${(error as Error).message}`,
        );
    }
}

/**
 * The card's in-flight line for a component kind.
 *
 * Built with `cardInFlightLabel` rather than composed here, so a move reads
 * exactly like a single redeploy of the same component.
 *
 * @param kind - the keyed entry's kind
 * @returns e.g. "Deploying Mesh"
 */
function inFlightLabelFor(kind: string | undefined): string {
    return cardInFlightLabel('Deploying', kind === 'mesh' ? 'Mesh' : 'Integration');
}

/**
 * Whether two destinations name the same Adobe project AND workspace.
 *
 * Org is not compared: a destination change moves within the org (sign-in owns org
 * selection), so project+workspace is the whole identity of a deploy target.
 *
 * @param a - one destination, or undefined
 * @param b - the other
 * @returns true when both are present and address the same target
 */
function sameDestination(a: ProjectAdobeRef | undefined, b: ProjectAdobeRef | undefined): boolean {
    if (!a || !b) return false;
    return a.projectId === b.projectId && a.workspace === b.workspace;
}
