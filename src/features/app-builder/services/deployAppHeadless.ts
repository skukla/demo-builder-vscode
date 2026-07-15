/**
 * deployAppHeadless — the shared, UI-free App Builder app deploy core.
 *
 * Runs the sequence {@link DeployAppCommand} orchestrates — preflight (auth + org
 * context) → App Builder permission gate → find app → deploy under org-context →
 * persist — but returns a plain result and emits status/progress through callbacks
 * instead of driving the dashboard and notification UI. Sibling of
 * {@link import('@/features/mesh/services/deployMeshHeadless').deployMeshHeadless}.
 * Two callers share it:
 *   - `DeployAppCommand` supplies `onStatus`/`onProgress` that bridge to the
 *     dashboard badge + progress notification and maps the result to its toasts;
 *   - the projects-list `redeployApp` handler runs it headlessly (progress only)
 *     and shapes the returned result.
 *
 * @module features/app-builder/services/deployAppHeadless
 */

import { deployAppComponent } from './appDeployment';
import { ServiceLocator } from '@/core/di';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell';
import { ensureProjectAdobeContext } from '@/features/authentication/services/ensureProjectAdobeContext';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { projectRequiresAppBuilder } from '@/features/components/services/projectAppBuilderPredicate';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';
import { getAppBuilderInstance } from '@/types/typeGuards';

/** Why a deploy could not proceed (maps to the command's per-branch UI). */
export type AppDeployBlock = 'auth' | 'org' | 'permission' | 'no-app';

export type AppDeployStatus = 'deploying' | 'deployed' | 'error';

export interface DeployAppHeadlessResult {
    success: boolean;
    url?: string;
    error?: string;
    /** Set when a guard stopped the deploy before it ran. */
    blockedBy?: AppDeployBlock;
    /** True when a preflight prompt was dismissed (auth/org) — not an error. */
    cancelled?: boolean;
    currentOrg?: string;
}

export interface DeployAppHeadlessDeps {
    project: Project;
    stateManager: StateManager;
    logger: Logger;
    /** Extension path — the App Builder permission gate loads the registry. */
    extensionPath: string;
    /** Status telegraph (dashboard badge). No-op for headless callers. */
    onStatus?: (status: AppDeployStatus, message?: string, url?: string) => void | Promise<void>;
    /** Deploy progress (notification). No-op for headless callers. */
    onProgress?: (message: string) => void;
}

/**
 * Deploy (or redeploy) the project's App Builder app, UI-free.
 *
 * @param deps - project + state/logger, extension path, and optional UI bridges
 * @returns the deploy result: `{success, url}` or a blocked/failed result
 */
export async function deployAppHeadless(
    deps: DeployAppHeadlessDeps,
): Promise<DeployAppHeadlessResult> {
    const { project, stateManager, logger, extensionPath, onStatus, onProgress } = deps;
    const authManager = ServiceLocator.getAuthenticationService();

    await onStatus?.('deploying', 'Checking requirements...');

    // PRE-FLIGHT: auth + correct org context (the shared gate). Passes silently
    // when already authed; only prompts when not — the same headless behavior the
    // mesh core uses.
    const preflight = await ensureProjectAdobeContext({
        authManager,
        project,
        logger,
        logPrefix: '[App Deployment]',
        warningMessage: 'Adobe sign-in required to deploy the custom integration.',
    });
    if (!preflight.ready) {
        return {
            success: false,
            blockedBy: preflight.blockedBy === 'org' ? 'org' : 'auth',
            cancelled: preflight.cancelled,
            currentOrg: preflight.currentOrg,
        };
    }

    // App Builder permission gate — IMS role membership can change between the
    // create-time gate and now; re-verify to surface the friendly error.
    const registry = await new ComponentRegistryManager(extensionPath).loadRegistry();
    if (projectRequiresAppBuilder(project, registry)) {
        const permission = await authManager.testDeveloperPermissions();
        if (!permission.hasPermissions) {
            await onStatus?.('error', 'Developer access required');
            return {
                success: false,
                blockedBy: 'permission',
                error:
                    permission.error ||
                    'Your account lacks Developer or System Admin role for this organization.',
            };
        }
    }

    const app = getAppBuilderInstance(project);
    if (!app?.path) {
        return { success: false, blockedBy: 'no-app' };
    }

    await onStatus?.('deploying', 'Starting deployment...');

    const commandManager = ServiceLocator.getCommandExecutor();
    // Target the aio deploy at the project's org/project/workspace via env, without
    // mutating the shared `aio` global (deployAppComponent is org-agnostic).
    const target = buildOrgTargetFromProjectAdobe(
        project.adobe,
        authManager.getCachedOrganization(),
    );

    try {
        const result = await withOrgContext(target, () =>
            deployAppComponent(app.path as string, commandManager, logger, (message: string) => {
                onProgress?.(message);
                void onStatus?.('deploying', message);
            }),
        );

        if (!result.success) {
            project.appStatusSummary = 'error';
            await stateManager.saveProject(project);
            await onStatus?.('error', result.error || 'Deployment failed');
            return { success: false, error: result.error || 'App Builder deployment failed' };
        }

        project.appState = {
            appId: result.data?.appId,
            url: result.data?.url,
            status: 'deployed',
            deployedUrls: result.data?.deployedUrls,
            lastDeployed: new Date().toISOString(),
            sourceHash: null,
        };
        project.appStatusSummary = 'deployed';
        await stateManager.saveProject(project);

        await onStatus?.('deployed', undefined, result.data?.url);
        return { success: true, url: result.data?.url };
    } catch (error) {
        project.appStatusSummary = 'error';
        await stateManager.saveProject(project);
        await onStatus?.('error', 'Deployment failed');
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
