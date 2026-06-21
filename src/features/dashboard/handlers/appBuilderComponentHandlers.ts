/**
 * AppBuilderComponent Handlers (D2 Track B — Step 05)
 *
 * The dashboard message handlers that drive the live D1 deploy-contract runner
 * from the integrations list. THIS is the first UI-driven `addAppBuilderComponent`
 * (clone + install + subscribe + deploy), distinct from Track A's bounded mesh
 * subscribe.
 *
 * Guard order MIRRORS DeployAppCommand (auth → org-mismatch → App Builder
 * permission), then assembles a RunnerDepsContext via buildDefaultRunnerDeps —
 * supplying the Track A `subscriberClient` adapter, the stack-filtered `catalog`,
 * and the extension `secrets` — before invoking the runner. A failing guard
 * surfaces the message and NEVER calls the runner. Runner failures post a typed
 * `error` row status (no throw to the webview, P2).
 *
 * Add routes a bucket-3 entry (envSchema with userText/userSecret) to Configure
 * FIRST, so an App Builder component that needs user inputs is never silently deployed with
 * missing values.
 *
 * Reuse, not fork: the runner, the deps factory, the adapter, the catalog
 * loader, the env classifier, and the guard helpers are all consumed as-is.
 *
 * @module features/dashboard/handlers/appBuilderComponentHandlers
 */

import * as vscode from 'vscode';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { ServiceLocator } from '@/core/di';
import { createApiSubscriberClient } from '@/features/app-builder/services/apiSubscriberClientAdapter';
import {
    addAppBuilderComponent,
    deployAppBuilderComponent,
    removeAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import {
    buildDefaultRunnerDeps,
    type RunnerDepsContext,
} from '@/features/app-builder/services/appBuilderComponentRunnerDeps';
import {
    getAvailableAppBuilderComponents,
    getAppBuilderComponentEntry,
} from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import { classifyEnvSchema } from '@/features/project-creation/services/envVarClassifier';
import type { Project } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler, HandlerContext } from '@/types/handlers';
import { toError } from '@/types/typeGuards';

/** Resolve the project's stack-filtered catalog (axis-filtered by selection). */
function resolveCatalog(project: Project): AppBuilderComponentCatalogEntry[] {
    return getAvailableAppBuilderComponents(
        project.componentSelections?.backend ?? '',
        project.componentSelections?.frontend ?? '',
    );
}

/**
 * Assemble the RunnerDepsContext for a handler invocation. Extends buildAppDeps
 * with the three D1-runner-only collaborators: the subscriber adapter (Track A),
 * the stack-filtered catalog, and the extension secrets.
 */
async function buildRunnerDepsContext(
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
        getCachedOrganization: () => authManager.getCachedOrganization(),
        subscriberClient: createApiSubscriberClient(authManager),
        catalog: resolveCatalog(project),
        secrets: context.context.secrets,
    };
}

/**
 * Run the DeployAppCommand guard order (auth → org-mismatch → App Builder
 * permission). Returns an error string on the first failure (caller aborts
 * WITHOUT calling the runner); undefined when all guards pass.
 */
async function runGuards(context: HandlerContext, project: Project): Promise<string | undefined> {
    const authManager = ServiceLocator.getAuthenticationService();

    const authResult = await ensureAdobeIOAuth({
        authManager,
        logger: context.logger,
        logPrefix: '[AppBuilderComponents]',
        projectContext: {
            organization: project.adobe?.organization,
            projectId: project.adobe?.projectId,
            workspace: project.adobe?.workspace,
        },
        warningMessage: 'Adobe sign-in required to manage App Builder components.',
    });
    if (!authResult.authenticated) {
        return 'Adobe sign-in required.';
    }

    const { detectProjectOrgMismatch } = await import(
        '@/features/authentication/services/detectProjectOrgMismatch'
    );
    const orgContext = await detectProjectOrgMismatch(authManager, project, context.logger);
    if (orgContext && !orgContext.reachable) {
        return 'Project uses a different Adobe organization. Use "Switch IMS Org" to continue.';
    }

    const permission = await authManager.testDeveloperPermissions();
    if (!permission.hasPermissions) {
        return permission.error || 'Developer or System Admin role required for App Builder.';
    }

    return undefined;
}

/** Build a custom-URL integration entry (the custom-URL door). */
function customEntry(source: { owner: string; repo: string }): AppBuilderComponentCatalogEntry {
    return {
        id: `${source.owner}-${source.repo}`,
        name: source.repo,
        description: `Custom App Builder component from ${source.owner}/${source.repo}`,
        kind: 'integration',
        source: { owner: source.owner, repo: source.repo, branch: 'main' },
    };
}

/** Resolve the catalog entry from an add payload (catalog id OR custom source). */
function resolveAddEntry(
    payload: { id?: string; source?: { owner: string; repo: string } },
): AppBuilderComponentCatalogEntry | undefined {
    if (payload.source?.owner && payload.source?.repo) {
        return customEntry(payload.source);
    }
    if (payload.id) {
        return getAppBuilderComponentEntry(payload.id);
    }
    return undefined;
}

/** True when the entry needs user-provided inputs (bucket 3: text or secret). */
function needsUserInputs(entry: AppBuilderComponentCatalogEntry): boolean {
    const { userText, userSecret } = classifyEnvSchema(entry.envSchema ?? []);
    return userText.length > 0 || userSecret.length > 0;
}

