/**
 * Redeploying and updating an App Builder component already in a project.
 *
 * Split from `appBuilderComponentRunner.ts` (decompose-god-file, 2026-10-07); that file keeps the
 * shared contract (`RunnerResult`, `AppBuilderComponentRunnerDeps`).
 *
 * @module features/app-builder/services/appBuilderRedeployRun
 */

import type { AppBuilderComponentRunnerDeps, RunnerResult } from './appBuilderComponentRunner';
import { dispatchDeploy } from './appBuilderDeployDispatch';
import { recordDeployOutcome } from './appBuilderDeployOutcome';
import {
    buildDefinition,
    errorOutcome,
    installIfAppManagement,
    listSystemsAfterDeploy,
    readableFailure,
    republishIfProvided,
    targetFor,
    notFound,
    withWarnings,
} from './appBuilderDeploySteps';
import { catalogEntryFor, entryFromState } from './componentEntry';
import { entriesSharingWorkspace } from './componentWorkspace';
import { resolveDeployInputs, resolveDisplayName } from './deployInputs';
import type { SourceUpdateResult } from './integrationSourceUpdate';
import { nodeForAppBuilderEntry } from '@/core/shell/demoBuilderNode';
import { withOrgContext } from '@/core/shell/orgContextEnv';
import { clearUpdateAvailable, runsOlderCode } from '@/core/state/appBuilderComponentState';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { toError } from '@/types/typeGuards';

/** The component's keyed record and its folder: a redeploy and an update need both. */
function installedComponent(project: Project, id: string) {
    const existing = project.appBuilderComponents?.[id];
    const componentPath = project.componentInstances?.[id]?.path;
    return existing && componentPath ? { existing, componentPath } : undefined;
}

/**
 * Redeploy ONLY the given appBuilderComponent's tail (no re-clone), under org-context.
 * Touches only its own entry.
 */
export async function deployAppBuilderComponent(
    project: Project,
    id: string,
    deps: AppBuilderComponentRunnerDeps,
): Promise<RunnerResult> {
    const found = installedComponent(project, id);
    if (!found) return notFound(id);
    const { existing, componentPath } = found;

    const entry = catalogEntryFor(project, id, deps.catalog) ?? entryFromState(id, existing);

    try {
        // Transient in-flight marker (see addAppBuilderComponent): without it
        // the PREVIOUS outcome — often an error — reads as current for the
        // whole run. Saved BEFORE the preparation steps: the API subscribe alone
        // ran two minutes on Bodea (2026-09-19) under a tile still reading
        // "Deploy failed".
        existing.status = 'deploying';
        existing.error = undefined;
        await deps.saveProject(project);

        const node = nodeForAppBuilderEntry(entry);
        deps.onProgress?.(OPERATION_STAGES.preparingNode.label, `Node ${node}`);
        const nodeError = await deps.ensureNodeVersion?.(node);
        if (nodeError) {
            // Thrown so the catch below records it — the marker is already saved.
            throw new Error(nodeError);
        }

        // App Management redeploys re-run the union subscribe (adds always did):
        // the S2S credential these apps deploy with may be freshly created, and
        // an unsubscribed credential is not ENTITLED to the IMS scopes its
        // actions request (the baseline AdobeIOManagementAPISDK carries
        // adobeio_api). Idempotent reconcile — a subscribed credential is a
        // no-op PUT of the same union.
        if (entry.lifecycle === 'app-management') {
            deps.onProgress?.(OPERATION_STAGES.subscribingApis.label);
            await deps.subscribeRequiredApis(
                entriesSharingWorkspace(deps.catalog, project, entry),
                project,
                (step) => deps.onProgress?.(OPERATION_STAGES.subscribingApis.label, step),
                { forComponent: entry.id },
            );
        }

        const since = new Date().toISOString();
        const deployed = await withOrgContext(targetFor(project, deps, entry.id), () =>
            dispatchDeploy(project, entry, componentPath, deps),
        );
        if (!deployed.ok) {
            // Persist the failure — without this the transient 'deploying'
            // marker above would outlive a FAILED redeploy and read as stuck
            // (measured live 2026-08-27: manifest said deploying while the
            // handler had already returned the build error). The add path has
            // always persisted its error outcome; this makes redeploy match.
            const name =
                existing.name ?? resolveDisplayName(entry, resolveDeployInputs(project, entry));
            const reason = readableFailure(deployed.error, deps.logger);
            recordDeployOutcome(project, entry.kind, id, errorOutcome(entry, reason, name));
            await deps.saveProject(project);
            return { success: false, error: reason };
        }
        recordDeployOutcome(project, entry.kind, id, deployed.outcome);
        await deps.saveProject(project);
        const listed = await listSystemsAfterDeploy(project, entry, deps);
        await installIfAppManagement(project, entry, deps, { componentPath, since });
        return withWarnings(
            deployed.warning,
            listed,
            await republishIfProvided(project, entry.id, deps),
        );
    } catch (error) {
        deps.logger.error('[AppBuilderComponent Runner] deploy failed', error as Error);
        const reason = readableFailure(toError(error).message, deps.logger);
        // Record it, as the deploy-failure path above does. A failure before the
        // deploy (the API subscribe, most often) left the tile on an OLDER run's
        // error — Bodea's integration showed a two-day-old 403 over that day's
        // "requires selection of a product" (2026-09-19). Best-effort: the save
        // itself may be what failed, and the caller must still get this answer.
        const name =
            existing.name ?? resolveDisplayName(entry, resolveDeployInputs(project, entry));
        recordDeployOutcome(project, entry.kind, id, errorOutcome(entry, reason, name));
        await deps
            .saveProject(project)
            .catch((saveError: unknown) =>
                deps.logger.warn(
                    `[AppBuilderComponent Runner] could not record ${id}'s failure: ${toError(saveError).message}`,
                ),
            );
        return { success: false, error: reason };
    }
}

