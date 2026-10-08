/**
 * The App Builder component runner's contract: what every run is handed and what it
 * answers. The runs add, deploy and remove by `kind`, routing to the two existing deploy
 * tails (`deployMeshComponent`/`deployAppComponent`) rather than forking them:
 *
 * - add (`appBuilderAddRun.ts`): subscribe the UNION of all appBuilderComponents'
 *   requiredApis (+ baseline) → clone + kind-aware install → dispatch deploy (mesh → mesh
 *   tail; integration → app tail, applying a derived distinct `ow.package`), all inside
 *   `withOrgContext` → persist `appBuilderComponents[id]` → if it `providesEnvVars`,
 *   regenerate + republish the storefront config.
 * - deploy and update (`appBuilderRedeployRun.ts`): re-run ONLY that component's deploy
 *   tail (provider-before-consumer ordering for mesh-consuming integrations).
 * - remove (`appBuilderRemoveRun.ts`): integration → `aio app undeploy`; mesh →
 *   `aio api-mesh:delete` → clear `appBuilderComponents[id]` → if it provided vars,
 *   republish WITHOUT them.
 *
 * The steps the runs share live in `appBuilderDeploySteps.ts` and the kind dispatch in
 * `appBuilderDeployDispatch.ts`. Every deploy, add and redeploy, success and failure,
 * records its outcome through `recordDeployOutcome`, the one keyed deploy-record writer.
 *
 * Every external boundary (the two deploy tails, the API subscriber, clone/install,
 * undeploy/delete commands, storefront republish) is injected via
 * {@link AppBuilderComponentRunnerDeps}, so the runs are pure orchestration.
 */

import type { TeardownDeps } from './appBuilderComponentTeardown';
import type {
    AppManagementInstallOptions,
    AppManagementInstallResult,
} from './appManagementUpgrade';
import type { CustomIntegrationNodeResolver } from './componentEntry';
import type { WorkspaceReleaseDeps } from './componentWorkspace';
import type { CommerceDetachResult } from './erpDetach';
import type { ErpEventsEnv } from './erpEventsDelivery';
import type { SourceUpdateResult, UpdateCheckResult } from './integrationSourceUpdate';
import type { RuntimeCleanupSummary } from './runtimeLeftoverCleanup';
import type { UndeclaredActionCleanup } from './runtimeUndeclaredActions';
import type { AppDeploymentResult } from './types';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { CachedOrgRef } from '@/core/shell/orgContextEnv';
import type {
    ComponentInstallOptions,
    ComponentInstallResult,
} from '@/features/components/services/types';
import type { MeshDeploymentResult } from '@/features/mesh/services/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import type { TransformedComponentDefinition } from '@/types/components';
import type { ErrorCode } from '@/types/errorCodes';
import type { Logger } from '@/types/logger';
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
    /** The Adobe workspaces a removal deleted, by the name a person reads (remove only). */
    workspacesDeleted?: string[];
}

export type { RuntimeCleanupSummary };

/** Storefront republish input (mirrors the eds RepublishParams the runner needs). */
interface RepublishInput {
    project: Project;
    secrets: unknown;
    logger: Logger;
}

/** Which component a subscribe is for, and whether it is that component's add. */
export interface SubscribeScope {
    forComponent: string;
    /** An add: a new workspace holds nothing yet, so there is no coverage to check. */
    adding?: boolean;
}

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
export interface ComponentInstaller {
    installComponent(
        project: Project,
        componentDef: TransformedComponentDefinition,
        options?: ComponentInstallOptions
    ): Promise<ComponentInstallResult>;
    removeComponent(project: Project, componentId: string, deleteFiles?: boolean): Promise<void>;
}

