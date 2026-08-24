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
 * Every deploy — add and redeploy, success and failure — records its outcome
 * through `recordDeployOutcome`, the one keyed deploy-record writer. The add
 * passes `create: true` so it keys by its own id instead of resolveKeyedComponentId's
 * legacy-migration branch, which would land a second integration on the first
 * one's key.
 *
 * Partial-failure: a clone-OK-but-deploy-failed add persists `status:'error'` and
 * RETAINS the local folder for retry (never clears the entry).
 *
 * Reuse / DI: every external boundary (the two deploy tails, the API subscriber,
 * clone/install, undeploy/delete commands, storefront republish) is injected via
 * {@link AppBuilderComponentRunnerDeps} so the runner is pure orchestration. The production
 * defaults wire the real functions; unit tests mock them.
 */

import { getProvidedEnvVars } from './appBuilderComponentState';
import { recordDeployOutcome, type DeployOutcome } from './appBuilderDeployOutcome';
import { isStandaloneApp } from './appConfigPackages';
import { deriveOwPackage } from './owPackageName';
import type { AppDeploymentResult } from './types';
import { isMeshComponentId } from '@/core/constants';
import {
    buildOrgTargetFromProjectAdobe,
    withOrgContext,
    type CachedOrgRef,
    type CommandExecutor,
} from '@/core/shell';
import { reconcileComponentSelections } from '@/core/state/componentSelectionReconcile';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { ComponentManager } from '@/features/components/services/componentManager';
import { MESH_DELETE_COMMAND } from '@/features/mesh/services/meshDeleteCommand';
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
    /**
     * Where the deploy tails' step reports go.
     *
     * The tails already emit every step and their signatures have always declared
     * `onProgress`; the add path just called them without it, so a dashboard add
     * showed one static title while the build and deploy ran silently. Optional
     * because the headless/MCP callers have nobody to tell.
     */
    onProgress?: (message: string, subMessage?: string) => void;
    /**
     * Write a component's `.env` from the REGISTRY contract, before its deploy.
     *
     * Mesh only. A mesh repo's `mesh.config.js` calls `require('dotenv').config()`
     * and resolves every endpoint through `{env.*}`, so `aio api-mesh` fails with
     * `ENOENT: ... open '.env'` without it — which is exactly what a dashboard mesh
     * add used to do. Catalog app repos ship no `.env` by design and receive
     * credentials through the deploy's env injection instead (runtimeCredentials).
     */
    writeComponentEnv: (
        project: Project,
        componentId: string,
        componentPath: string
    ) => Promise<void>;
    /**
     * Capture the mesh staleness baseline (`envVars` + `sourceHash`) for a
     * deployed mesh. Injected like every other cross-feature boundary here —
     * the real implementation lives in `@/features/mesh`, and this module stays
     * free of cross-feature deploy imports (see appBuilderComponentRunnerDeps).
     */
    captureMeshBaseline: (
        componentPath: string
    ) => Promise<{ envVars: Record<string, string>; sourceHash: string | null }>;
    /** Mesh deploy tail (org-agnostic; the runner wraps it in withOrgContext). */
    deployMesh: (
        componentPath: string,
        commandManager: CommandExecutor,
        logger: Logger,
        onProgress?: (m: string, s?: string) => void,
        existingMeshId?: string
    ) => Promise<MeshDeploymentResult>;
    /** Integration deploy tail, given a derived distinct ow.package. */
    deployApp: (
        componentPath: string,
        owPackage: string,
        commandManager: CommandExecutor,
        logger: Logger,
        onProgress?: (m: string, s?: string) => void
    ) => Promise<AppDeploymentResult>;
    /** Union-reconcile API subscriber (step 07). */
    subscribeRequiredApis: (
        appBuilderComponents: AppBuilderComponentCatalogEntry[],
        project: Project
    ) => Promise<void>;
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

    // ATTACH the instance, don't just take its path. `installComponent` builds
    // it — carrying `subType` off the definition — and returns it; it does not
    // put it on the project. That is the caller's job, and this caller used to
    // skip it.
    //
    // REGRESSION (2026-08-04, live): a dashboard-added mesh deployed, persisted a
    // correct keyed entry, republished the storefront — and came back as
    // `mesh=none` on the next reload with an EMPTY integrations grid. With no
    // instance persisted, the next project load let `discoverComponents`
    // synthesize a thin one from the directory alone, with no `subType`, and
    // `getMeshComponentInstance` matches on `subType === 'mesh'`. The keyed map
    // and the instance are read by different surfaces, so the projects-list card
    // said Deployed while the dashboard said none.
    project.componentInstances = project.componentInstances ?? {};
    project.componentInstances[entry.id] = result.component;

    return { path: result.component.path };
}

