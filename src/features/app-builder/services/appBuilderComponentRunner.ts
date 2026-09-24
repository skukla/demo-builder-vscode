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

import {
    cleanUpBeforeUndeploy,
    leftBehind,
    mergeCleanup,
    removalStopped,
    teardownRemote,
    verifyRuntimeTeardown,
    type CleanupOutcome,
    type RuntimeCleanupSummary,
    type TeardownDeps,
    type TeardownTarget,
} from './appBuilderComponentTeardown';
import {
    identityOf,
    integrationOutcome,
    recordDeployOutcome,
    type DeployOutcome,
} from './appBuilderDeployOutcome';
import {
    detectAppLayout,
    listDeclaredPackageNames,
    listDeclaredTriggersAndRules,
    type AppConfigLayout,
} from './appConfigPackages';
import type { AppManagementInstallOptions, AppManagementInstallResult } from './appManagementUpgrade';
import { catalogEntryFor, entryFromState, pairedEntry } from './componentEntry';
import { entriesSharingWorkspace } from './componentWorkspace';
import {
    displayNameInProject,
    ensureCommerceAppId,
    resolveDeployInputs,
    resolveDisplayName,
} from './deployInputs';
import type { CommerceDetachResult } from './erpDetach';
import type { SourceUpdateResult, UpdateCheckResult } from './integrationSourceUpdate';
import { deriveOwPackage } from './owPackageName';
import type { DeclaredRuntime } from './runtimeNamespace';
import type { AppDeploymentResult } from './types';
import { isMeshComponentId } from '@/core/constants';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { buildOrgTargetFromProjectAdobe, withOrgContext, type CachedOrgRef } from '@/core/shell/orgContextEnv';
import {
    clearUpdateAvailable,
    getProvidedEnvVars,
    recordInstallation,
    workspacesHeldBy,
    workspacesToRelease,
} from '@/core/state/appBuilderComponentState';
import { reconcileComponentSelections } from '@/core/state/componentSelectionReconcile';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { explainAdobeAccessFailure } from '@/features/authentication/services/authenticationErrorFormatter';
import {
    integrationUsing,
    linkBroughtSystem,
    pairedInstanceId,
    systemsUsedBy,
} from '@/features/components/services/appBuilderComponentLinks';
import type {
    ComponentInstallOptions,
    ComponentInstallResult,
} from '@/features/components/services/types';
import type { MeshDeploymentResult } from '@/features/mesh/services/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project , AppBuilderComponentState } from '@/types/base';
import type { TransformedComponentDefinition } from '@/types/components';
import type { ErrorCode } from '@/types/errorCodes';
import type { Logger } from '@/types/logger';
import { toError } from '@/types/typeGuards';
import type { OperationPosition } from '@/types/webviewPayloads';

/** Outcome of an add/deploy/remove operation. */
export interface RunnerResult {
    success: boolean;
    error?: string;
    /** COMPONENT_REMOVAL_STOPPED: a removal stopped before undeploying (remove only). */
    code?: ErrorCode;
    /** Plain-words line on what an update did (update only). */
    detail?: string;
    /** Post-undeploy Runtime verification (remove only) — see AB-7. */
    runtimeCleanup?: RuntimeCleanupSummary;
    /** What removal undid of the ERP integration's Commerce writes (remove only). */
    commerceDetach?: CommerceDetachResult;
    /**
     * What the operation could not finish, in plain words for the SC, while the
     * operation itself stands: a Commerce uninstall that failed or a system not
     * removed with its integration (remove); a storefront republish whose CDN
     * publish did not land, so the storefront still serves its previous
     * config.json (add and deploy).
     */
    warnings?: string[];
}

export type { RuntimeCleanupSummary };

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
/**
 * What this runner needs from the component manager: TWO methods.
 *
 * The dependency named the concrete `ComponentManager` class until 2026-09-01, and
 * the class has sixteen members — so every caller had to supply, or pretend to
 * supply, fourteen it never touches. In the suite that meant 29 `as never` casts on
 * the deps argument, which is the position where a wrong shape is a silenced type
 * error rather than a style choice.
 *
 * This is the same correction already made for `StateManager`: a consumer depends on
 * the INTERFACE it uses, not on the class that happens to implement it (ADR-015).
 * `ComponentManager` satisfies this structurally, so production wiring is unchanged.
 */