/**
 * Injected collaborators. Production wires the real implementations
 * (see {@link buildDefaultRunnerDeps}); unit tests pass mocks.
 */
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
    resolveAppManagementEnv?: (
        project: Project,
        componentId: string
    ) => Promise<Record<string, string> | undefined>;
    /**
     * The deploy env carrying an entry's secrets: its screen key (`systemScreen.ts`,
     * generated the first time) and its secret settings from SecretStorage
     * (`componentSettingSecrets.ts`). Returns `{}` for an entry with neither. Carries
     * live secrets, so it goes into the per-invocation env and nowhere else.
     */
    resolveSecretEnv?: (
        project: Project,
        entry: AppBuilderComponentCatalogEntry
    ) => Promise<Record<string, string>>;
    /**
     * The event address and publishing credential an ADDED ERP deploys with
     * (`erpEventsDelivery.ts`, AB-16i), with a note when it deploys without them. Carries a
     * live secret, so it goes into the per-invocation env and nowhere else. Optional: bare
     * tests and headless callers without an ERP never need it.
     */
    resolveEventsEnv?: (
        project: Project,
        entry: AppBuilderComponentCatalogEntry
    ) => Promise<ErpEventsEnv>;
    /** Delete an entry's secrets (secret settings, screen key) when the component is removed. */
    forgetSecrets?: (project: Project, entry: AppBuilderComponentCatalogEntry) => Promise<void>;
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
        options?: AppManagementInstallOptions
    ) => Promise<AppManagementInstallResult>;
    /**
     * Fill the system an app-management entry serves from Commerce, once its Commerce
     * install stands (`fillErpForProject`; entries with `fillsSystem`). Filling is demo
     * setup, so Demo Builder does it rather than the integration (AB-26y). Never fails
     * the deploy. Optional: deploy-only paths and bare tests never need it.
     */
    /**
     * Take a system added from its integration's card out of the integration's list
     * (`syncErpList`, AB-16) before it is removed. Answers why it could not, or undefined.
     * Optional: bare tests and integrations that list nothing never need it.
     */
    unlistSystem?: (
        project: Project,
        integrationId: string,
        systemId: string
    ) => Promise<string | undefined>;
    /**
     * Tell an integration which systems it serves, by the ids and addresses they deploy
     * with (`syncErpList`, AB-51): after the integration deploys, before its fill asks by
     * those ids, and after a listed system redeploys. Answers why it could not, or
     * undefined. Optional: bare tests and integrations that list nothing never need it.
     */
    listSystems?: (project: Project, integrationId: string) => Promise<string | undefined>;
    fillSystem?: (
        project: Project,
        entry: AppBuilderComponentCatalogEntry,
        onStep: (step: string) => void
    ) => Promise<{ status: 'filled' } | { status: 'failed'; detail: string }>;
    /** The version an app's manifest declares (appManifestVersion); optional for bare tests. */
    readAppVersion?: (componentPath: string) => Promise<string | undefined>;
    /** Fast-forward a clone to its branch (integrationSourceUpdate); update only. */
    fetchComponentSource?: (componentPath: string, branch: string) => Promise<SourceUpdateResult>;
    /** Whether a clone's branch has newer commits (integrationSourceUpdate); update check only. */
    checkComponentSource?: (componentPath: string, branch: string) => Promise<UpdateCheckResult>;
    /** Reads a custom integration's Node range at the add door (PR-1a step 8); absent = Demo Builder's Node. */
    resolveCustomIntegrationNode?: CustomIntegrationNodeResolver;
    /** npm install (and build) in an existing clone, on `nodeVersion`; update only. */
    installComponentDependencies?: (
        componentPath: string,
        definition: TransformedComponentDefinition,
        nodeVersion: string,
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
        scope?: SubscribeScope
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
        onMaking?: () => void
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
        workspace: { id: string; name: string }
    ) => Promise<{ error: string } | undefined>;
    /** Storefront config regen + republish (step 04 generalized providesEnvVars path). */
    republishStorefront: (
        input: RepublishInput
    ) => Promise<{ success: boolean; error?: string; cdnError?: string }>;
    /**
     * After a deploy, delete the actions the apps at these paths no longer declare, and the
     * rules and triggers that started them (`runtimeUndeclaredActions.ts`); `aio` never does.
     * Runs inside the deploy's org context. Absent in tests that do not exercise it.
     */
    deleteUndeclaredActions?: (componentPaths: string[]) => Promise<UndeclaredActionCleanup>;
    /** A workspace's Runtime key, read before a removal deletes it (`componentWorkspaceRelease.ts`). */
    namespaceKeyOf?: WorkspaceReleaseDeps['namespaceKeyOf'];
    /** Confirm, in the background, that a deleted workspace's Runtime namespace is gone. */
    watchNamespaceRemoval?: WorkspaceReleaseDeps['watchNamespaceRemoval'];
    /** Every appBuilderComponent in the project's catalog (for the union subscribe). */
    catalog: AppBuilderComponentCatalogEntry[];
    /** Secret storage forwarded to the republish path. */
    secrets: unknown;
}
