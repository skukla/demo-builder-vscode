/**
 * Adding an App Builder component: the add door, a bound system added first, and
 * the add run (subscribe, clone and install, deploy, record, republish).
 *
 * Split from `appBuilderComponentRunner.ts` (decompose-god-file, 2026-10-07); that file keeps the
 * shared contract (`RunnerResult`, `AppBuilderComponentRunnerDeps`).
 *
 * @module features/app-builder/services/appBuilderAddRun
 */

import type { AppBuilderComponentRunnerDeps, RunnerResult } from './appBuilderComponentRunner';
import { dispatchDeploy } from './appBuilderDeployDispatch';
import {
    cloneAndInstall,
    errorOutcome,
    installIfAppManagement,
    listSystemsAfterDeploy,
    persistOutcome,
    readableFailure,
    republishIfProvided,
    targetFor,
    withWarnings,
} from './appBuilderDeploySteps';
import { detectAppLayout, type AppConfigLayout } from './appConfigPackages';
import { pairedEntry, withCustomIntegrationNode } from './componentEntry';
import { entriesSharingWorkspace } from './componentWorkspace';
import { displayNameInProject, resolveDeployInputs, resolveDisplayName } from './deployInputs';
import { nodeForAppBuilderEntry } from '@/core/shell/demoBuilderNode';
import { withOrgContext } from '@/core/shell/orgContextEnv';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import {
    linkBroughtSystem,
    pairedInstanceId,
    systemBoundTo,
} from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import { toError } from '@/types/typeGuards';

/**
 * Add an App Builder component: subscribe → clone+install → kind-dispatched deploy (under
 * org-context) → persist → republish (if it provides env vars). On a deploy
 * failure after a successful clone, persists `status:'error'` and retains the
 * local folder for retry.
 */
export async function addAppBuilderComponent(
    project: Project,
    requested: AppBuilderComponentCatalogEntry,
    deps: AppBuilderComponentRunnerDeps,
): Promise<RunnerResult> {
    // A custom integration may need a Node other than Demo Builder's (PR-1a step 8).
    const resolved = await withCustomIntegrationNode(requested, deps.resolveCustomIntegrationNode);
    if ('error' in resolved) return { success: false, error: resolved.error };
    const { entry } = resolved;
    const boundSystem = await addBoundSystemFirst(project, entry, deps);
    if (!boundSystem.success) return { success: false, error: boundSystem.error };
    // After its system, the entry is the pair's second member.
    return addOne(
        project,
        entry,
        boundSystem.added ? atPairPosition(deps, 2, 2, displayNameInProject(project, entry)) : deps,
    );
}

/**
 * Add ONE component, its bound system already in place — and, when the add does
 * not finish, leave a record that says so.
 *
 * The workspace is recorded before anything else runs, on purpose: one that
 * exists in Adobe must never be lost to a later failure. But a failure BETWEEN
 * that and the deploy's own in-flight marker used to leave the component holding
 * its workspace and nothing else — no kind, no status, no source. The manifest
 * then failed its own schema, no card showed the component, and `nextCopyOf` read
 * the record as taken and numbered the next add a copy higher. Measured live
 * 2026-09-22: a second ERP's workspace was made and its ERP deployed, then Adobe
 * did not list the product profiles the integration's subscribe needed.
 */
async function addOne(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    deps: AppBuilderComponentRunnerDeps,
): Promise<RunnerResult> {
    const result = await runAdd(project, entry, deps);
    // Only a record left mid-flight: an add that failed before anything was written
    // leaves no component behind and must not gain one here, and a deploy that failed
    // has already recorded its own reason.
    const inFlight = project.appBuilderComponents?.[entry.id];
    if (!result.success && inFlight !== undefined && inFlight.status === 'deploying') {
        const name = resolveDisplayName(entry, resolveDeployInputs(project, entry));
        // What the SC is left with, said plainly. The step that refused speaks for
        // ITSELF ("No API access was changed"), which reads as "nothing happened"
        // while the workspace it just made — and, for a pair, the system already
        // deployed into it — are sitting in their Adobe project (2026-09-22).
        const failure = result.error ?? `${name} was not added.`;
        const reason = inFlight.workspace
            ? `${failure} The Adobe workspace made for ${name} is kept, so adding it again continues from there.`
            : failure;
        await persistOutcome(project, entry, errorOutcome(entry, reason, name), deps);
        return { success: false, error: reason };
    }
    return result;
}

