/**
 * Removing an App Builder component: unlist, undeploy and check, tidy the
 * project, and remove the systems it brought.
 *
 * Split from `appBuilderComponentRunner.ts` (decompose-god-file, 2026-10-07); that file keeps the
 * shared contract (`RunnerResult`, `AppBuilderComponentRunnerDeps`).
 *
 * @module features/app-builder/services/appBuilderRemoveRun
 */

import type { AppBuilderComponentRunnerDeps, RunnerResult } from './appBuilderComponentRunner';
import {
    checkRuntimeLeftovers,
    leftBehind,
    mergeCleanup,
    removalStopped,
    teardownRemote,
    type CleanupOutcome,
} from './appBuilderComponentTeardown';
import {
    notFound,
    providesStorefrontVar,
    refreshBundleQuietly,
    targetFor,
} from './appBuilderDeploySteps';
import { cleanUpUnlessDone, keepOrLetWorkspaceTake } from './appBuilderRemovalCleanup';
import { withoutComponent } from './appBuilderRemovalState';
import { listDeclaredPackageNames, listDeclaredTriggersAndRules } from './appConfigPackages';
import { catalogEntryFor } from './componentEntry';
import { releaseWorkspaces } from './componentWorkspace';
import type { CommerceDetachResult } from './erpDetach';
import type { RuntimeCleanupSummary } from './runtimeLeftoverCleanup';
import type { DeclaredRuntime } from './runtimeNamespace';
import { workspacesHeldBy, workspacesToRelease } from '@/core/state/appBuilderComponentState';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import {
    integrationUsing,
    isAddedSystem,
    systemsUsedBy,
} from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { toError } from '@/types/typeGuards';

/**
 * Remove an App Builder component: kind-dispatched remote teardown (best-effort) → delete the
 * local folder → clear `appBuilderComponents[id]` → if it provided env vars, regenerate the
 * storefront config WITHOUT them.
 */
export async function removeAppBuilderComponent(
    project: Project,
    id: string,
    deps: AppBuilderComponentRunnerDeps,
    options: RemoveOptions = {},
): Promise<RunnerResult> {
    const state = project.appBuilderComponents?.[id];
    if (!state) return notFound(id);

    // A linked system goes with its integration, whichever card asked (decision
    // 2): remove the integration, which takes its systems after it. Once the
    // integration's record is gone the link no longer resolves, so this cannot loop.
    // An ERP added from the integration's card goes on its own (AB-16), once the
    // integration no longer lists it.
    const consumerId = integrationUsing(project, id, deps.catalog);
    if (consumerId && !isAddedSystem(project, id, consumerId)) {
        return removeAppBuilderComponent(project, consumerId, deps, options);
    }
    const stillListed = consumerId
        ? await unlistFirst(project, consumerId, id, state, deps, options)
        : undefined;
    if (stillListed && !options.force) return { success: false, error: stillListed };
    // Read before the record goes: afterwards nothing says which systems it used.
    const systems = state.kind === 'integration' ? systemsUsedBy(project, id, deps.catalog) : [];
    // Same reason: once the records are cleared, nothing says which workspaces these
    // components held, and a workspace nothing names cannot be found or deleted.
    const heldWorkspaces = workspacesHeldBy(project, [id, ...systems]);

    const provided = providesStorefrontVar(state);

    // BEFORE the undeploy, while the code that does it still exists: the
    // integration's Commerce undo and uninstall (AB-4; `aio app undeploy` removes
    // only the actions, residue measured live 2026-08-27), and the records of the
    // systems that go with it. A step that fails stops the removal here, with
    // nothing undeployed, unless the SC chose to remove anyway.
    const cleanup = await cleanUpUnlessDone(project, id, state, systems, deps, options);
    const stopped = await stopIfUnfinished(project, state, cleanup, options, deps);
    if (stopped) return stopped;

    const checked = await undeployAndCheck(project, id, state, deps);
    const runtimeCleanup = checked?.cleanup;

    const kept = await keepOrLetWorkspaceTake(
        project,
        id,
        [id, ...systems],
        checked,
        options,
        deps,
    );
    if (kept) return kept;

    // A missing instance (a folder removed by hand, a half-finished add) must not
    // stop the state cleanup below: the remote side is already gone (gap 4).
    await deps.componentManager.removeComponent(project, id, true).catch((error: unknown) => {
        deps.logger.warn(
            `[AppBuilderComponent Runner] ${id} local removal skipped: ${toError(error).message}`,
        );
    });

    // Read while the record is still there: a second copy's entry comes from it.
    const removedEntry = catalogEntryFor(project, id, deps.catalog);
    const cleared = withoutComponent(project, id, state);
    await deps.saveProject(cleared);

    // AFTER the records are cleared, so "is anything still using this workspace?" is
    // asked of the project as it now stands. A bound pair shares one, and removing a
    // pair goes through the integration and takes its systems with it — so the shared
    // workspace is released exactly once, when the last holder is gone.
    const released = await releaseWorkspaces(
        cleared,
        workspacesToRelease(heldWorkspaces, cleared),
        {
            ...deps,
            progressLabel: OPERATION_STAGES.removingWorkspace.label,
        },
    );
    await tidyAfterClear(project, cleared, removedEntry, provided, deps);

    const after = await removeBoundSystemsAfter(cleared, project, id, systems, deps, options);
    return {
        ...removalResult(
            mergeCleanup(runtimeCleanup, after.runtimeCleanup),
            cleanup.commerceDetach,
            [...leftBehind(cleanup), ...released.warnings, ...after.warnings],
        ),
        ...withDeleted([...released.deleted, ...after.workspacesDeleted]),
    };
}