/** Which component a subscribe is for, and whether it is that component's add. */
export interface SubscribeScope {
    forComponent: string;
    /** An add: a new workspace holds nothing yet, so there is no coverage to check. */
    adding?: boolean;
}

export interface ComponentInstaller {
    installComponent(
        project: Project,
        componentDef: TransformedComponentDefinition,
        options?: ComponentInstallOptions,
    ): Promise<ComponentInstallResult>;
    removeComponent(project: Project, componentId: string, deleteFiles?: boolean): Promise<void>;
}

export interface AppBuilderComponentRunnerDeps extends TeardownDeps {
    componentManager: ComponentInstaller;
    commandManager: CommandExecutor;
    logger: Logger;
    saveProject: (project: Project) => Promise<void>;
    getCachedOrganization: () => CachedOrgRef | undefined;
    /**
     * Re-generate the AI bundle after the project's COMPOSITION changed.
     *
     * Which skills a project gets follows what it builds — the integration
     * starter kit's set goes to projects with an App Builder app, not to every
     * storefront (AI-1o). Attaching or removing one changes that answer, and
     * nothing else re-asks it: the activation sweep only rewrites content when
     * `AI_CONTEXT_VERSION` moves, and the freshness badge only fires when a
     * PACKAGE is missing, which it is not here. So an integration added to a
     * storefront used to arrive with none of the skills written for it.
     *
     * Optional: unit tests and headless callers that only exercise deploy
     * mechanics have no bundle to keep in step.
     */
    refreshAiBundle?: (project: Project) => Promise<void>;
    /**
     * Where the deploy tails' step reports go.
     *
     * The tails already emit every step and their signatures have always declared
     * `onProgress`; the add path just called them without it, so a dashboard add
     * showed one static title while the build and deploy ran silently. Optional
     * because the headless/MCP callers have nobody to tell.
     */
    onProgress?: (message: string, subMessage?: string, position?: OperationPosition) => void;
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
        opts?: {
            onProgress?: (m: string, s?: string) => void;
            nodeVersion?: string;
            layout?: 'standalone' | 'extension';
            confirmToolchainRefresh?: () => Promise<boolean>;
            extraEnv?: Record<string, string>;
            /** Where the whole deploy output goes when it fails (see appDeployment). */
            failureLogFile?: string;
        }
    ) => Promise<AppDeploymentResult>;
    /**
     * Consent source for the toolchain refresh-and-retry (see
     * DeployAppOptions.confirmToolchainRefresh). UI callers wire a prompt;
     * headless callers wire the request's `refreshCli` flag.
     */
    confirmToolchainRefresh?: () => Promise<boolean>;
    /**
     * Ensure a Node MAJOR version is available via fnm (installing it when
     * absent) BEFORE a component that declares one installs/deploys. The one
     * chokepoint every add path shares — the graphical prerequisites step runs
     * before integrations are even selectable, and the dashboard/MCP adds
     * never pass it. Returns an error string when the version cannot be made
     * available; undefined = proceed.
     */
    ensureNodeVersion?: (version: string) => Promise<string | undefined>;
    /**
     * Resolve extra deploy ENV for an app-management lifecycle entry — the
     * `AIO_COMMERCE_AUTH_IMS_*` credential vars its generated actions take as
     * inputs (s2sDeployEnv via the workspace S2S credential). Called only for
     * `lifecycle: 'app-management'` entries; carries a live secret, so the
     * value goes into the per-invocation env and nowhere else. Optional:
     * mesh/standalone paths and bare unit tests never need it.
     */
    resolveAppManagementEnv?: (project: Project, componentId: string) => Promise<Record<string, string> | undefined>;
    /**
     * The deploy env carrying an entry's secrets: its screen key (`systemScreen.ts`,
     * generated the first time) and its secret settings from SecretStorage
     * (`componentSettingSecrets.ts`). Returns `{}` for an entry with neither. Carries
     * live secrets, so it goes into the per-invocation env and nowhere else.
     */
    resolveSecretEnv?: (project: Project, entry: AppBuilderComponentCatalogEntry) => Promise<Record<string, string>>;
    /** Delete an entry's screen key when the component is removed. */
    forgetScreenKey?: (project: Project, entry: AppBuilderComponentCatalogEntry) => Promise<void>;
    /**
     * Install + associate an app-management lifecycle app after its deploy
     * (appManagementInstaller). Deploy stays green when this fails — the app is
     * deployed, merely dormant, and the outcome persists on
     * `appBuilderComponents[id].installation` with the hands-back line.
     * Optional: mesh/standalone paths and bare unit tests never need it.
     */
    installAppManagement?: (
        project: Project,
        componentId: string,
        onProgress?: (message: string) => void,
        options?: AppManagementInstallOptions,
    ) => Promise<AppManagementInstallResult>;
    /** The version an app's manifest declares (appManifestVersion); optional for bare tests. */
    readAppVersion?: (componentPath: string) => Promise<string | undefined>;
    /** Fast-forward a clone to its branch (integrationSourceUpdate); update only. */
    fetchComponentSource?: (componentPath: string, branch: string) => Promise<SourceUpdateResult>;
    /** Whether a clone's branch has newer commits (integrationSourceUpdate); update check only. */
    checkComponentSource?: (componentPath: string, branch: string) => Promise<UpdateCheckResult>;
    /** npm install (and build) in an existing clone; update only. */
    installComponentDependencies?: (
        componentPath: string,
        definition: TransformedComponentDefinition,
    ) => Promise<{ success: boolean; error?: string }>;
    /**
     * Union-reconcile API subscriber (step 07). `onStep` carries its own short
     * lines to the screen: this step can hold still for a minute and a stage name
     * alone reads as frozen (owner, 2026-09-19). `scope` names the ONE component
     * the subscribe is for, whose workspace it targets; without it the subscribe
     * is the project-wide reconcile on the project's workspace.
     */
    subscribeRequiredApis: (
        appBuilderComponents: AppBuilderComponentCatalogEntry[],
        project: Project,
        onStep?: (step: string) => void,
        scope?: SubscribeScope,
    ) => Promise<void>;
    /**
     * Give a component being ADDED its own Adobe workspace, and record it on the
     * component (AB-23).
     *
     * Returns a reason when the workspace could not be made. That is a HARD failure,
     * not best-effort: an add that carried on would deploy into the project's
     * workspace, where an App Management app's fixed package names overwrite whatever
     * is already there — the exact collision this item exists to remove.
     *
     * A component that is bound to another (an ERP and its integration) joins that
     * one's workspace rather than making a second, so the unit is one workspace per
     * ADD rather than per component.
     */
    createComponentWorkspace: (
        project: Project,
        entry: AppBuilderComponentCatalogEntry,
        /** Called only when a workspace is actually made, not when one is joined. */
        onMaking?: () => void,
    ) => Promise<{ error: string } | undefined>;
    /**
     * Delete a workspace a removed component held (AB-23), so removal returns the
     * project to what it was — the reversal the create on add earns.
     *
     * Returns a reason rather than throwing. A failure here is a WARNING, not a
     * failed removal: the component is already undeployed and cleared by the time
     * this runs, so refusing would leave the SC with a half-removed integration to
     * argue with. An undeleted workspace is untidy; a stuck removal is not.
     */
    deleteComponentWorkspace: (
        project: Project,
        workspace: { id: string; name: string },
    ) => Promise<{ error: string } | undefined>;
    /** Storefront config regen + republish (step 04 generalized providesEnvVars path). */
    republishStorefront: (
        input: RepublishInput,
    ) => Promise<{ success: boolean; error?: string; cdnError?: string }>;
    /** Every appBuilderComponent in the project's catalog (for the union subscribe). */
    catalog: AppBuilderComponentCatalogEntry[];
    /** Secret storage forwarded to the republish path. */
    secrets: unknown;
}