/** The add itself; {@link addOne} records what it leaves behind when it fails. */
async function runAdd(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    deps: AppBuilderComponentRunnerDeps,
): Promise<RunnerResult> {
    const missingProvider = findMissingProvider(project, entry);
    if (missingProvider) {
        return {
            success: false,
            error: `Provider "${missingProvider}" is not deployed yet (deploy it first).`,
        };
    }

    try {
        // Every entry, from demoBuilderNode() (PR-1a): its own version, else
        // Demo Builder's. Visible, not silent: a first-time install takes a while
        // and the progress channel is the surface every add path already has.
        // "Installing … (one-time install)" was said even when Node was already
        // there — every add of a pair said it twice (2026-09-21).
        const node = nodeForAppBuilderEntry(entry);
        deps.onProgress?.(OPERATION_STAGES.preparingNode.label, `Node ${node}`);
        const nodeError = await deps.ensureNodeVersion?.(node);
        if (nodeError) {
            return { success: false, error: nodeError };
        }

        // The workspace comes BEFORE the subscribe, and that order is the whole
        // point: the subscribe grants API access to a WORKSPACE's credential, so
        // subscribing first would entitle the project's workspace and leave the
        // component's own without the access it deploys against.
        const workspaceError = await deps.createComponentWorkspace(project, entry, () =>
            deps.onProgress?.(OPERATION_STAGES.makingWorkspace.label),
        );
        if (workspaceError) {
            return { success: false, error: workspaceError.error };
        }

        // The subscribe's org-services fetch alone measured 43.5s cold — the
        // longest silent stretch in the chain (owner audit, 2026-08-27).
        deps.onProgress?.(OPERATION_STAGES.subscribingApis.label);
        await deps.subscribeRequiredApis(
            entriesSharingWorkspace(deps.catalog, project, entry),
            project,
            (step) => deps.onProgress?.(OPERATION_STAGES.subscribingApis.label, step),
            { forComponent: entry.id, adding: true },
        );

        deps.onProgress?.(OPERATION_STAGES.gettingCode.label);
        const installed = await cloneAndInstall(project, entry, deps);
        if ('error' in installed) {
            return { success: false, error: installed.error };
        }

        // Add door: the cloned repo's config layout MUST match what the catalog
        // entry declares (default standalone). A standalone entry needs runtime
        // packages we can package-isolate in the shared workspace; an extension
        // entry (App Management apps) needs a root `extensions:` map. Reject a
        // mismatched or malformed repo here (before any deploy) rather than
        // silently landing it on the shared default package where it would prune
        // sibling integrations.
        if (entry.kind !== 'mesh') {
            const expected: AppConfigLayout = entry.layout ?? 'standalone';
            const detected = await detectAppLayout(installed.path);
            if (detected !== expected) {
                return { success: false, error: layoutMismatchError(entry, expected, detected) };
            }
        }

        // Transient in-flight marker so pollers can tell this run from a
        // stale prior outcome; the final outcome overwrites it. It KEEPS the
        // workspace recorded above: dropping it sent the deploy, its credentials
        // and its Commerce install to the project's workspace (2026-09-21).
        const workspace = project.appBuilderComponents?.[entry.id]?.workspace;
        // And its id in its integration's list (AB-51): recorded once, on the first
        // deploy, and on every product it owns since — a rename must not re-derive it.
        const listId = project.appBuilderComponents?.[entry.id]?.listId;
        project.appBuilderComponents = {
            ...(project.appBuilderComponents ?? {}),
            [entry.id]: {
                ...(workspace ? { workspace } : {}),
                ...(listId ? { listId } : {}),
                ...(entry.catalogId ? { catalogId: entry.catalogId } : {}),
                ...(entry.nodeVersion ? { nodeVersion: entry.nodeVersion } : {}),
                kind: entry.kind,
                status: 'deploying',
                name: resolveDisplayName(entry, resolveDeployInputs(project, entry)),
                source: {
                    owner: entry.source.owner,
                    repo: entry.source.repo,
                    branch: entry.source.branch,
                },
            },
        };
        await deps.saveProject(project);

        const since = new Date().toISOString();
        const deployed = await withOrgContext(targetFor(project, deps, entry.id), () =>
            dispatchDeploy(project, entry, installed.path, deps),
        );

        if (!deployed.ok) {
            const name = resolveDisplayName(entry, resolveDeployInputs(project, entry));
            const reason = readableFailure(deployed.error, deps.logger);
            await persistOutcome(project, entry, errorOutcome(entry, reason, name), deps);
            // A failed add links too: its removal must still take the system with it.
            if (linkBroughtSystem(project, entry.id, deps.catalog)) await deps.saveProject(project);
            return { success: false, error: reason };
        }

        await persistOutcome(project, entry, deployed.outcome, deps);
        if (linkBroughtSystem(project, entry.id, deps.catalog)) await deps.saveProject(project);
        const listed = await listSystemsAfterDeploy(project, entry, deps);
        await installIfAppManagement(project, entry, deps, {
            componentPath: installed.path,
            since,
        });
        return withWarnings(
            deployed.warning,
            listed,
            await republishIfProvided(project, entry.id, deps),
        );
    } catch (error) {
        deps.logger.error('[AppBuilderComponent Runner] add failed', error as Error);
        return { success: false, error: readableFailure(toError(error).message, deps.logger) };
    }
}

