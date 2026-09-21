/**
 * Default deps factory for the deploy-contract runner (Step 08).
 *
 * The runner ({@link appBuilderComponentRunner}) is pure orchestration with every external
 * boundary injected. This factory wires the REAL implementations — the existing
 * deploy tails (`deployMeshComponent`/`deployAppComponent`, NOT forked), the
 * step-07 API subscriber, and the step-04 storefront republish — so callers
 * (D2 dashboard/wizard wiring) get a ready-to-use deps bundle.
 *
 * This is the cross-feature orchestration seam: it imports from `@/features/mesh`
 * and `@/features/eds` here (orchestration layer), keeping `appBuilderComponentRunner.ts`
 * itself free of cross-feature deploy imports.
 */

import * as vscode from 'vscode';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { ensureFnmNodeVersion } from '@/core/shell/ensureNodeVersion';
import type { CachedOrgRef } from '@/core/shell/orgContextEnv';
import { resolveDesiredApis } from '@/core/state/componentApiPicks';
import { formatDuration } from '@/core/utils/timeFormatting';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { askDuringOperation } from '@/core/vscode/operationPrompt';
import { deriveAllowedDomain } from '@/features/app-builder/services/allowedDomain';
import {
    subscribeRequiredApis,
    type ApiSubscriberClient,
} from '@/features/app-builder/services/apiSubscriber';
import { createApiSubscriberClient } from '@/features/app-builder/services/apiSubscriberClientAdapter';
import type { AppBuilderComponentRunnerDeps } from '@/features/app-builder/services/appBuilderComponentRunner';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import { installAppManagementApp } from '@/features/app-builder/services/appManagementInstaller';
import { uninstallAppManagementApp } from '@/features/app-builder/services/appManagementUninstaller';
import { readAppManifestVersion } from '@/features/app-builder/services/appManifestVersion';
import { resolveSecretDeployEnv } from '@/features/app-builder/services/componentSettingSecrets';
import { deployWorkspaceId, ensureComponentWorkspace } from '@/features/app-builder/services/componentWorkspace';
import { deployAppComponentIsolated } from '@/features/app-builder/services/deployAppIsolated';
import { displayNameInProject } from '@/features/app-builder/services/deployInputs';
import { subscriberTarget } from '@/features/app-builder/services/ensureMeshApiSubscribed';
import { detachErpWrites } from '@/features/app-builder/services/erpDetach';
import {
    checkCloneForUpdate,
    fastForwardClone,
    type GitRunner,
} from '@/features/app-builder/services/integrationSourceUpdate';
import { buildS2SDeployEnv } from '@/features/app-builder/services/s2sDeployEnv';
import { wipeSystemRecords } from '@/features/app-builder/services/systemRecordsWipe';
import { forgetScreenKey } from '@/features/app-builder/services/systemScreen';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { ComponentManager } from '@/features/components/services/componentManager';
import { republishStorefrontConfig } from '@/features/eds/services/storefront/storefrontRepublishService';
import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import {
    calculateMeshSourceHash,
    readMeshEnvVarsFromFile,
} from '@/features/mesh/services/stalenessDetector';
import { regenerateComponentEnvFile } from '@/features/project-creation/helpers/envFileGenerator';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import type { ComponentRegistry } from '@/types/components';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import type { OperationPosition } from '@/types/webviewPayloads';

/** Collaborators the factory needs from the host (extension) context. */
export interface RunnerDepsContext {
    componentManager: ComponentManager;
    commandManager: CommandExecutor;
    /** ADR-015: the auth service, so the factory never reaches for it. */
    authManager: AuthenticationService;
    logger: Logger;
    saveProject: (project: Project) => Promise<void>;
    getCachedOrganization: () => CachedOrgRef | undefined;
    /** See `AppBuilderComponentRunnerDeps.refreshAiBundle`. */
    refreshAiBundle: (project: Project) => Promise<void>;
    subscriberClient: ApiSubscriberClient;
    catalog: AppBuilderComponentCatalogEntry[];
    secrets: vscode.SecretStorage;
    /**
     * Load the component registry — the source of a mesh's `requiredEnvVars`.
     *
     * A thunk rather than a loaded registry so the remove path, which needs no
     * env file, never pays for the load.
     */
    loadRegistry: () => Promise<ComponentRegistry>;
}

