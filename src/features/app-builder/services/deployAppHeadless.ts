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

import { recordDeployOutcome } from './appBuilderDeployOutcome';
import { deployAppComponentIsolated } from './deployAppIsolated';
import { deriveOwPackage } from './owPackageName';
import type { AppDeploymentResult } from './types';
import { ServiceLocator } from '@/core/di';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell';
import { ensureProjectAdobeContext } from '@/features/authentication/services/ensureProjectAdobeContext';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { projectRequiresAppBuilder } from '@/features/components/services/projectAppBuilderPredicate';
import type { ComponentInstance, Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';
import { getAppBuilderInstance, getComponentInstancesBySubType } from '@/types/typeGuards';

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
    /**
     * Target ONE of N integrations by component-instance id (ADR-011 D3 Step 04
     * per-integration redeploy). When omitted, falls back to the singular
     * default (the first app instance) — retired with the singular readers in
     * Step 07.
     */
    componentId?: string;
}

/**
 * Resolve the deploy target: the id-matched app instance when a componentId is
 * given (no singular fallback — an unknown id must block, never deploy a
 * different integration), else the singular default.
 */
function resolveTargetApp(
    project: Project,
    componentId?: string,
): ComponentInstance | undefined {
    if (componentId === undefined) {
        return getAppBuilderInstance(project);
    }
    return getComponentInstancesBySubType(project, 'app').find((app) => app.id === componentId);
}

/**
 * Persist a successful deploy to BOTH state models: the singular
 * `appState`/`appStatusSummary` (retired in ADR-011 D3 Step 07) and the keyed
 * `appBuilderComponents` entry (one writer, D3 Step 02) — so the projects-
 * dashboard card grid and the keyed integrations list read the same state.
 */
function persistDeploySuccess(
    project: Project,
    appInstanceId: string,
    data: AppDeploymentResult['data'],
): void {
    const lastDeployed = new Date().toISOString();
    project.appState = {
        appId: data?.appId,
        url: data?.url,
        status: 'deployed',
        deployedUrls: data?.deployedUrls,
        lastDeployed,
        sourceHash: null,
    };
    project.appStatusSummary = 'deployed';
    recordDeployOutcome(project, 'integration', appInstanceId, {
        status: 'deployed',
        url: data?.url,
        deployedUrls: data?.deployedUrls,
        lastDeployed,
    });
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
    const { project, stateManager, logger, extensionPath, onStatus, onProgress, componentId } =
        deps;
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

    const app = resolveTargetApp(project, componentId);
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

    // Package isolation (ADR-011 D3 Step 03): derive the distinct ow.package from
    // the COMPONENT-INSTANCE id — the same id the keyed runner uses
    // (deriveOwPackage(entry.id)). Package identity and state identity are
    // DIFFERENT concerns: recordDeployOutcome may resolve the keyed-map write onto
    // a legacy migrated key ('app'/appId), but the deployed package must stay
    // stable per component instance across both surfaces.
    //
    // Migration caveat (untestable here — live-workspace behavior): an app already
    // deployed via this path BEFORE isolation sits on the repo's declared package
    // (e.g. `application`). Re-isolating renames the package in app.config.yaml,
    // so the next deploy creates the derived package and may orphan the old
    // package's entities (aio prunes only the app's own package). A live-workspace
    // probe is required before trusting redeploys of legacy un-isolated apps
    // (ADR-011 load-bearing assumption).
    const owPackage = deriveOwPackage(app.id);

    try {
        const result = await withOrgContext(target, () =>
            deployAppComponentIsolated(
                app.path as string,
                owPackage,
                commandManager,
                logger,
                (message: string) => {
                    onProgress?.(message);
                    void onStatus?.('deploying', message);
                },
            ),
        );

        if (!result.success) {
            project.appStatusSummary = 'error';
            recordDeployOutcome(project, 'integration', app.id, { status: 'error' });
            await stateManager.saveProject(project);
            await onStatus?.('error', result.error || 'Deployment failed');
            return { success: false, error: result.error || 'App Builder deployment failed' };
        }

        const url = result.data?.url;
        persistDeploySuccess(project, app.id, result.data);
        await stateManager.saveProject(project);

        await onStatus?.('deployed', undefined, url);
        return { success: true, url };
    } catch (error) {
        project.appStatusSummary = 'error';
        recordDeployOutcome(project, 'integration', app.id, { status: 'error' });
        await stateManager.saveProject(project);
        await onStatus?.('error', 'Deployment failed');
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