/**
 * The bound SYSTEM comes first: an integration whose ERP is not in the project
 * yet gets it added and deployed before its own deploy, so the provider check
 * passes and its base URL is there to inject (decision 2). A system that failed
 * an earlier add (`status: 'error'`, folder kept) is retried the same way.
 */
async function addBoundSystemFirst(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    deps: AppBuilderComponentRunnerDeps,
): Promise<RunnerResult & { added?: boolean }> {
    const system = boundSystemOf(entry, deps.catalog);
    if (!system) return { success: true };
    const existing = project.appBuilderComponents?.[system.id];
    if (existing && existing.status !== 'error') return { success: true };
    const systemName = displayNameInProject(project, system);
    const first = atPairPosition(deps, 1, 2, systemName);
    first.onProgress?.(OPERATION_STAGES.addingSystem.label, `Adding ${systemName}`);
    const result = await addAppBuilderComponent(project, system, first);
    if (!result.success) {
        return {
            success: false,
            error: `Could not add ${system.name}, which ${entry.name} needs: ${result.error}`,
        };
    }
    return { success: true, added: true };
}

/**
 * The system an integration brings, as the instance THIS integration pairs with: the
 * catalog's own for the first of a kind, a copy numbered with it for a second
 * (`erp-integration-2` brings `demo-erp-2`, named "ERP 2").
 */
function boundSystemOf(
    entry: AppBuilderComponentCatalogEntry,
    catalog: AppBuilderComponentCatalogEntry[],
): AppBuilderComponentCatalogEntry | undefined {
    const system = systemBoundTo(entry.catalogId ?? entry.id, catalog);
    return system && pairedEntry(entry, system);
}

/**
 * The same deps, with every progress report naming which member of a pair it is
 * on: "Deploying the app · Northwind ERP" (PL-59). The deploy tails get the wrapped
 * reporter too, so their steps carry the name without knowing about pairs.
 */
function atPairPosition(
    deps: AppBuilderComponentRunnerDeps,
    index: number,
    total: number,
    name: string,
): AppBuilderComponentRunnerDeps {
    const report = deps.onProgress;
    if (!report) return deps;
    return {
        ...deps,
        onProgress: (message, subMessage) => report(message, subMessage, { index, total, name }),
    };
}

/** Guard: a mesh-consuming integration requires its provider to be deployed first. */
function findMissingProvider(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
): string | undefined {
    for (const envVar of entry.envSchema ?? []) {
        if (!envVar.providedBy) continue;
        // The provider THIS component pairs with: a second ERP's integration needs the
        // second ERP, not whichever one the catalog id names.
        const provider = pairedInstanceId(entry.id, entry.catalogId, envVar.providedBy);
        if (!project.appBuilderComponents?.[provider]) {
            return provider;
        }
    }
    return undefined;
}

/** Add-door rejection when the cloned repo's config layout ≠ the catalog entry's. */
function layoutMismatchError(
    entry: AppBuilderComponentCatalogEntry,
    expected: AppConfigLayout,
    detected: AppConfigLayout | undefined,
): string {
    const found =
        detected === undefined
            ? 'its app.config.yaml declares neither (missing, unparseable, or empty)'
            : `its app.config.yaml is ${detected}-shaped`;
    if (expected === 'standalone') {
        return (
            `"${entry.name}" is not a standalone App Builder app — ${found}. A standalone ` +
            `integration must declare runtime packages under application.runtimeManifest ` +
            `so its deploy can be package-isolated in the shared workspace.`
        );
    }
    return (
        `"${entry.name}" is not an extension-layout App Builder app — ${found}. An ` +
        `extension integration must declare a root extensions: map in app.config.yaml ` +
        `(the App Management shape).`
    );
}
