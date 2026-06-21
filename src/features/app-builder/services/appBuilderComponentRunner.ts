/**
 * Deploy-contract runner (Step 08) — unify add / deploy / remove by `kind`.
 *
 * ONE kind-dispatched path orchestrates the pieces built in steps 01/04/05/06/07
 * plus the two existing deploy tails. It does NOT fork
 * `deployMeshComponent`/`deployAppComponent` — it routes to them by `kind`:
 *
 * - add:    subscribe the UNION of all appBuilderComponents' requiredApis (+ baseline) →
 *           clone + kind-aware install → dispatch deploy (mesh → mesh tail;
 *           integration → app tail, applying a derived distinct `ow.package`) — all
 *           inside `withOrgContext` — persist `appBuilderComponents[id]` via accessors → if
 *           it `providesEnvVars`, regenerate + republish the storefront config.
 * - deploy: re-run ONLY that appBuilderComponent's deploy tail (provider-before-consumer
 *           ordering for mesh-consuming integrations).
 * - remove: integration → `aio app undeploy`; mesh → `aio api-mesh:delete` → clear
 *           `appBuilderComponents[id]` → if it provided vars, republish WITHOUT them.
 *
 * Partial-failure: a clone-OK-but-deploy-failed add persists `status:'error'` and
 * RETAINS the local folder for retry (never clears the entry).
 *
 * Reuse / DI: every external boundary (the two deploy tails, the API subscriber,
 * clone/install, undeploy/delete commands, storefront republish) is injected via
 * {@link AppBuilderComponentRunnerDeps} so the runner is pure orchestration. The production
 * defaults wire the real functions; unit tests mock them.
 */