/** How a removal treats a clean-up that did not finish. */
export interface RemoveOptions {
    /** Remove anyway: report what did not finish instead of stopping. */
    force?: boolean;
    /** The pair's removal already ran this system's clean-up (internal). */
    cleanedUp?: boolean;
}

/**
 * Take an added system out of its integration's list before anything of it is removed, so
 * the integration never routes to a system that is gone. Answers why it could not, in words
 * that say nothing was removed; Remove anyway goes on regardless.
 */
async function unlistFirst(
    project: Project,
    integrationId: string,
    id: string,
    state: AppBuilderComponentState,
    deps: AppBuilderComponentRunnerDeps,
    options: RemoveOptions,
): Promise<string | undefined> {
    if (!deps.unlistSystem) return undefined;
    deps.onProgress?.(OPERATION_STAGES.removing.label, "Taking it off the integration's list");
    const reason = await deps.unlistSystem(project, integrationId, id);
    if (!reason) return undefined;
    const name = shownNameOf(project, id, state);
    const integration = project.appBuilderComponents?.[integrationId]?.name ?? integrationId;
    deps.logger.warn(
        `[AppBuilderComponent Runner] ${id} not taken off ${integrationId}'s list: ${reason}`,
    );
    const detail = `${integration} still lists ${name} (${reason.replace(/\.$/u, '')})`;
    return options.force
        ? undefined
        : `${detail}. Nothing was removed; Remove anyway goes on without it.`;
}

/**
 * Undeploy a component and check what Runtime kept. The declared inventory is read BEFORE
 * the undeploy and the local delete — afterwards the config files it attributes by are
 * gone. Trust nothing: `aio app undeploy` exits 0 with packages still deployed (AB-7,
 * measured live). Meshes verify through their own status flow, so they answer undefined.
 */
async function undeployAndCheck(
    project: Project,
    id: string,
    state: AppBuilderComponentState,
    deps: AppBuilderComponentRunnerDeps,
): Promise<Awaited<ReturnType<typeof checkRuntimeLeftovers>> | undefined> {
    const componentPath = project.componentInstances?.[id]?.path;
    const app = state.kind !== 'mesh';
    const declared =
        app && componentPath ? await readDeclaredRuntime(componentPath) : NO_DECLARED_RUNTIME;
    const shownName = shownNameOf(project, id, state);
    deps.onProgress?.(OPERATION_STAGES.removing.label, `Undeploying ${shownName}`);
    try {
        await teardownRemote(targetFor(project, deps, id), componentPath, state.kind, deps);
    } catch (error) {
        deps.logger.warn(
            `[AppBuilderComponent Runner] remote teardown warning: ${toError(error).message}`,
        );
    }
    if (!app) return undefined;
    deps.onProgress?.(OPERATION_STAGES.checkingLeftovers.label);
    return checkRuntimeLeftovers(targetFor(project, deps, id), id, declared, shownName, deps);
}

const NO_DECLARED_RUNTIME: DeclaredRuntime = { packages: [], triggers: [], rules: [] };

/** The name a person reads for a component: its own, else its instance's, else its id. */
function shownNameOf(project: Project, id: string, state: AppBuilderComponentState): string {
    return state.name ?? project.componentInstances?.[id]?.name ?? id;
}

/**
 * A clean-up before the undeploy that did not finish stops the removal, with nothing
 * undeployed, unless the SC chose to remove anyway; the reason is saved on the record.
 */