/**
 * Post a per-row status update via the dashboard command. Imported LAZILY (like
 * DeployAppCommand's dashboard import) so this handler module never statically
 * pulls the webview-command class into the module-load graph (which would chain
 * BaseWebviewCommand into handler-only test contexts).
 */
async function postRowStatus(
    id: string,
    status: 'deploying' | 'deployed' | 'error' | 'not-deployed',
    message?: string,
): Promise<void> {
    const { ProjectDashboardWebviewCommand } = await import('@/features/dashboard/commands/showDashboard');
    await ProjectDashboardWebviewCommand.sendAppBuilderComponentStatusUpdate(id, status, message);
}

/**
 * Handle 'addAppBuilderComponent' — guards → (bucket-3 → Configure) → assemble deps →
 * D1 addAppBuilderComponent. The FIRST live UI-driven full add.
 */
export const handleAddAppBuilderComponent: MessageHandler<{
    id?: string;
    source?: { owner: string; repo: string };
}> = async (context, payload) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const entry = resolveAddEntry(payload ?? {});
    if (!entry) {
        return { success: false, error: 'Unknown appBuilderComponent', code: ErrorCode.CONFIG_INVALID };
    }

    const guardError = await runGuards(context, project);
    if (guardError) {
        vscode.window.showWarningMessage(guardError);
        return { success: false, error: guardError };
    }

    // Bucket-3 inputs → Configure FIRST (never silently deploy with missing inputs).
    if (needsUserInputs(entry)) {
        await vscode.commands.executeCommand('demoBuilder.configureProject');
        return { success: true };
    }

    await postRowStatus(entry.id, 'deploying', 'Adding appBuilderComponent…');
    const deps = buildDefaultRunnerDeps(await buildRunnerDepsContext(context, project));
    const result = await addAppBuilderComponent(project, entry, deps);
    if (!result.success) {
        await postRowStatus(entry.id, 'error', result.error || 'Deployment failed');
        return { success: false, error: result.error };
    }
    await postRowStatus(entry.id, 'deployed', undefined);
    return { success: true };
};

/** Shared deploy/redeploy: guards → D1 deployAppBuilderComponent {id}. */
async function deployById(context: HandlerContext, id: string | undefined) {
    if (!id) {
        return { success: false, error: 'AppBuilderComponent id is required', code: ErrorCode.CONFIG_INVALID };
    }
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const guardError = await runGuards(context, project);
    if (guardError) {
        vscode.window.showWarningMessage(guardError);
        return { success: false, error: guardError };
    }

    await postRowStatus(id, 'deploying', 'Deploying…');
    const deps = buildDefaultRunnerDeps(await buildRunnerDepsContext(context, project));
    const result = await deployAppBuilderComponent(project, id, deps);
    const status = result.success ? 'deployed' : 'error';
    await postRowStatus(id, status, result.success ? undefined : (result.error || 'Deployment failed'));
    return result.success ? { success: true } : { success: false, error: result.error };
}

/** Handle 'deployAppBuilderComponent' — deploy the given appBuilderComponent's tail. */
export const handleDeployAppBuilderComponent: MessageHandler<{ id?: string }> = (context, payload) =>
    deployById(context, payload?.id);

/** Redeploy is the same path (idempotent re-run of the deploy tail). */
export const handleRedeployAppBuilderComponent = handleDeployAppBuilderComponent;

/** Handle 'removeAppBuilderComponent' — guards → D1 removeAppBuilderComponent {id} (confirm is UI-side). */
export const handleRemoveAppBuilderComponent: MessageHandler<{ id?: string }> = async (context, payload) => {
    const id = payload?.id;
    if (!id) {
        return { success: false, error: 'AppBuilderComponent id is required', code: ErrorCode.CONFIG_INVALID };
    }
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const guardError = await runGuards(context, project);
    if (guardError) {
        vscode.window.showWarningMessage(guardError);
        return { success: false, error: guardError };
    }

    const deps = buildDefaultRunnerDeps(await buildRunnerDepsContext(context, project));
    const result = await removeAppBuilderComponent(project, id, deps);
    return result.success ? { success: true } : { success: false, error: result.error };
};

/**
 * Handle 'verifyAppBuilderComponent' — an ON-DEMAND, non-interactive probe (P1). It uses
 * the SDK-only org read (never a CLI/browser path, never a deploy or aio write)
 * to confirm the project's org is reachable, then posts a typed `deployed` or
 * `error` row status (P2: always a typed outcome, never a silent flip).
 */
export const handleVerifyAppBuilderComponent: MessageHandler<{ id?: string }> = async (context, payload) => {
    const id = payload?.id;
    if (!id) {
        return { success: false, error: 'AppBuilderComponent id is required', code: ErrorCode.CONFIG_INVALID };
    }
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const authManager = ServiceLocator.getAuthenticationService();
    try {
        const orgs = await authManager.getOrganizationsSdkOnly();
        const reachable = Array.isArray(orgs) && orgs.length > 0;
        if (reachable) {
            await postRowStatus(id, 'deployed', undefined);
        } else {
            await postRowStatus(id, 'error', 'Could not verify (sign in to check).');
        }
    } catch (error) {
        await postRowStatus(id, 'error', toError(error).message);
    }
    return { success: true };
};
