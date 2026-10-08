/**
 * The deploy itself, dispatched by kind: a mesh through the mesh deploy, an app
 * through the isolated app deploy, then the leftover-action cleanup.
 *
 * Split from `appBuilderComponentRunner.ts` (decompose-god-file, 2026-10-07); that file keeps the
 * shared contract (`RunnerResult`, `AppBuilderComponentRunnerDeps`).
 *
 * @module features/app-builder/services/appBuilderDeployDispatch
 */

import type { AppBuilderComponentRunnerDeps } from './appBuilderComponentRunner';
import { identityOf, integrationOutcome, type DeployOutcome } from './appBuilderDeployOutcome';
import { entriesSharingWorkspace } from './componentWorkspace';
import {
    ensureCommerceAppId,
    ensureListId,
    resolveDeployInputs,
    resolveDisplayName,
} from './deployInputs';
import { deriveOwPackage } from './owPackageName';
import { nodeForAppBuilderEntry } from '@/core/shell/demoBuilderNode';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { MeshDeploymentResult } from '@/features/mesh/services/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import { toError } from '@/types/typeGuards';

/** Dispatch the deploy by kind; returns success + the outcome to record. */
export async function dispatchDeploy(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    componentPath: string,
    deps: AppBuilderComponentRunnerDeps,
): Promise<{ ok: true; outcome: DeployOutcome; warning?: string } | { ok: false; error: string }> {
    if (entry.kind === 'mesh') {
        // The .env must exist before `aio api-mesh` reads it, and it is rewritten
        // on every deploy — a redeploy after a credential change in Configure must
        // not ship the previous endpoints. Sits here, in the one kind-dispatched
        // seam, so add and redeploy cannot drift apart on it.
        try {
            // Step in the FIRST arg, matching the deploy tails' convention — the
            // caller renders arg 1 as the current step.
            deps.onProgress?.(OPERATION_STAGES.generatingMeshConfig.label);
            await deps.writeComponentEnv(project, entry.id, componentPath);
        } catch (error) {
            // Deploying anyway is the ENOENT this step exists to prevent, so fail
            // here and let the caller persist status:'error' with the folder kept.
            return {
                ok: false,
                error: `Could not write the mesh .env: ${toError(error).message}`,
            };
        }
        // The mesh tail picks create-vs-update internally (its own verification
        // resolves the existing mesh); D1 persists no separate meshId to pass.
        const result = await deps.deployMesh(
            componentPath,
            deps.commandManager,
            deps.logger,
            deps.onProgress,
        );
        if (!result.success) {
            return { ok: false, error: result.error || 'Mesh deployment failed.' };
        }
        // Stamp the mesh id where meshVerifier looks for it. Without it, every
        // status request fell back to `aio api-mesh:describe` to recover the id,
        // which costs ~3s and logs a failure. The headless path has always done
        // this; only this one did not.
        const meshInstance = project.componentInstances?.[entry.id];
        if (meshInstance) {
            meshInstance.metadata = {
                ...meshInstance.metadata,
                meshId: result.data?.meshId || '',
                meshStatus: 'deployed',
            };
        }
        return {
            ok: true,
            outcome: await meshOutcome(entry, result.data, componentPath, deps.captureMeshBaseline),
        };
    }
    const owPackage = deriveOwPackage(entry.id);
    // Before the inputs are read: a COPY's Commerce id is chosen once and recorded,
    // because Commerce names its webhooks and events from it and refuses to change it
    // on an upgrade (`commerceAppId.ts`). `resolveDeployInputs` reads it back.
    // A listed system's id in its integration's list is chosen once too, from the name
    // it deploys with, because every product it owns and every key-map row carries it
    // (`erpListId.ts`, AB-51).
    // Both run: `some` over the results, not `||`, which would skip the second.
    const recorded = [
        ensureCommerceAppId(project, entry, deps.catalog),
        ensureListId(project, entry),
    ];
    if (recorded.some(Boolean)) await deps.saveProject(project);
    // The app's own inputs — its settings, a bound integration's values, the
    // schema defaults, and what other components provide (the ERP's base URL to
    // its integration) — ride the deploy's process env, the same way the
    // credentials below do. Catalog app repos ship no `.env` by design.
    const inputs = resolveDeployInputs(project, entry);
    let extraEnv: Record<string, string> = { ...inputs };
    if (deps.resolveSecretEnv) {
        extraEnv = { ...extraEnv, ...(await deps.resolveSecretEnv(project, entry)) };
    }
    // An added ERP's event address and publishing credential (AB-16i): asked on every
    // app deploy, so add and redeploy agree; empty for anything but an added ERP.
    const events = await deps.resolveEventsEnv?.(project, entry);
    extraEnv = { ...extraEnv, ...(events?.env ?? {}) };
    // App Management apps authenticate their actions with the workspace S2S
    // credential, taken as deploy-time env inputs. Resolved here — the one
    // kind-dispatched seam — so add and redeploy cannot drift on it. A resolve
    // failure fails the deploy: without these vars the app deploys BROKEN (its
    // installer cannot authenticate — the first live install proved it).
    if (entry.lifecycle === 'app-management' && deps.resolveAppManagementEnv) {
        deps.onProgress?.(OPERATION_STAGES.resolvingCommerceCredentials.label);
        try {
            extraEnv = { ...extraEnv, ...(await deps.resolveAppManagementEnv(project, entry.id)) };
        } catch (error) {
            return {
                ok: false,
                error: `Could not resolve the app's IMS credentials: ${toError(error).message}`,
            };
        }
    }
    const result = await deps.deployApp(
        componentPath,
        owPackage,
        deps.commandManager,
        deps.logger,
        {
            onProgress: deps.onProgress,
            nodeVersion: nodeForAppBuilderEntry(entry),
            layout: entry.layout,
            confirmToolchainRefresh: deps.confirmToolchainRefresh,
            extraEnv: Object.keys(extraEnv).length > 0 ? extraEnv : undefined,
            // The project's own logs folder, made at creation — see deployFailureLog.
            // A plain '/' join: Node accepts it on every platform, and a `path`
            // import here would take this file past its 15-import coupling line.
            failureLogFile: project.path
                ? `${project.path}/logs/${entry.id}-deploy.log`
                : undefined,
        },
    );
    if (!result.success) return { ok: false, error: result.error || 'App deployment failed.' };
    const leftovers = await deleteLeftBehindActions(project, entry, componentPath, deps);
    const warning = [events?.note, leftovers].filter(Boolean).join(' ');
    return {
        ok: true,
        outcome: integrationOutcome(entry, result.data, resolveDisplayName(entry, inputs)),
        ...(warning ? { warning } : {}),
    };
}