/** Guard: a mesh-consuming integration requires its provider to be deployed first. */
function findMissingProvider(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
): string | undefined {
    for (const envVar of entry.envSchema ?? []) {
        const provider = envVar.providedBy;
        if (provider && !project.appBuilderComponents?.[provider]) {
            return provider;
        }
    }
    return undefined;
}

/**
 * Persist `appBuilderComponents[id]` and save; returns the updated project.
 *
 * ALSO syncs the CALLER's project reference in place (like recordDeployOutcome):
 * callers such as the creation executor keep saving their own reference after
 * the runner returns — without the sync, those later saves clobbered the keyed
 * write and a creation-deployed integration vanished from the manifest.
 */
/**
 * Record an ADD's outcome and save.
 *
 * `create: true` keys the entry by the component's OWN id. Without it the write
 * would go through resolveKeyedComponentId, whose legacy-migration branch reuses
 * the one existing same-kind entry's key — which for an add means the second
 * integration lands on the first one's key and overwrites it.
 */
async function persistOutcome(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    outcome: DeployOutcome,
    deps: AppBuilderComponentRunnerDeps,
): Promise<void> {
    recordDeployOutcome(project, entry.kind, entry.id, outcome, { create: true });
    // Record the SELECTION too. Configure's rail and project reset both read the
    // selection lists rather than the keyed map, and this path is the only live
    // add — leaving them empty is what made a dashboard-added mesh invisible to
    // Configure and disposable by reset.
    reconcileComponentSelections(project);
    await deps.saveProject(project);
}

/** Republish the storefront when the project carries provided env vars (else no-op). */
async function republishIfProvided(
    project: Project,
    deps: AppBuilderComponentRunnerDeps,
): Promise<void> {
    if (Object.keys(getProvidedEnvVars(project)).length === 0) {
        return;
    }
    await deps.republishStorefront({ project, secrets: deps.secrets, logger: deps.logger });
}

/** Build the persisted AppBuilderComponentState from a successful mesh deploy. */
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

/** Build the persisted AppBuilderComponentState from a successful integration deploy. */
function integrationOutcome(
    entry: AppBuilderComponentCatalogEntry,
    data: AppDeploymentResult['data'],
): DeployOutcome {
    return {
        status: 'deployed',
        ...identityOf(entry),
        url: data?.url,
        deployedUrls: data?.deployedUrls,
        lastDeployed: new Date().toISOString(),
    };
}

/** The identity a CREATE must supply; an update inherits it from its entry. */
function identityOf(
    entry: AppBuilderComponentCatalogEntry,
): Pick<DeployOutcome, 'name' | 'source'> {
    return {
        name: entry.name,
        source: { owner: entry.source.owner, repo: entry.source.repo, branch: entry.source.branch },
    };
}

/**
 * A failed deploy's outcome — INCLUDING why it failed.
 *
 * The reason used to be returned to the caller and dropped from state, so a
 * failed add persisted `status:'error'` with nothing to explain it and no surface
 * could answer "why?" once the notification faded. `error` is the one field a
 * failed entry exists to carry.
 */
function errorOutcome(entry: AppBuilderComponentCatalogEntry, reason: string): DeployOutcome {
    return { status: 'error', ...identityOf(entry), error: reason };
}

