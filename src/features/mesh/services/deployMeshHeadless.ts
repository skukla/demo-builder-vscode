/**
 * deployMeshHeadless — the shared, UI-free API Mesh deploy core.
 *
 * Runs the sequence {@link DeployMeshCommand} orchestrates — preflight (auth +
 * org context) → App Builder permission gate → find mesh → bounded pre-deploy
 * subscribe → create-or-update deploy → persist — but returns a plain result
 * and emits status/progress through callbacks instead of driving the dashboard
 * and notification UI. Two callers share it:
 *   - `DeployMeshCommand` supplies `onStatus`/`onProgress` that bridge to the
 *     dashboard badge + progress notification, and maps the result to its
 *     toasts (the command owns the lock, the progress wrapper, and error UI).
 *   - the `deploy_mesh` MCP handler runs it headlessly (no callbacks) and shapes
 *     the returned result for the agent.
 *
 * @module features/mesh/services/deployMeshHeadless
 */

import { deployMeshComponent } from './meshDeployment';
import { fetchMeshInfoFromAdobeIO } from './meshVerifier';
import { updateMeshState } from './stalenessDetector';
import { ServiceLocator } from '@/core/di';
import { recordDeployOutcome } from '@/features/app-builder/services/appBuilderDeployOutcome';
import { ensureMeshApiSubscribed } from '@/features/app-builder/services/ensureMeshApiSubscribed';
import { ensureProjectAdobeContext } from '@/features/authentication/services/ensureProjectAdobeContext';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { projectRequiresAppBuilder } from '@/features/components/services/projectAppBuilderPredicate';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';
import { getMeshComponentInstance } from '@/types/typeGuards';

/** Why a deploy could not proceed (maps to the command's per-branch UI). */
export type MeshDeployBlock = 'auth' | 'org' | 'permission' | 'no-mesh';

export type MeshDeployStatus = 'deploying' | 'deployed' | 'error';

export interface DeployMeshHeadlessResult {
    success: boolean;
    meshId?: string;
    endpoint?: string;
    error?: string;
    /** Set when a guard stopped the deploy before it ran. */
    blockedBy?: MeshDeployBlock;
    /** True when a preflight prompt was dismissed (auth/org) — not an error. */
    cancelled?: boolean;
    currentOrg?: string;
}

export interface DeployMeshHeadlessDeps {
    project: Project;
    stateManager: StateManager;
    logger: Logger;
    /** Extension path — the App Builder permission gate loads the registry. */
    extensionPath: string;
    /** Status telegraph (dashboard badge). No-op for headless callers. */
    onStatus?: (
        status: MeshDeployStatus,
        message?: string,
        endpoint?: string
    ) => void | Promise<void>;
    /** Deploy progress (notification). No-op for headless callers. */
    onProgress?: (message: string, subMessage?: string) => void;
}

/**
 * Deploy (or redeploy) the current project's API Mesh, UI-free.
 *
 * @param deps - project + state/logger, extension path, and optional UI bridges
 * @returns the deploy result: `{success, meshId, endpoint}` or a blocked/failed result
 */
export async function deployMeshHeadless(
    deps: DeployMeshHeadlessDeps,
): Promise<DeployMeshHeadlessResult> {
    const { project, stateManager, logger, extensionPath, onStatus, onProgress } = deps;
    const authManager = ServiceLocator.getAuthenticationService();

    await onStatus?.('deploying', 'Checking requirements...');

    // PRE-FLIGHT: auth + correct org context (the shared gate). Passes silently
    // when already authed; only prompts when not (accepted headless behavior,
    // shared with the other Adobe tools).
    const preflight = await ensureProjectAdobeContext({
        authManager,
        project,
        logger,
        logPrefix: '[Mesh Deployment]',
        warningMessage: 'Adobe sign-in required to deploy mesh.',
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

    const meshComponent = getMeshComponentInstance(project);
    if (!meshComponent?.path) {
        return { success: false, blockedBy: 'no-mesh' };
    }

    await onStatus?.('deploying', 'Starting deployment...');
    meshComponent.status = 'deploying';
    await stateManager.saveProject(project);

    try {
        // Bounded pre-deploy subscribe (API Mesh API + baseline) BEFORE deploying.
        await ensureMeshApiSubscribed({ project, authService: authManager, logger });

        // Create-or-update: source the existing mesh id from Adobe I/O (remote truth).
        const meshInfo = await fetchMeshInfoFromAdobeIO(logger);
        const existingMeshId = meshInfo?.meshId || '';

        const result = await deployMeshComponent(
            meshComponent.path as string,
            ServiceLocator.getCommandExecutor(),
            logger,
            (message: string, subMessage?: string) => onProgress?.(message, subMessage),
            existingMeshId,
        );

        // A failed deploy result throws into the catch below (single error path:
        // 'error' status + component error-state persist), matching the command.
        if (!result.success) {
            throw new Error(result.error || 'Mesh deployment failed');
        }

        const deployedMeshId = result.data?.meshId;
        const deployedEndpoint = result.data?.endpoint;

        // Persist deployed status (the endpoint + runtime baseline live on the
        // keyed mesh appBuilderComponents entry, written by updateMeshState —
        // the single writer chokepoint, ADR-011 D3 Steps 07+09).
        meshComponent.status = 'deployed';
        meshComponent.metadata = {
            ...meshComponent.metadata,
            meshId: deployedMeshId || '',
            meshStatus: 'deployed',
        };
        await updateMeshState(project, deployedEndpoint);
        project.meshStatusSummary = 'deployed';
        await stateManager.saveProject(project);

        await onStatus?.('deployed', undefined, deployedEndpoint);
        return { success: true, meshId: deployedMeshId, endpoint: deployedEndpoint };
    } catch (error) {
        await onStatus?.('error', 'Deployment failed');
        meshComponent.status = 'error';
        recordDeployOutcome(project, 'mesh', meshComponent.id, { status: 'error' });
        // The SUMMARY has to move too. The success path above sets it to
        // 'deployed'; leaving it untouched here meant a failed redeploy kept
        // whatever the last SUCCESS wrote, so the dashboard — which reads this
        // field on open — reported "Mesh Deployed" with a green dot for a mesh
        // that had just failed. The two records above are not enough: neither is
        // consulted by that read path.
        project.meshStatusSummary = 'error';
        await stateManager.saveProject(project);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