/**
 * Build the persisted state from a successful mesh deploy.
 *
 * Captures the STALENESS BASELINE (`envVars` + `sourceHash`) as well as the
 * endpoint. The headless path gets these from `updateMeshState`; this path
 * called nothing equivalent, so a dashboard-added mesh persisted an endpoint
 * with no baseline — and `detectMeshChanges`, finding an empty one, went to
 * Adobe I/O on every window open and gave up ("Failed to parse mesh data").
 * A mesh that can never be found stale can never prompt a redeploy.
 *
 * The two clears mirror updateMeshState: a freshly deployed mesh is no longer
 * a declined update.
 */
async function meshOutcome(
    entry: AppBuilderComponentCatalogEntry,
    data: MeshDeploymentResult['data'],
    componentPath: string,
    captureBaseline: AppBuilderComponentRunnerDeps['captureMeshBaseline'],
): Promise<DeployOutcome> {
    const endpoint = data?.endpoint ?? '';
    const { envVars, sourceHash } = await captureBaseline(componentPath);
    return {
        status: 'deployed',
        ...identityOf(entry),
        endpoint,
        lastDeployed: new Date().toISOString(),
        envVars,
        sourceHash,
        userDeclinedUpdate: undefined,
        declinedAt: undefined,
        providesEnvVars: entry.providesEnvVars?.includes('MESH_ENDPOINT')
            ? { MESH_ENDPOINT: endpoint }
            : undefined,
    };
}

/**
 * After an app deploy: delete what the deploy left behind — actions in the app's own
 * packages it no longer declares, and the rules and triggers that started them — and answer a warning when some could not be deleted
 * or the namespace could not be read. Every component deploying into the same workspace
 * is passed, so a pair's two apps keep each other's actions safe.
 */
async function deleteLeftBehindActions(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    componentPath: string,
    deps: AppBuilderComponentRunnerDeps,
): Promise<string | undefined> {
    if (!deps.deleteUndeclaredActions) return undefined;
    deps.onProgress?.(OPERATION_STAGES.checkingLeftovers.label);
    const sharing = entriesSharingWorkspace(deps.catalog, project, entry)
        .map((other) => project.componentInstances?.[other.id]?.path)
        .filter((other): other is string => Boolean(other) && other !== componentPath);
    const cleanup = await deps.deleteUndeclaredActions([componentPath, ...sharing]);
    if (cleanup.failed.length > 0) {
        return `Code the app no longer uses is still deployed: ${cleanup.failed.join(', ')}.`;
    }
    return cleanup.note;
}