/** Wire the runner's deps to the real deploy tails + subscriber + republish. */
/**
 * The UI-default toolchain-refresh consent: one notification, two buttons.
 * Callers with NO interactive surface (the MCP handlers when `context.panel`
 * is absent) pass their own flag-based consent instead — a handler must never
 * park an agent on a dialog.
 */
async function promptForToolchainRefresh(): Promise<boolean> {
    const choice = await askDuringOperation(
        'Adobe CLI is out of date. Update and retry?',
        'Update & Retry',
        'Not Now',
    );
    return choice === 'Update & Retry';
}

/**
 * IMS auth for an app's own App Management API: the signed-in token + the IMS
 * org CODE (`…@AdobeOrg` — the `x-gw-ims-org-id` header wants the code, not
 * the numeric Console id the manifest stores). The cached org answers when it
 * matches the project; otherwise the org list resolves the code by id.
 *
 * Exported for the install-status/install handlers (AB-5), which drive the
 * same per-app API outside a deploy.
 */
export async function resolveAppManagementAuth(
    project: Project,
    authManager: AuthenticationService,
): Promise<AppManagementAuth | undefined> {
    const inspection = await authManager.getTokenManager().inspectToken();
    if (!inspection.valid || !inspection.token) {
        return undefined;
    }
    const orgId = project.adobe?.organization;
    if (!orgId) {
        return undefined;
    }
    const cached = authManager.getCachedOrganization();
    const code =
        cached?.id === orgId
            ? cached.code
            : (await authManager.getOrganizations()).find((org) => org.id === orgId)?.code;
    return code ? { accessToken: inspection.token, imsOrgId: code } : undefined;
}

/** A component's persisted per-action URL map — where its install API lives. */
function deployedUrlsOf(project: Project, componentId: string): Record<string, string> | undefined {
    return project.appBuilderComponents?.[componentId]?.deployedUrls;
}