/**
 * The org-context target a component's Adobe calls run under.
 *
 * A component may live in its OWN workspace (AB-23). When it records one, that is
 * what deploys, redeploys, undeploys and verifies target; when it does not, the
 * project's workspace is the answer — which is every component created before this
 * existed, and the reason no migration is needed.
 *
 * Only the workspace moves. The org and the Console project are the project's, and
 * a component cannot be in a different one.
 *
 * `componentId` is optional so a call with nothing to resolve reads the same as it
 * did, but every call inside this module passes one: a deploy that silently used
 * the project's workspace for a component that has its own would deploy to the
 * wrong namespace and report success.
 */
function targetFor(
    project: Project,
    deps: AppBuilderComponentRunnerDeps,
    componentId?: string,
) {
    const base = buildOrgTargetFromProjectAdobe(project.adobe, deps.getCachedOrganization());
    const own = componentId ? project.appBuilderComponents?.[componentId]?.workspace : undefined;
    return own ? { ...base, workspaceId: own.id } : base;
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
        configuration: {
            requiresDeployment: true,
            deploymentTarget: 'adobe-io',
            // The entry's declared node feeds the existing fnm machinery in
            // ComponentDependencies; strictInstall makes a refused npm install
            // abort the add with npm's own error (AB-3).
            nodeVersion: entry.nodeVersion,
            strictInstall: true,
        },
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
/**
 * Run the caller's bundle refresh, swallowing failures.
 *
 * A deploy that succeeded must not report failure because a markdown file could
 * not be rewritten — the bundle is repaired again on the next activation sweep
 * or by "Regenerate AI Files". The log line is the trail.
 */
async function refreshBundleQuietly(
    project: Project,
    deps: AppBuilderComponentRunnerDeps,
    reason: 'add' | 'remove',
): Promise<void> {
    if (!deps.refreshAiBundle) return;
    try {
        await deps.refreshAiBundle(project);
    } catch (err) {
        deps.logger.warn(
            `[AppBuilder] Could not refresh the AI bundle after an integration ${reason}: ` +
                (err instanceof Error ? err.message : String(err)),
        );
    }
}

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
    // Composition changed — the skill set follows it. Best-effort: a bundle
    // refresh must never fail a deploy that already landed.
    await refreshBundleQuietly(project, deps, 'add');
}

