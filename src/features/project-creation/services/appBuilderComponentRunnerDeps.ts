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
import { ServiceLocator } from '@/core/di';
import type { CachedOrgRef, CommandExecutor } from '@/core/shell';
import { ensureFnmNodeVersion } from '@/core/shell/ensureNodeVersion';
import { resolveDesiredApis } from '@/core/state/componentApiPicks';
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
import { deployAppComponentIsolated } from '@/features/app-builder/services/deployAppIsolated';
import { subscriberTarget } from '@/features/app-builder/services/ensureMeshApiSubscribed';
import { buildS2SDeployEnv } from '@/features/app-builder/services/s2sDeployEnv';
import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { ComponentManager } from '@/features/components/services/componentManager';
import { republishStorefrontConfig } from '@/features/eds/services/storefront/storefrontRepublishService';
import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import {
    calculateMeshSourceHash,
    readMeshEnvVarsFromFile,
} from '@/features/mesh/services/stalenessDetector';
import { regenerateComponentEnvFile } from '@/features/project-creation/helpers';
import type { Project } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { ComponentRegistry } from '@/types/components';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

/** Collaborators the factory needs from the host (extension) context. */
export interface RunnerDepsContext {
    componentManager: ComponentManager;
    commandManager: CommandExecutor;
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
    const choice = await vscode.window.showWarningMessage(
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
): Promise<AppManagementAuth | undefined> {
    const authManager = ServiceLocator.getAuthenticationService();
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

export function buildDefaultRunnerDeps(
    ctx: RunnerDepsContext,
    onProgress?: (message: string, subMessage?: string) => void,
    confirmToolchainRefresh?: () => Promise<boolean>,
): AppBuilderComponentRunnerDeps {
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
        installAppManagement: (project, deployedUrls, installProgress) =>
            installAppManagementApp(project, deployedUrls, {
                getAuth: () => resolveAppManagementAuth(project),
                logger: ctx.logger,
                onProgress: installProgress,
            }),
        // The inverse, ahead of an integration remove: the app's own uninstall
        // API takes down what its installer created, while the API still
        // exists to call. Best-effort — the runner logs a failure and removes
        // anyway.
        uninstallAppManagement: (project, deployedUrls, uninstallProgress) =>
            uninstallAppManagementApp(project, deployedUrls, {
                getAuth: () => resolveAppManagementAuth(project),
                logger: ctx.logger,
                onProgress: uninstallProgress,
            }),
        // The AIO_COMMERCE_AUTH_IMS_* deploy env for app-management entries:
        // the workspace S2S credential's full identity (ensured + read via the
        // Console SDK), mapped by s2sDeployEnv. The secret rides the
        // per-invocation env only.
        resolveAppManagementEnv: async (project) => {
            const adobe = project.adobe;
            if (!adobe?.organization || !adobe.projectId || !adobe.workspace) {
                throw new Error(
                    'The project has no Adobe org/project/workspace context to resolve credentials from.',
                );
            }
            const credentials =
                await ServiceLocator.getAuthenticationService().getS2SDeployCredentials(
                    adobe.organization,
                    adobe.projectId,
                    adobe.workspace,
                );
            return buildS2SDeployEnv(credentials);
        },
        // The runner's dep contract is void — swallow the returned API list.
        subscribeRequiredApis: async (appBuilderComponents, project) => {
            await subscribeRequiredApis(
                appBuilderComponents,
                subscriberTarget(project),
                ctx.subscriberClient,
                deriveAllowedDomain(project),
                // Runtime-added APIs (add_console_apis) must ride every
                // reconcile or the full-union PUT strips them. Unioned across
                // every integration's picks — the flat field is legacy.
                resolveDesiredApis(project),
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
): Promise<RunnerDepsContext> {
    const { ComponentManager } = await import('@/features/components/services/componentManager');
    const authManager = ServiceLocator.getAuthenticationService();
    return {
        componentManager: new ComponentManager(context.logger),
        commandManager: ServiceLocator.getCommandExecutor(),
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