export function buildDefaultRunnerDeps(
    ctx: RunnerDepsContext,
    onProgress?: (message: string, subMessage?: string, position?: OperationPosition) => void,
    confirmToolchainRefresh?: () => Promise<boolean>,
): AppBuilderComponentRunnerDeps {
    // Git in an integration's clone, for update and its check.
    const gitIn: GitRunner = (command, cwd) =>
        ctx.commandManager.execute(command, { cwd, enhancePath: true, shell: DEFAULT_SHELL, timeout: TIMEOUTS.LONG });
    return {
        confirmToolchainRefresh: confirmToolchainRefresh ?? promptForToolchainRefresh,
        // Where the deploy tails' steps go. Callers with a progress notification
        // pass their reporter; headless/MCP callers pass nothing.
        onProgress,
        componentManager: ctx.componentManager,
        commandManager: ctx.commandManager,
        logger: ctx.logger,
        saveProject: ctx.saveProject,
        refreshAiBundle: ctx.refreshAiBundle,
        getCachedOrganization: ctx.getCachedOrganization,
        catalog: ctx.catalog,
        secrets: ctx.secrets,
        deployMesh: deployMeshComponent,
        // The staleness baseline the headless path gets from updateMeshState.
        // Both helpers already swallow their own I/O errors (missing .env → {},
        // unreadable source → null), so a capture failure degrades staleness
        // detection rather than failing a deploy that already succeeded.
        captureMeshBaseline: async (componentPath) => ({
            envVars: await readMeshEnvVarsFromFile(componentPath),
            sourceHash: await calculateMeshSourceHash(componentPath),
        }),
        // The same registry-driven .env path project creation and EDS Reset use —
        // not a dashboard-local variant. Loading the registry lazily keeps it off
        // the remove path, which needs no env file.
        writeComponentEnv: async (project, componentId, componentPath) => {
            const registry = await ctx.loadRegistry();
            await regenerateComponentEnvFile(
                project,
                registry,
                ctx.logger,
                componentId,
                componentPath,
                ctx.secrets,
            );
        },
        // The ONE isolating deploy seam (ADR-011 D3 Step 03) — every deploy routes
        // through it, so no un-isolated deploy survives.
        deployApp: deployAppComponentIsolated,
        // Choice-dependent node versions resolve at the add door — the one
        // chokepoint the wizard's early prerequisites screen cannot cover.
        ensureNodeVersion: (version) =>
            ensureFnmNodeVersion(ctx.commandManager, version, ctx.logger),
        // Post-deploy install for app-management lifecycle apps (automatic with
        // hands-back — owner decision 2026-08-27). The runner records the
        // outcome; a failure never fails the deploy.
        installAppManagement: (project, componentId, installProgress, options) =>
            installAppManagementApp(project, componentId, deployedUrlsOf(project, componentId), {
                getAuth: () => resolveAppManagementAuth(project, ctx.authManager),
                logger: ctx.logger,
                onProgress: installProgress,
                appVersion: options?.appVersion,
                since: options?.since,
            }),
        readAppVersion: readAppManifestVersion,
        // Update: fast-forward the clone, then the same dependency install the
        // add path runs (ComponentManager, with the entry's Node version).
        fetchComponentSource: (componentPath, branch) => fastForwardClone(componentPath, branch, gitIn),
        checkComponentSource: (componentPath, branch) => checkCloneForUpdate(componentPath, branch, gitIn),
        installComponentDependencies: (componentPath, definition) =>
            ctx.componentManager.installNpmDependencies(componentPath, definition),
        // The clean-ups ahead of a remove, each living in code the undeploy
        // deletes. A failure stops the removal unless the SC removes anyway
        // (appBuilderComponentTeardown). First the ERP integration's undo of its
        // Commerce writes:
        detachFromCommerce: (project, deployedUrls, detachProgress) =>
            detachErpWrites(deployedUrls, {
                getAuth: () => resolveAppManagementAuth(project, ctx.authManager),
                onProgress: detachProgress,
            }),
        // then the app's own uninstall API, which takes down what its installer created:
        uninstallAppManagement: (project, componentId, uninstallProgress) =>
            uninstallAppManagementApp(project, componentId, deployedUrlsOf(project, componentId), {
                getAuth: () => resolveAppManagementAuth(project, ctx.authManager),
                logger: ctx.logger,
                onProgress: uninstallProgress,
            }),
        // and a system's records, deleted while its wipe action still exists.
        wipeSystemRecords: (project, entry, deployedUrls, name) =>
            wipeSystemRecords(entry, deployedUrls, name, {
                getAuth: () => resolveAppManagementAuth(project, ctx.authManager),
                onProgress,
            }),
        resolveSecretEnv: (project, entry) => resolveSecretDeployEnv(ctx.secrets, project.path, entry),
        forgetScreenKey: (project, entry) => forgetScreenKey(ctx.secrets, project.path, entry),
        // The AIO_COMMERCE_AUTH_IMS_* deploy env for app-management entries:
        // the workspace S2S credential's full identity (ensured + read via the
        // Console SDK), mapped by s2sDeployEnv. The secret rides the
        // per-invocation env only.
        resolveAppManagementEnv: async (project, componentId) => {
            const adobe = project.adobe;
            // The workspace the app is deployed into: its credential is the one the
            // app's actions must authenticate with.
            const workspaceId = deployWorkspaceId(project, componentId);
            if (!adobe?.organization || !adobe.projectId || !workspaceId) {
                throw new Error(
                    'The project has no Adobe org/project/workspace context to resolve credentials from.',
                );
            }
            const credentials = await ctx.authManager.getS2SDeployCredentials(
                    adobe.organization,
                    adobe.projectId,
                    workspaceId,
                );
            return buildS2SDeployEnv(credentials);
        },
        createComponentWorkspace: (project, entry, onMaking) =>
            ensureComponentWorkspace(project, entry, {
                onMaking,
                maker: {
                    createWorkspace: (title, description, target, nameFrom) =>
                        ctx.authManager.createWorkspace(title, description, target, nameFrom),
                },
                saveProject: ctx.saveProject,
                // The name the SC gave it (a rename, else the one typed at add),
                // never the catalog's generic word for it.
                nameOf: (named) => displayNameInProject(project, named),
                catalog: ctx.catalog,
            }),
        deleteComponentWorkspace: async (project, workspace) => {
            const result = await ctx.authManager.deleteWorkspace(workspace.id, {
                orgId: project.adobe?.organization,
                projectId: project.adobe?.projectId,
            });
            // Adobe's own words reach the log rather than a guess. The one refusal
            // the AB-2 spike predicted here — a workspace still holding live event
            // registrations answering 409 — has never actually been seen: three
            // deletes on 2026-09-20 all answered 200 in about three seconds, none
            // of them holding registrations. If it starts happening, the project
            // teardown's registration sweep is the thing to reuse.
            return 'error' in result ? { error: result.error } : undefined;
        },
        // The runner's dep contract is void — swallow the returned API list.
        subscribeRequiredApis: async (appBuilderComponents, project, onStep, scope) => {
            const started = Date.now();
            // The component this subscribe is FOR, named by the caller. It used to be
            // guessed from the list's length, and a project with a mesh always passed
            // two or more, so every add subscribed to the project's workspace.
            const forComponent = scope?.forComponent;
            const apis = await subscribeRequiredApis(
                appBuilderComponents,
                // One component's subscribe targets THAT component's workspace; the
                // project-wide reconcile still belongs to the project's own.
                subscriberTarget(project, forComponent),
                ctx.subscriberClient,
                deriveAllowedDomain(project),
                // Runtime-added APIs (add_console_apis) must ride every reconcile.
                // Narrowed to THIS component when one component is being
                // subscribed, because it may hold a workspace of its own and the
                // project's union would entitle that credential to APIs belonging
                // to integrations living elsewhere.
                resolveDesiredApis(project, forComponent),
                undefined,
                [],
                {
                    onStep,
                    log: (message) => ctx.logger.debug(message),
                    skipCoverageCheck: scope?.adding,
                },
            );
            // Which APIs, and how long: the step that stalled Bodea's redeploys
            // left no trace of either (2026-09-18).
            ctx.logger.debug(
                `[APIs] ${apis.length} API(s) in place in ${formatDuration(Date.now() - started)}: ` +
                    apis.map((api) => api.code).join(', '),
            );
        },
        republishStorefront: ({ project }) =>
            republishStorefrontConfig({
                project,
                secrets: ctx.secrets,
                logger: ctx.logger,
                persist: ctx.saveProject,
            }),
    };
}