/** The one provided value the storefront config reads (configGenerator). */
const STOREFRONT_PROVIDED_VAR = 'MESH_ENDPOINT';

/**
 * Republish the storefront when the project carries the provided var the
 * storefront config READS (else no-op). A component that provides only to other
 * components — the ERP's base URL to its integration — changes nothing the
 * storefront serves, so it earns no republish.
 *
 * @returns a warning for the SC when the republish did not fully land — the
 *   operation stands, but the storefront is not current. On 2026-09-24 an add
 *   reported done over a CDN publish refused for want of a DA.live session, and
 *   only the Debug Logs knew.
 */
async function republishIfProvided(
    project: Project,
    deps: AppBuilderComponentRunnerDeps,
): Promise<string | undefined> {
    if (!(STOREFRONT_PROVIDED_VAR in getProvidedEnvVars(project))) {
        return undefined;
    }
    const published = await deps.republishStorefront({
        project,
        secrets: deps.secrets,
        logger: deps.logger,
    });
    if (!published.success) {
        return `The storefront was not republished: ${published.error ?? 'the republish did not finish'}`;
    }
    if (published.cdnError) {
        return `The storefront still serves its previous config.json: ${published.cdnError}`;
    }
    return undefined;
}

/** A finished add or deploy, carrying the republish warning when there is one. */
function withRepublishWarning(warning: string | undefined): RunnerResult {
    return { success: true, ...(warning ? { warnings: [warning] } : {}) };
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

/**
 * What the SC reads for a failure: Adobe's permission and outage refusals in plain words,
 * anything else as it was written. Adobe's own words still reach Debug Logs.
 */
function readableFailure(reason: string, logger: Logger): string {
    const plain = explainAdobeAccessFailure(reason);
    if (!plain) return reason;
    logger.warn(`[AppBuilderComponent Runner] Adobe refused: ${reason}`);
    return plain;
}

/**
 * A failed deploy's outcome — INCLUDING why it failed.
 *
 * The reason used to be returned to the caller and dropped from state, so a
 * failed add persisted `status:'error'` with nothing to explain it and no surface
 * could answer "why?" once the notification faded. `error` is the one field a
 * failed entry exists to carry.
 *
 * `name` is the component's own: the name it already has on a redeploy, the
 * name its deploy would give it on an add. The catalog's name here renamed a
 * failed "Acme ERP" to "ERP" (2026-09-18).
 */
function errorOutcome(entry: AppBuilderComponentCatalogEntry, reason: string, name: string): DeployOutcome {
    return { status: 'error', ...identityOf(entry), name, error: reason };
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
    if (ensureCommerceAppId(project, entry, deps.catalog)) {
        await deps.saveProject(project);
    }
    // The app's own inputs — its settings, a bound integration's values, the
    // schema defaults, and what other components provide (the ERP's base URL to
    // its integration) — ride the deploy's process env, the same way the
    // credentials below do. Catalog app repos ship no `.env` by design.
    const inputs = resolveDeployInputs(project, entry);
    let extraEnv: Record<string, string> = { ...inputs };
    if (deps.resolveSecretEnv) {
        extraEnv = { ...extraEnv, ...(await deps.resolveSecretEnv(project, entry)) };
    }
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
            nodeVersion: entry.nodeVersion,
            layout: entry.layout,
            confirmToolchainRefresh: deps.confirmToolchainRefresh,
            extraEnv: Object.keys(extraEnv).length > 0 ? extraEnv : undefined,
            // The project's own logs folder, made at creation — see deployFailureLog.
            // A plain '/' join: Node accepts it on every platform, and a `path`
            // import here would take this file past its 15-import coupling line.
            failureLogFile: project.path ? `${project.path}/logs/${entry.id}-deploy.log` : undefined,
        },
    );
    return result.success
        ? { ok: true, outcome: integrationOutcome(entry, result.data, resolveDisplayName(entry, inputs)) }
        : { ok: false, error: result.error || 'App deployment failed.' };
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
    const kind = entry.catalogId ?? entry.id;
    const system = catalog.find((candidate) => candidate.kind === 'system' && candidate.boundTo === kind);
    return system && pairedEntry(entry, system);
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
    return { ...deps, onProgress: (message, subMessage) => report(message, subMessage, { index, total, name }) };
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
        if (entry.nodeVersion) {
            // Visible, not silent: a first-time fnm install takes ~30s and the
            // progress channel is the surface every add path already has.
            // "Installing … (one-time install)" was said even when Node was already
            // there — every add of a pair said it twice (2026-09-21).
            deps.onProgress?.(OPERATION_STAGES.preparingNode.label, `Node ${entry.nodeVersion}`);
            const nodeError = await deps.ensureNodeVersion?.(entry.nodeVersion);
            if (nodeError) {
                return { success: false, error: nodeError };
            }
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
        project.appBuilderComponents = {
            ...(project.appBuilderComponents ?? {}),
            [entry.id]: {
                ...(workspace ? { workspace } : {}),
                ...(entry.catalogId ? { catalogId: entry.catalogId } : {}),
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
        await installIfAppManagement(project, entry, deps, { componentPath: installed.path, since });
        return withRepublishWarning(await republishIfProvided(project, deps));
    } catch (error) {
        deps.logger.error('[AppBuilderComponent Runner] add failed', error as Error);
        return { success: false, error: readableFailure(toError(error).message, deps.logger) };
    }
}

/**
 * The post-deploy install pass for `lifecycle: 'app-management'` apps.
 *
 * Runs AFTER the deploy outcome persisted, and never fails the deploy: the app
 * IS deployed — an install failure leaves it dormant with the hands-back
 * recorded on `installation`, which is the owner's automatic-with-hands-back
 * decision (2026-08-27). No-op for every other entry, and when the caller
 * wired no installer (mesh paths, bare tests).
 */
async function installIfAppManagement(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    deps: AppBuilderComponentRunnerDeps,
    deploy: { componentPath: string; since: string },
): Promise<void> {
    if (entry.lifecycle !== 'app-management' || !deps.installAppManagement) {
        return;
    }
    const state = project.appBuilderComponents?.[entry.id];
    const options: AppManagementInstallOptions = {
        appVersion: await deps.readAppVersion?.(deploy.componentPath),
        since: deploy.since,
    };
    // The installer's messages carry live detail (retry rounds), so they are the STEP
    // under one install stage — the stage keeps its expectation line while they change.
    const result = await deps.installAppManagement(
        project,
        entry.id,
        (message) => deps.onProgress?.(OPERATION_STAGES.installingIntoCommerce.label, message),
        options,
    );
    if (state) {
        recordInstallation(state, result);
        await deps.saveProject(project);
    }
    if (result.status === 'upgraded' && result.detail) {
        deps.onProgress?.(result.detail);
    }
    if (result.status === 'failed') {
        deps.logger.warn(
            `[AppBuilderComponent Runner] ${entry.id} deployed but not installed: ${result.detail}`,
        );
        deps.onProgress?.(
            OPERATION_STAGES.installingIntoCommerce.label,
            result.detail ?? 'Install into Commerce did not finish.',
        );
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

        if (entry.nodeVersion) {
            deps.onProgress?.(
            OPERATION_STAGES.preparingNode.label,
            `Installing Node ${entry.nodeVersion} (one-time install)`,
        );
            const nodeError = await deps.ensureNodeVersion?.(entry.nodeVersion);
            if (nodeError) {
                // Thrown so the catch below records it — the marker is already saved.
                throw new Error(nodeError);
            }
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
            const name = existing.name ?? resolveDisplayName(entry, resolveDeployInputs(project, entry));
            const reason = readableFailure(deployed.error, deps.logger);
            recordDeployOutcome(project, entry.kind, id, errorOutcome(entry, reason, name));
            await deps.saveProject(project);
            return { success: false, error: reason };
        }
        recordDeployOutcome(project, entry.kind, id, deployed.outcome);
        await deps.saveProject(project);
        await installIfAppManagement(project, entry, deps, { componentPath, since });
        return withRepublishWarning(await republishIfProvided(project, deps));
    } catch (error) {
        deps.logger.error('[AppBuilderComponent Runner] deploy failed', error as Error);
        const reason = readableFailure(toError(error).message, deps.logger);
        // Record it, as the deploy-failure path above does. A failure before the
        // deploy (the API subscribe, most often) left the tile on an OLDER run's
        // error — Bodea's integration showed a two-day-old 403 over that day's
        // "requires selection of a product" (2026-09-19). Best-effort: the save
        // itself may be what failed, and the caller must still get this answer.
        const name = existing.name ?? resolveDisplayName(entry, resolveDeployInputs(project, entry));
        recordDeployOutcome(project, entry.kind, id, errorOutcome(entry, reason, name));
        await deps.saveProject(project).catch((saveError: unknown) =>
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
    const existing = project.appBuilderComponents?.[id];
    const componentPath = project.componentInstances?.[id]?.path;
    if (!existing || !componentPath) {
        return { success: false, error: `AppBuilderComponent "${id}" not found.` };
    }
    if (!deps.fetchComponentSource || !deps.installComponentDependencies) {
        return { success: false, error: 'Updating integrations is not available here.' };
    }
    const entry = catalogEntryFor(project, id, deps.catalog) ?? entryFromState(id, existing);

    deps.onProgress?.(OPERATION_STAGES.fetchingUpdate.label);
    const fetched = await deps.fetchComponentSource(componentPath, existing.source.branch ?? 'main');
    if (fetched.status === 'refused' || fetched.status === 'failed') {
        return { success: false, error: fetched.detail };
    }
    // A component whose last deploy failed is redeployed even when its code is
    // current: an earlier Update that fetched the code and then failed to deploy
    // left it current, and the shortcut below answered "nothing to do" and left
    // it failed (2026-09-18).
    if (fetched.status === 'current' && existing.status !== 'error') {
        const onDisk = await deps.readAppVersion?.(componentPath);
        const installed = existing.installation?.version;
        if (!onDisk || onDisk === installed) {
            await forgetUpdate(project, id, deps);
            return { success: true, detail: fetched.detail };
        }
    } else {
        deps.onProgress?.(OPERATION_STAGES.installingUpdateDependencies.label);
        const dependencies = await deps.installComponentDependencies(componentPath, buildDefinition(entry));
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
    return { ...deployed, detail: fetched.detail };
}

/** A finished update leaves nothing to offer; drop the recorded one. */
async function forgetUpdate(project: Project, id: string, deps: AppBuilderComponentRunnerDeps): Promise<void> {
    // Read afresh: the deploy may have replaced the record.
    const state = project.appBuilderComponents?.[id];
    if (!state?.updateAvailable) return;
    clearUpdateAvailable(state);
    await deps.saveProject(project);
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
function withoutIntegrationSelection(project: Project, id: string): Project['componentSelections'] {
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
    options: RemoveOptions = {},
): Promise<RunnerResult> {
    const state = project.appBuilderComponents?.[id];
    if (!state) {
        return { success: false, error: `AppBuilderComponent "${id}" not found.` };
    }

    // A linked system goes with its integration, whichever card asked (decision
    // 2): remove the integration, which takes its systems after it. Once the
    // integration's record is gone the link no longer resolves, so this cannot loop.
    const consumerId = integrationUsing(project, id, deps.catalog);
    if (consumerId) {
        return removeAppBuilderComponent(project, consumerId, deps, options);
    }
    // Read before the record goes: afterwards nothing says which systems it used.
    const systems = state.kind === 'integration' ? systemsUsedBy(project, id, deps.catalog) : [];
    // Same reason: once the records are cleared, nothing says which workspaces these
    // components held, and a workspace nothing names cannot be found or deleted.
    const heldWorkspaces = workspacesHeldBy(project, [id, ...systems]);

    // The storefront config reads ONE provided var; a component providing only
    // to other components (the ERP) earns no republish on its way out.
    const provided = Boolean(state.providesEnvVars && STOREFRONT_PROVIDED_VAR in state.providesEnvVars);

    // BEFORE the undeploy, while the code that does it still exists: the
    // integration's Commerce undo and uninstall (AB-4; `aio app undeploy` removes
    // only the actions, residue measured live 2026-08-27), and the records of the
    // systems that go with it. A step that fails stops the removal here, with
    // nothing undeployed, unless the SC chose to remove anyway.
    const cleanup = options.cleanedUp ? NOTHING_UNFINISHED : await cleanUpPair(project, id, state, systems, deps);
    if (cleanup.unfinished.length > 0 && !options.force) {
        const stopped = removalStopped(cleanup.unfinished);
        state.removalStopped = stopped.error;
        await deps.saveProject(project);
        return stopped;
    }

    // The declared package inventory is read BEFORE the undeploy and the local
    // delete — afterwards the config files it attributes by are gone.
    const componentPath = project.componentInstances?.[id]?.path;
    let declared: DeclaredRuntime = { packages: [], triggers: [], rules: [] };
    if (state.kind !== 'mesh' && componentPath) {
        const [packages, timersAndRules] = await Promise.all([
            listDeclaredPackageNames(componentPath).catch(() => []),
            listDeclaredTriggersAndRules(componentPath).catch(() => ({ triggers: [], rules: [] })),
        ]);
        declared = { packages, ...timersAndRules };
    }

    const shownName = state.name ?? project.componentInstances?.[id]?.name ?? id;
    deps.onProgress?.(OPERATION_STAGES.removing.label, `Undeploying ${shownName}`);
    try {
        await teardownRemote(targetFor(project, deps, id), componentPath, state.kind, deps);
    } catch (error) {
        deps.logger.warn(
            `[AppBuilderComponent Runner] remote teardown warning: ${toError(error).message}`,
        );
    }

    // Trust nothing: `aio app undeploy` exits 0 with packages still deployed
    // (AB-7, measured live). Meshes verify via their own status flow.
    if (state.kind !== 'mesh') deps.onProgress?.(OPERATION_STAGES.checkingLeftovers.label);
    const runtimeCleanup =
        state.kind !== 'mesh'
            ? await verifyRuntimeTeardown(targetFor(project, deps, id), id, declared, deps)
            : undefined;

    // A missing instance (a folder removed by hand, a half-finished add) must not
    // stop the state cleanup below: the remote side is already gone (gap 4).
    await deps.componentManager.removeComponent(project, id, true).catch((error: unknown) => {
        deps.logger.warn(`[AppBuilderComponent Runner] ${id} local removal skipped: ${toError(error).message}`);
    });

    // Read while the record is still there: a second copy's entry comes from it.
    const removedEntry = catalogEntryFor(project, id, deps.catalog);
    const cleared = withoutComponent(project, id, state);
    await deps.saveProject(cleared);

    // AFTER the records are cleared, so "is anything still using this workspace?" is
    // asked of the project as it now stands. A bound pair shares one, and removing a
    // pair goes through the integration and takes its systems with it — so the shared
    // workspace is released exactly once, when the last holder is gone.
    for (const workspace of workspacesToRelease(heldWorkspaces, cleared)) {
        deps.onProgress?.(OPERATION_STAGES.removingWorkspace.label);
        const failure = await deps.deleteComponentWorkspace(cleared, workspace);
        if (failure) {
            deps.logger.warn(
                `[AppBuilderComponent Runner] workspace ${workspace.name} was left behind: ` +
                    failure.error,
            );
        }
    }
    // The screen key goes with the component: nothing reads it again, and a
    // secret left in SecretStorage is one nobody owns.
    if (removedEntry && deps.forgetScreenKey) {
        await deps.forgetScreenKey(project, removedEntry);
    }
    // The inverse of the add, and it has always been broken the same way:
    // remove the last App Builder component and its skills stayed forever.
    await refreshBundleQuietly(cleared, deps, 'remove');

    if (provided) {
        await deps.republishStorefront({
            project: cleared,
            secrets: deps.secrets,
            logger: deps.logger,
        });
    }

    const after = await removeBoundSystemsAfter(cleared, project, id, systems, deps, options);
    return removalResult(mergeCleanup(runtimeCleanup, after.runtimeCleanup), cleanup.commerceDetach, [
        ...leftBehind(cleanup),
        ...after.warnings,
    ]);
}

/** How a removal treats a clean-up that did not finish. */
export interface RemoveOptions {
    /** Remove anyway: report what did not finish instead of stopping. */
    force?: boolean;
    /** The pair's removal already ran this system's clean-up (internal). */
    cleanedUp?: boolean;
}

const NOTHING_UNFINISHED: CleanupOutcome = { unfinished: [] };

/** The catalog entry behind a record: the catalog's, else one read off the record. */
function entryFor(
    project: Project,
    id: string,
    state: AppBuilderComponentState,
    deps: AppBuilderComponentRunnerDeps,
) {
    return catalogEntryFor(project, id, deps.catalog) ?? entryFromState(id, state);
}

/**
 * The clean-up for a component and the systems removed with it, all before any
 * undeploy, so a failure in either stops the pair with nothing removed.
 */
async function cleanUpPair(
    project: Project,
    id: string,
    state: AppBuilderComponentState,
    systems: string[],
    deps: AppBuilderComponentRunnerDeps,
): Promise<CleanupOutcome> {
    const targets: TeardownTarget[] = [{ project, id, state, entry: entryFor(project, id, state, deps) }];
    for (const systemId of systems) {
        const system = project.appBuilderComponents?.[systemId];
        if (system) targets.push({ project, id: systemId, state: system, entry: entryFor(project, systemId, system, deps) });
    }
    const [own, ...rest] = await sequence(targets, (target) => cleanUpBeforeUndeploy(target, deps));
    return { ...own, unfinished: [...own.unfinished, ...rest.flatMap((r) => r.unfinished)] };
}

/** Run `fn` over `items` one at a time, in order. */
async function sequence<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = [];
    for (const item of items) results.push(await fn(item));
    return results;
}

/**
 * The project without one component: its record, its selection, its API picks
 * and its env-value copies. The caller's reference is synced too.
 */
function withoutComponent(project: Project, id: string, state: AppBuilderComponentState): Project & {
    appBuilderComponents: NonNullable<Project['appBuilderComponents']>;
} {
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
        ...(project.componentConfigs ? { componentConfigs: { ...project.componentConfigs } } : {}),
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
    return cleared;
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
): Promise<{ warnings: string[]; runtimeCleanup?: RuntimeCleanupSummary }> {
    const warnings: string[] = [];
    let runtimeCleanup: RuntimeCleanupSummary | undefined;
    for (const systemId of systems) {
        const name = cleared.appBuilderComponents?.[systemId]?.name ?? systemId;
        if (!cleared.appBuilderComponents?.[systemId]) continue;
        deps.onProgress?.(OPERATION_STAGES.removing.label, `Removing ${name}`);
        // A throw's own words go to the log; the SC reads a sentence of ours.
        const result = await removeAppBuilderComponent(cleared, systemId, deps, { ...options, cleanedUp: true }).catch((error: unknown): RunnerResult => {
            deps.logger.warn(`[AppBuilderComponent Runner] ${systemId} removal threw: ${toError(error).message}`);
            return { success: false, error: 'it stopped partway, and the Debug Logs say why' };
        });
        if (!result.success) {
            deps.logger.warn(
                `[AppBuilderComponent Runner] ${systemId} was not removed with ${integrationId}: ${result.error}`,
            );
            warnings.push(`${name} was not removed: ${result.error}. Remove it from its card.`);
        }
        warnings.push(...(result.warnings ?? []));
        runtimeCleanup = mergeCleanup(runtimeCleanup, result.runtimeCleanup);
    }
    // The caller's reference follows the later removals too.
    caller.appBuilderComponents = cleared.appBuilderComponents;
    return { warnings, runtimeCleanup };
}