async function stopIfUnfinished(
    project: Project,
    state: AppBuilderComponentState,
    cleanup: CleanupOutcome,
    options: RemoveOptions,
    deps: AppBuilderComponentRunnerDeps,
): Promise<RunnerResult | undefined> {
    if (cleanup.unfinished.length === 0 || options.force) return undefined;
    const stopped = removalStopped(cleanup.unfinished);
    state.removalStopped = stopped.error;
    await deps.saveProject(project);
    return stopped;
}

/** What an app declares in Runtime; an unreadable file declares nothing of its kind. */
async function readDeclaredRuntime(componentPath: string): Promise<DeclaredRuntime> {
    const [packages, timersAndRules] = await Promise.all([
        listDeclaredPackageNames(componentPath).catch(() => []),
        listDeclaredTriggersAndRules(componentPath).catch(() => ({ triggers: [], rules: [] })),
    ]);
    return { packages, ...timersAndRules };
}

/**
 * After the records are cleared: the component's secrets go with it, its screen key and its
 * secret settings (nothing reads them again, and a secret left in SecretStorage is one
 * nobody owns, PL-64); the AI bundle drops what
 * it no longer needs (remove the last App Builder component and its skills used to stay
 * forever); and a component that provided the storefront's var earns a republish.
 */
async function tidyAfterClear(
    project: Project,
    cleared: Project,
    removedEntry: AppBuilderComponentCatalogEntry | undefined,
    provided: boolean,
    deps: AppBuilderComponentRunnerDeps,
): Promise<void> {
    if (removedEntry && deps.forgetSecrets) {
        await deps.forgetSecrets(project, removedEntry);
    }
    await refreshBundleQuietly(cleared, deps, 'remove');
    if (provided) {
        await deps.republishStorefront({
            project: cleared,
            secrets: deps.secrets,
            logger: deps.logger,
        });
    }
}

/** The deleted workspaces as a result field, only when there are any. */
function withDeleted(names: string[]): Pick<RunnerResult, 'workspacesDeleted'> {
    return names.length > 0 ? { workspacesDeleted: names } : {};
}

/** A finished removal's result, carrying only what it has to say. */
function removalResult(
    runtimeCleanup: RuntimeCleanupSummary | undefined,
    commerceDetach: CommerceDetachResult | undefined,
    candidates: (string | undefined)[],
): RunnerResult {
    const warnings = candidates.filter((w): w is string => Boolean(w));
    return {
        success: true,
        ...(runtimeCleanup ? { runtimeCleanup } : {}),
        ...(commerceDetach ? { commerceDetach } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
    };
}

/**
 * The integration is gone; the systems it used go after it (decision 2). A
 * system's records survive in the workspace's database — an undeploy removes
 * actions, not data — and come back if it is added again, which the
 * confirmation dialog says. The integration's own removal already stands, so a
 * system that fails is reported, not thrown; its cleanup and warnings are
 * handed back with the integration's (gap 3).
 */
async function removeBoundSystemsAfter(
    cleared: Project,
    caller: Project,
    integrationId: string,
    systems: string[],
    deps: AppBuilderComponentRunnerDeps,
    options: RemoveOptions,
): Promise<{
    warnings: string[];
    runtimeCleanup?: RuntimeCleanupSummary;
    workspacesDeleted: string[];
}> {
    const warnings: string[] = [];
    const workspacesDeleted: string[] = [];
    let runtimeCleanup: RuntimeCleanupSummary | undefined;
    for (const systemId of systems) {
        const name = cleared.appBuilderComponents?.[systemId]?.name ?? systemId;
        if (!cleared.appBuilderComponents?.[systemId]) continue;
        deps.onProgress?.(OPERATION_STAGES.removing.label, `Removing ${name}`);
        // A throw's own words go to the log; the SC reads a sentence of ours.
        const result = await removeAppBuilderComponent(cleared, systemId, deps, {
            ...options,
            cleanedUp: true,
        }).catch((error: unknown): RunnerResult => {
            deps.logger.warn(
                `[AppBuilderComponent Runner] ${systemId} removal threw: ${toError(error).message}`,
            );
            return { success: false, error: 'it stopped partway, and the Debug Logs say why' };
        });
        if (!result.success) {
            deps.logger.warn(
                `[AppBuilderComponent Runner] ${systemId} was not removed with ${integrationId}: ${result.error}`,
            );
            warnings.push(`${name} was not removed: ${result.error}. Remove it from its card.`);
        }
        warnings.push(...(result.warnings ?? []));
        workspacesDeleted.push(...(result.workspacesDeleted ?? []));
        runtimeCleanup = mergeCleanup(runtimeCleanup, result.runtimeCleanup);
    }
    // The caller's reference follows the later removals too.
    caller.appBuilderComponents = cleared.appBuilderComponents;
    return { warnings, runtimeCleanup, workspacesDeleted };
}