/** Resolve the project's stack-filtered catalog (axis-filtered by selection). */
function resolveCatalog(project: Project): AppBuilderComponentCatalogEntry[] {
    return getAvailableAppBuilderComponents(
        project.componentSelections?.backend ?? '',
        project.componentSelections?.frontend ?? '',
    );
}

/**
 * Assemble the {@link RunnerDepsContext} for a host (extension) invocation. Wires
 * the extension collaborators the runner needs: the component manager, command
 * executor, logger, project persistence, the cached-org read, the Track A
 * subscriber adapter, the stack-filtered catalog, and the extension secrets.
 *
 * Shared by the dashboard add/deploy/remove handlers AND the wizard creation-flow
 * integrations phase (Rule of Three: identical second use → extracted here).
 */
export async function buildRunnerDepsContext(
    context: HandlerContext,
    project: Project,
    /**
     * ADR-015: a `create...Deps` builder may CONSTRUCT its feature's parts, but
     * fetching is a boundary privilege — so the shared singletons arrive from
     * the handler that calls this.
     */
    services: { authManager: AuthenticationService; commandManager: CommandExecutor },
): Promise<RunnerDepsContext> {
    const { ComponentManager } = await import('@/features/components/services/componentManager');
    const { authManager, commandManager } = services;
    return {
        componentManager: new ComponentManager(context.logger, commandManager),
        commandManager,
        authManager,
        logger: context.logger,
        saveProject: (p: Project) => context.stateManager.saveProject(p),
        // Tiers 1+2 and the stamp. Package INSTALLS (tier 3) are not needed
        // here and are not attempted: a composition change that makes a new
        // package applicable is exactly what the freshness badge already
        // catches, and installing during a deploy would be a surprise.
        refreshAiBundle: async (p: Project) => {
            const { generateAIContextFiles } = await import(
                '@/features/project-creation/services/aiBundle/aiBundleService'
            );
            await generateAIContextFiles(p.path, p, context.context.extensionPath);
            // The stamp and the file hashes were assigned to `p`; without this
            // the manifest keeps the old ones and every later refresh misreads
            // the files we just wrote as user-edited.
            await context.stateManager.saveProjectConfigOnly(p);
        },
        getCachedOrganization: () => authManager.getCachedOrganization(),
        subscriberClient: createApiSubscriberClient(authManager),
        catalog: resolveCatalog(project),
        secrets: context.context.secrets,
        loadRegistry: async () => {
            const { ComponentRegistryManager } = await import(
                '@/features/components/services/ComponentRegistryManager'
            );
            return new ComponentRegistryManager(context.context.extensionPath).loadRegistry();
        },
    };
}
