/**
 * Moving a project's App Builder components when its Adobe destination changes.
 *
 * The destination is PROJECT-scoped — one `organization`/`projectId`/`workspace`
 * for every integration — so a change moves them all rather than leaving some
 * behind in a Console project the project no longer points at.
 *
 * ## It deploys, and it never deletes
 *
 * A move deploys each component to the new destination and LEAVES the old
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
    const ids = Object.keys(project.appBuilderComponents ?? {});
    if (ids.length === 0 || sameDestination(previous, project.adobe)) {
        return { success: true, moved: [], failed: [] };
    }

    // Mark EVERY card before any slow work, including the subscribe. Marking each
    // one inside the loop instead left the whole grid reading DEPLOYED until the
    // subscribe round trip returned — reported live 2026-08-07 as "I see the move
    // happening, but the cards still just say Deployed". The move is in flight for
    // all of them from this point, so saying so is accurate as well as faster.
    for (const id of ids) {
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

    // Before any deploy: the subscribe PUT sets the workspace's APIs to EXACTLY
    // the union it is given, and this is the first reconcile against the NEW
    // workspace. Skip it and every moved component deploys into a workspace
    // subscribed to nothing it needs.
    await deps.subscribeRequiredApis(deps.catalog, project);

    const moved: string[] = [];
    for (const id of ids) {
        if (!project.appBuilderComponents?.[id]) continue;

        const deployed = await deployAppBuilderComponent(project, id, deps);
        if (!deployed.success) {
            await onRowStatus?.(id, 'error', deployed.error);
            // Abort. Nothing was destroyed remotely, so undoing is bookkeeping: point
            // the project back and restore every record the deploys wrote. No
            // redeploy, no teardown, and the "gone from both" state cannot occur.
            //
            // The restored values are TRUE, not merely older: the previous
            // deployment was never removed, so its endpoint is still serving.
            if (previous) {
                project.adobe = previous as Project['adobe'];
                project.appBuilderComponents = before.components;
                project.componentInstances = before.instances;
                await deps.saveProject(project);
                await restoreStorefront(project, deps);
            }
            return {
                success: false,
                moved,
                failed: [{ id, error: deployed.error ?? 'Deploy to the new destination failed.' }],
                rolledBack: Boolean(previous),
            };
        }
        // Settle this card as it lands rather than batching at the end — that
        // per-component sequencing IS the feedback a project-scoped notification
        // cannot give.
        await onRowStatus?.(id, 'deployed');
        moved.push(id);
    }

    return { success: true, moved, failed: [] };
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