/**
 * Update an integration: bring its clone up to its branch on GitHub, install
 * the new version's dependencies, then redeploy (whose install pass upgrades
 * the app in Commerce). Refuses when the clone holds the SC's own changes.
 *
 * An already-current clone is still redeployed when the version installed in
 * Commerce differs from the one in the clone (code pulled by other means).
 */
export async function updateAppBuilderComponent(
    project: Project,
    id: string,
    deps: AppBuilderComponentRunnerDeps,
): Promise<RunnerResult> {
    const found = installedComponent(project, id);
    if (!found) return notFound(id);
    const { existing, componentPath } = found;
    if (!deps.fetchComponentSource || !deps.installComponentDependencies) {
        return { success: false, error: 'Updating integrations is not available here.' };
    }
    const entry = catalogEntryFor(project, id, deps.catalog) ?? entryFromState(id, existing);

    deps.onProgress?.(OPERATION_STAGES.fetchingUpdate.label);
    const fetched = await deps.fetchComponentSource(
        componentPath,
        existing.source.branch ?? 'main',
    );
    if (fetched.status === 'refused' || fetched.status === 'failed') {
        return { success: false, error: fetched.detail };
    }
    // A current clone is not a current APP. An earlier Update that fetched the code
    // and then failed to deploy left the clone current, and this shortcut answered
    // "nothing to do": once on a status left at 'error' (2026-09-18), and once on a
    // commit the running app never got (AB-71, 2026-10-09). Both redeploy now.
    const fetchedEarlier = runsOlderCode(existing.deployedCommit, fetched.to);
    if (fetched.status === 'current' && existing.status !== 'error' && !fetchedEarlier) {
        const onDisk = await deps.readAppVersion?.(componentPath);
        const installed = existing.installation?.version;
        if (!onDisk || onDisk === installed) {
            await forgetUpdate(project, id, deps);
            return { success: true, detail: fetched.detail };
        }
    } else {
        await rememberRunningCommit(project, existing, fetched, deps);
        deps.onProgress?.(OPERATION_STAGES.installingUpdateDependencies.label);
        const dependencies = await deps.installComponentDependencies(
            componentPath,
            buildDefinition(entry),
            nodeForAppBuilderEntry(entry),
        );
        if (!dependencies.success) {
            return {
                success: false,
                error: `${fetched.detail} Its dependencies did not install: ${dependencies.error ?? 'no reason given'}`,
            };
        }
    }
    const deployed = await deployAppBuilderComponent(project, id, deps);
    if (!deployed.success) {
        return deployed;
    }
    await forgetUpdate(project, id, deps);
    const detail =
        fetched.status === 'current' ? redeployedDetail(fetched.to, fetchedEarlier) : fetched.detail;
    return { ...deployed, detail };
}

/** How much of a commit an answer names, as git's own short form does. */
const SHORT_COMMIT = 7;

/**
 * What an update that found the clone current says once it has deployed anyway: the
 * code was fetched by an earlier update whose deploy failed, or the last deploy failed,
 * or Commerce holds an older version. "Already up to date" would be false.
 */
function redeployedDetail(commit: string | undefined, fetchedEarlier: boolean): string {
    if (fetchedEarlier && commit) {
        return `Deployed ${commit.slice(0, SHORT_COMMIT)}, which an earlier update fetched but did not deploy.`;
    }
    return 'The code was already current; deployed it again so the running app matches.';
}

/**
 * A record from before `deployedCommit` existed trusts its clone, so the commit the
 * clone moved FROM is the one running. Record it before anything can fail: a deploy
 * that then fails leaves it, and the next update sees code that never went live.
 */
async function rememberRunningCommit(
    project: Project,
    state: AppBuilderComponentState,
    fetched: SourceUpdateResult,
    deps: AppBuilderComponentRunnerDeps,
): Promise<void> {
    if (fetched.status !== 'updated' || state.deployedCommit || !fetched.from) return;
    state.deployedCommit = fetched.from;
    await deps.saveProject(project);
}

/** A finished update leaves nothing to offer; drop the recorded one. */
async function forgetUpdate(
    project: Project,
    id: string,
    deps: AppBuilderComponentRunnerDeps,
): Promise<void> {
    // Read afresh: the deploy may have replaced the record.
    const state = project.appBuilderComponents?.[id];
    if (!state?.updateAvailable) return;
    clearUpdateAvailable(state);
    await deps.saveProject(project);
}