import { setAppBuilderComponent, getProvidedEnvVars } from './appBuilderComponentState';
import { deriveOwPackage } from './owPackageName';
import type { AppDeploymentResult } from './types';
import { buildOrgTargetFromProjectAdobe, withOrgContext, type CachedOrgRef, type CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { ComponentManager } from '@/features/components/services/componentManager';
import type { MeshDeploymentResult } from '@/features/mesh/services/types';
import type { Project, TransformedComponentDefinition } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';
import type { Logger } from '@/types/logger';
import { toError } from '@/types/typeGuards';

/** Outcome of an add/deploy/remove operation. */
export interface RunnerResult {
    success: boolean;
    error?: string;
}

/** Storefront republish input (mirrors the eds RepublishParams the runner needs). */
interface RepublishInput {
    project: Project;
    secrets: unknown;
    logger: Logger;
}

/**
 * Injected collaborators. Production wires the real implementations
 * (see {@link buildDefaultRunnerDeps}); unit tests pass mocks.
 */
export interface AppBuilderComponentRunnerDeps {
    componentManager: ComponentManager;
    commandManager: CommandExecutor;
    logger: Logger;
    saveProject: (project: Project) => Promise<void>;
    getCachedOrganization: () => CachedOrgRef | undefined;
    /** Mesh deploy tail (org-agnostic; the runner wraps it in withOrgContext). */
    deployMesh: (
        componentPath: string, commandManager: CommandExecutor, logger: Logger,
        onProgress?: (m: string, s?: string) => void, existingMeshId?: string,
    ) => Promise<MeshDeploymentResult>;
    /** Integration deploy tail, given a derived distinct ow.package. */
    deployApp: (
        componentPath: string, owPackage: string, commandManager: CommandExecutor, logger: Logger,
        onProgress?: (m: string, s?: string) => void,
    ) => Promise<AppDeploymentResult>;
    /** Union-reconcile API subscriber (step 07). */
    subscribeRequiredApis: (appBuilderComponents: AppBuilderComponentCatalogEntry[], project: Project) => Promise<void>;
    /** Storefront config regen + republish (step 04 generalized providesEnvVars path). */
    republishStorefront: (input: RepublishInput) => Promise<{ success: boolean; error?: string }>;
    /** Every appBuilderComponent in the project's catalog (for the union subscribe). */
    catalog: AppBuilderComponentCatalogEntry[];
    /** Secret storage forwarded to the republish path. */
    secrets: unknown;
}

/** Build the org-context target for the project's known Adobe identity. */
function targetFor(project: Project, deps: AppBuilderComponentRunnerDeps) {
    return buildOrgTargetFromProjectAdobe(project.adobe, deps.getCachedOrganization());
}

/** Build a runtime git ComponentDefinition for a catalog entry. */
function buildDefinition(entry: AppBuilderComponentCatalogEntry): TransformedComponentDefinition {
    const branch = entry.source.branch ?? 'main';
    return {
        id: entry.id,
        name: entry.name,
        type: entry.kind === 'mesh' ? 'dependency' : 'app-builder',
        subType: entry.kind === 'mesh' ? 'mesh' : 'app',
        source: {
            type: 'git',
            url: `https://github.com/${entry.source.owner}/${entry.source.repo}.git`,
            branch,
        },
        configuration: { requiresDeployment: true, deploymentTarget: 'adobe-io' },
    } as TransformedComponentDefinition;
}

/** Clone + install the catalog entry; return its local path or an error. */
async function cloneAndInstall(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    deps: AppBuilderComponentRunnerDeps,
): Promise<{ path: string } | { error: string }> {
    const result = await deps.componentManager.installComponent(project, buildDefinition(entry));
    if (!result.success || !result.component?.path) {
        return { error: result.error || 'Component installation failed.' };
    }
    return { path: result.component.path };
}

/** Guard: a mesh-consuming integration requires its provider to be deployed first. */
function findMissingProvider(project: Project, entry: AppBuilderComponentCatalogEntry): string | undefined {
    for (const envVar of entry.envSchema ?? []) {
        const provider = envVar.providedBy;
        if (provider && !project.appBuilderComponents?.[provider]) {
            return provider;
        }
    }
    return undefined;
}

/** Persist `appBuilderComponents[id]` and save; returns the updated project. */
async function persistResult(
    project: Project,
    id: string,
    state: AppBuilderComponentState,
    deps: AppBuilderComponentRunnerDeps,
): Promise<Project> {
    const updated = setAppBuilderComponent(project, id, state);
    await deps.saveProject(updated);
    return updated;
}

/** Republish the storefront when the project carries provided env vars (else no-op). */
async function republishIfProvided(project: Project, deps: AppBuilderComponentRunnerDeps): Promise<void> {
    if (Object.keys(getProvidedEnvVars(project)).length === 0) {
        return;
    }
    await deps.republishStorefront({ project, secrets: deps.secrets, logger: deps.logger });
}

/** Build the persisted AppBuilderComponentState from a successful mesh deploy. */
function meshState(entry: AppBuilderComponentCatalogEntry, data: MeshDeploymentResult['data']): AppBuilderComponentState {
    const endpoint = data?.endpoint ?? '';
    return {
        kind: 'mesh',
        status: 'deployed',
        source: { owner: entry.source.owner, repo: entry.source.repo, branch: entry.source.branch },
        endpoint,
        lastDeployed: new Date().toISOString(),
        providesEnvVars: entry.providesEnvVars?.includes('MESH_ENDPOINT')
            ? { MESH_ENDPOINT: endpoint }
            : undefined,
    };
}

/** Build the persisted AppBuilderComponentState from a successful integration deploy. */
function integrationState(entry: AppBuilderComponentCatalogEntry, data: AppDeploymentResult['data']): AppBuilderComponentState {
    return {
        kind: 'integration',
        status: 'deployed',
        source: { owner: entry.source.owner, repo: entry.source.repo, branch: entry.source.branch },
        url: data?.url,
        deployedUrls: data?.deployedUrls,
        lastDeployed: new Date().toISOString(),
    };
}

/** An error-status entry that keeps coherent state after a failed deploy. */
function errorState(entry: AppBuilderComponentCatalogEntry): AppBuilderComponentState {
    return {
        kind: entry.kind,
        status: 'error',
        source: { owner: entry.source.owner, repo: entry.source.repo, branch: entry.source.branch },
    };
}

/** Dispatch the deploy by kind; returns success + the persisted state. */
async function dispatchDeploy(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    componentPath: string,
    deps: AppBuilderComponentRunnerDeps,
): Promise<{ ok: true; state: AppBuilderComponentState } | { ok: false; error: string }> {
    if (entry.kind === 'mesh') {
        // The mesh tail picks create-vs-update internally (its own verification
        // resolves the existing mesh); D1 persists no separate meshId to pass.
        const result = await deps.deployMesh(componentPath, deps.commandManager, deps.logger);
        return result.success
            ? { ok: true, state: meshState(entry, result.data) }
            : { ok: false, error: result.error || 'Mesh deployment failed.' };
    }
    const owPackage = deriveOwPackage(entry.id);
    const result = await deps.deployApp(componentPath, owPackage, deps.commandManager, deps.logger);
    return result.success
        ? { ok: true, state: integrationState(entry, result.data) }
        : { ok: false, error: result.error || 'App deployment failed.' };
}

/**
 * Add an App Builder component: subscribe → clone+install → kind-dispatched deploy (under
 * org-context) → persist → republish (if it provides env vars). On a deploy
 * failure after a successful clone, persists `status:'error'` and retains the
 * local folder for retry.
 */
export async function addAppBuilderComponent(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    deps: AppBuilderComponentRunnerDeps,
): Promise<RunnerResult> {
    const missingProvider = findMissingProvider(project, entry);
    if (missingProvider) {
        return { success: false, error: `Provider "${missingProvider}" is not deployed yet (deploy it first).` };
    }

    try {
        await deps.subscribeRequiredApis(deps.catalog, project);

        const installed = await cloneAndInstall(project, entry, deps);
        if ('error' in installed) {
            return { success: false, error: installed.error };
        }

        const deployed = await withOrgContext(targetFor(project, deps), () =>
            dispatchDeploy(project, entry, installed.path, deps),
        );

        if (!deployed.ok) {
            await persistResult(project, entry.id, errorState(entry), deps);
            return { success: false, error: deployed.error };
        }

        const updated = await persistResult(project, entry.id, deployed.state, deps);
        await republishIfProvided(updated, deps);
        return { success: true };
    } catch (error) {
        deps.logger.error('[AppBuilderComponent Runner] add failed', error as Error);
        return { success: false, error: toError(error).message };
    }
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
    const existing = project.appBuilderComponents?.[id];
    const componentPath = project.componentInstances?.[id]?.path;
    if (!existing || !componentPath) {
        return { success: false, error: `AppBuilderComponent "${id}" not found.` };
    }

    const entry = deps.catalog.find((c) => c.id === id) ?? entryFromState(id, existing);

    try {
        const deployed = await withOrgContext(targetFor(project, deps), () =>
            dispatchDeploy(project, entry, componentPath, deps),
        );
        if (!deployed.ok) {
            return { success: false, error: deployed.error };
        }
        const updated = await persistResult(project, id, deployed.state, deps);
        await republishIfProvided(updated, deps);
        return { success: true };
    } catch (error) {
        deps.logger.error('[AppBuilderComponent Runner] deploy failed', error as Error);
        return { success: false, error: toError(error).message };
    }
}

/** Reconstruct a minimal catalog entry from persisted state (redeploy fallback). */
function entryFromState(id: string, state: AppBuilderComponentState): AppBuilderComponentCatalogEntry {
    return {
        id,
        name: id,
        description: '',
        kind: state.kind,
        source: { owner: state.source.owner, repo: state.source.repo, branch: state.source.branch ?? 'main' },
        providesEnvVars: state.providesEnvVars ? Object.keys(state.providesEnvVars) : undefined,
    };
}

/** Tear down the remote artifact for an App Builder component, by kind, under org-context. */
async function teardownRemote(
    project: Project,
    id: string,
    state: AppBuilderComponentState,
    deps: AppBuilderComponentRunnerDeps,
): Promise<void> {
    const componentPath = project.componentInstances?.[id]?.path;
    const command = state.kind === 'mesh'
        ? 'aio api-mesh:delete --autoConfirmAction'
        : 'aio app undeploy';
    await withOrgContext(targetFor(project, deps), () =>
        deps.commandManager.execute(command, {
            cwd: componentPath,
            useNodeVersion: 'auto',
            enhancePath: true,
            streaming: true,
            shell: true,
            timeout: TIMEOUTS.LONG,
        }),
    );
}

/**
 * Remove an App Builder component: kind-dispatched remote teardown (best-effort) → delete the
 * local folder → clear `appBuilderComponents[id]` → if it provided env vars, regenerate the
 * storefront config WITHOUT them.
 */
export async function removeAppBuilderComponent(
    project: Project,
    id: string,
    deps: AppBuilderComponentRunnerDeps,
): Promise<RunnerResult> {
    const state = project.appBuilderComponents?.[id];
    if (!state) {
        return { success: false, error: `AppBuilderComponent "${id}" not found.` };
    }

    const provided = Boolean(state.providesEnvVars && Object.keys(state.providesEnvVars).length > 0);

    try {
        await teardownRemote(project, id, state, deps);
    } catch (error) {
        deps.logger.warn(`[AppBuilderComponent Runner] remote teardown warning: ${toError(error).message}`);
    }

    await deps.componentManager.removeComponent(project, id, true);

    const cleared = { ...project, appBuilderComponents: { ...(project.appBuilderComponents ?? {}) } };
    delete cleared.appBuilderComponents[id];
    await deps.saveProject(cleared);

    if (provided) {
        await deps.republishStorefront({ project: cleared, secrets: deps.secrets, logger: deps.logger });
    }

    return { success: true };
}