/** Dispatch the deploy by kind; returns success + the outcome to record. */
async function dispatchDeploy(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    componentPath: string,
    deps: AppBuilderComponentRunnerDeps,
): Promise<{ ok: true; outcome: DeployOutcome } | { ok: false; error: string }> {
    if (entry.kind === 'mesh') {
        // The .env must exist before `aio api-mesh` reads it, and it is rewritten
        // on every deploy — a redeploy after a credential change in Configure must
        // not ship the previous endpoints. Sits here, in the one kind-dispatched
        // seam, so add and redeploy cannot drift apart on it.
        try {
            // Step in the FIRST arg, matching the deploy tails' convention — the
            // caller renders arg 1 as the current step.
            deps.onProgress?.('Generating mesh configuration...');
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
    const result = await deps.deployApp(
        componentPath,
        owPackage,
        deps.commandManager,
        deps.logger,
        deps.onProgress,
    );
    return result.success
        ? { ok: true, outcome: integrationOutcome(entry, result.data) }
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
        return {
            success: false,
            error: `Provider "${missingProvider}" is not deployed yet (deploy it first).`,
        };
    }

    try {
        await deps.subscribeRequiredApis(deps.catalog, project);

        const installed = await cloneAndInstall(project, entry, deps);
        if ('error' in installed) {
            return { success: false, error: installed.error };
        }

        // Add door: an integration MUST be a standalone action app so its deploy can
        // be package-isolated in the shared workspace. Reject an extension-shaped or
        // malformed repo here (before any deploy) rather than silently landing it on
        // the shared default package where it would prune sibling integrations.
        if (entry.kind === 'integration' && !(await isStandaloneApp(installed.path))) {
            return {
                success: false,
                error:
                    `"${entry.name}" is not a standalone App Builder app — its app.config.yaml ` +
                    `declares no runtime packages under application.runtimeManifest. Only standalone ` +
                    `action apps can be isolated in a shared workspace; extension apps (e.g. excshell) ` +
                    `are not supported as integrations.`,
            };
        }

        const deployed = await withOrgContext(targetFor(project, deps), () =>
            dispatchDeploy(project, entry, installed.path, deps),
        );

        if (!deployed.ok) {
            await persistOutcome(project, entry, errorOutcome(entry, deployed.error), deps);
            return { success: false, error: deployed.error };
        }

        await persistOutcome(project, entry, deployed.outcome, deps);
        await republishIfProvided(project, deps);
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
        recordDeployOutcome(project, entry.kind, id, deployed.outcome);
        await deps.saveProject(project);
        await republishIfProvided(project, deps);
        return { success: true };
    } catch (error) {
        deps.logger.error('[AppBuilderComponent Runner] deploy failed', error as Error);
        return { success: false, error: toError(error).message };
    }
}

/** Reconstruct a minimal catalog entry from persisted state (redeploy fallback). */
function entryFromState(
    id: string,
    state: AppBuilderComponentState,
): AppBuilderComponentCatalogEntry {
    return {
        id,
        // Prefer the persisted display name (shell instances carry it) so a
        // redeploy does not clobber it with the id.
        name: state.name ?? id,
        description: '',
        kind: state.kind,
        source: {
            owner: state.source.owner,
            repo: state.source.repo,
            branch: state.source.branch ?? 'main',
        },
        providesEnvVars: state.providesEnvVars ? Object.keys(state.providesEnvVars) : undefined,
    };
}

/** Tear down the remote artifact for an App Builder component, by kind, under org-context. */
/**
 * Tear down a component's REMOTE artifacts, leaving the local clone and the keyed
 * state alone.
 *
 * Module-private again: it was briefly exported for the destination migration,
 * which no longer tears anything down — a move deploys to the new destination and
 * leaves the old one serving, because undeploy is the only irreversible step and
 * nobody asked for cleanup. `removeAppBuilderComponent` is the only caller.
 */
async function teardownRemote(
    project: Project,
    id: string,
    state: AppBuilderComponentState,
    deps: AppBuilderComponentRunnerDeps,
): Promise<void> {
    const componentPath = project.componentInstances?.[id]?.path;
    const command =
        state.kind === 'mesh' ? MESH_DELETE_COMMAND : 'aio app undeploy';
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
 * The project's selections with every mesh dependency dropped.
 *
 * Keyed by the LEGACY component ids (`eds-accs-mesh` and friends), which is what
 * `componentSelections.dependencies` holds — not the catalog ids.
 *
 * @param project - the project whose mesh selection is being revoked
 * @returns componentSelections with mesh dependencies removed
 */
function withoutMeshDependencies(project: Project): Project['componentSelections'] {
    const selections = project.componentSelections;
    if (!selections?.dependencies) return selections;
    return {
        ...selections,
        dependencies: selections.dependencies.filter((dep) => !isMeshComponentId(dep)),
    };
}

/**
 * The project's selections with one integration's id dropped from `appBuilder`.
 *
 * The integration counterpart of {@link withoutMeshDependencies}, and it exists
 * for the same reason: a selected-but-absent component is an error state, not a
 * resting one. Found live 2026-08-17 — an `add_integration` / `remove_integration`
 * round trip cleared the keyed entry and the component instance while leaving the
 * id in `componentSelections.appBuilder`.
 *
 * The cost lands at RESET, which rebuilds the component list from the selections
 * (`projectResetService`) and would try to re-clone a component that is gone.
 *
 * NOT `reconcileComponentSelections`: that helper is additive by design, because
 * a wizard selection not yet installed is a legitimate mid-creation state. Its
 * docstring assumed an explicit removal already cleaned up after itself — which
 * was true only for meshes until now.
 *
 * @param project - the project whose integration selection is being revoked
 * @param id - the integration id being removed
 * @returns componentSelections without that id
 */
function withoutIntegrationSelection(
    project: Project,
    id: string,
): Project['componentSelections'] {
    const selections = project.componentSelections;
    if (!selections?.appBuilder) return selections;
    return {
        ...selections,
        appBuilder: selections.appBuilder.filter((entry) => entry !== id),
    };
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

    const provided = Boolean(
        state.providesEnvVars && Object.keys(state.providesEnvVars).length > 0,
    );

    try {
        await teardownRemote(project, id, state, deps);
    } catch (error) {
        deps.logger.warn(
            `[AppBuilderComponent Runner] remote teardown warning: ${toError(error).message}`,
        );
    }

    await deps.componentManager.removeComponent(project, id, true);

    const cleared = {
        ...project,
        appBuilderComponents: { ...(project.appBuilderComponents ?? {}) },
        // Removing a MESH revokes the project's claim to one. `hasMesh`
        // (showDashboard) is instance OR keyed-state OR dependency, so clearing
        // only the keyed entry left the other two asserting a mesh that no longer
        // existed: the card kept rendering, stuck on "Checking requirements…",
        // and its Redeploy answered "This project does not have an API Mesh
        // component". A selected-but-absent mesh is an error state, not a resting
        // one — so the selection goes with the component.
        // Both kinds revoke their selection; they just live in different lists —
        // the persisted mesh rides `dependencies`, an integration rides
        // `appBuilder` (ADR-011). Only the mesh half existed until 2026-08-17.
        componentSelections:
            state.kind === 'mesh'
                ? withoutMeshDependencies(project)
                : withoutIntegrationSelection(project, id),
        // The component's API picks go with it. `componentApiPicks` records WHICH
        // integration wanted an API precisely so this moment can answer "is it safe
        // to drop?" — and nothing was spending that: three writers, no remover.
        // Left behind, the picks stay in resolveDesiredApis' union, so the next
        // reconcile PUT keeps subscribing for a component that no longer exists and
        // Manage APIs keeps listing it.
        //
        // Only the ATTRIBUTED key is dropped. UNATTRIBUTED_PICKS_KEY holds picks
        // made from the union view (Manage APIs) and migrated legacy ones; no
        // component claims them, so no removal can prove them safe to drop.
        ...(project.componentApiPicks
            ? { componentApiPicks: { ...project.componentApiPicks } }
            : {}),
        // The component's env-value copies go with it too. Configure's fan-out
        // writes a shared field only to SELECTED components, but the env/config
        // generators sweep the WHOLE map — configGenerator with
        // mesh-overrides-non-mesh priority — so a stranded entry's stale copy of
        // ADOBE_COMMERCE_URL (etc.) would outvote the backend's fresh value on
        // the next publish. Same failure shape as the 2026-08-10 wrong-website
        // bug. `stripOrphanedComponentConfigs` (loader) sweeps entries older
        // removals already stranded.
        ...(project.componentConfigs
            ? { componentConfigs: { ...project.componentConfigs } }
            : {}),
    };
    delete cleared.appBuilderComponents[id];
    if (cleared.componentApiPicks) {
        delete cleared.componentApiPicks[id];
    }
    if (cleared.componentConfigs) {
        delete cleared.componentConfigs[id];
    }
    // Sync the caller's reference too — a later save from a stale reference
    // would otherwise RESURRECT the removed integration (see persistOutcome).
    project.appBuilderComponents = cleared.appBuilderComponents;
    // Same stale-reference hazard as the entry above: a later save from the
    // caller's copy would otherwise restore the picks we just dropped.
    if (cleared.componentApiPicks) {
        project.componentApiPicks = cleared.componentApiPicks;
    }
    if (cleared.componentConfigs) {
        project.componentConfigs = cleared.componentConfigs;
    }
    await deps.saveProject(cleared);

    if (provided) {
        await deps.republishStorefront({
            project: cleared,
            secrets: deps.secrets,
            logger: deps.logger,
        });
    }

    return { success: true };
}
