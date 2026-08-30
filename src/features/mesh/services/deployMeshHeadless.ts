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

import { deployMeshCreateOrUpdate } from './meshRedeploy';
import { updateMeshState } from './stalenessDetector';
import type { SecretStorageLike } from '@/core/di/serviceLocator';
import { buildOrgTargetFromProjectAdobe, withOrgContext, type CommandExecutor } from '@/core/shell';
import { sanitizeErrorForLogging } from '@/core/validation';
import { recordDeployOutcome } from '@/features/app-builder/services/appBuilderDeployOutcome';
import { ensureMeshApiSubscribed } from '@/features/app-builder/services/ensureMeshApiSubscribed';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { ensureProjectAdobeContext } from '@/features/authentication/services/ensureProjectAdobeContext';
import { getComponentRegistryManager } from '@/features/components/services/componentRegistryInstance';
import { projectRequiresAppBuilder } from '@/features/components/services/projectAppBuilderPredicate';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';
import { getMeshComponentInstance, getMeshComponentId } from '@/types/typeGuards';

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
    /** ADR-015: collaborators supplied by whichever boundary starts the deploy. */
    authManager: AuthenticationService;
    commandManager: CommandExecutor;
    /** ADR-015: the secret store, for the mesh .env regeneration step. */
    secrets: SecretStorageLike | undefined;
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
    const { authManager } = deps;

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
    const registry = await getComponentRegistryManager(extensionPath).loadRegistry();
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

    // Target THIS project's org/project/workspace for every `aio` child issued
    // below. Without it the CLI falls back to its process-global `aio console
    // where` selection — which the extension deliberately stopped writing (Phase
    // 4a), so it holds whatever some earlier session left there. On 2026-08-03
    // that was a deleted project, and every deploy failed with the CLI's own
    // "The specified organization, project, and workspace combination is invalid
    // or disabled" buried in stdout while stderr blamed the mesh config.
    //
    // `ensureMeshApiSubscribed` wraps its own SDK calls with the same target
    // (harmless to nest — withOrgContext is AsyncLocalStorage), which is why the
    // subscribe step kept succeeding while the deploy beside it failed.
    const orgTarget = buildOrgTargetFromProjectAdobe(
        project.adobe,
        authManager.getCachedOrganization?.(),
    );

    try {
        return await withOrgContext(orgTarget, async () => {
            // Refresh the mesh .env from the manifest BEFORE deploying. It is a
            // generated artifact (every other path — creation, EDS Reset,
            // Configure — regenerates it wholesale), and `mesh.config.js` resolves
            // every endpoint through `{env.*}`, so a stale file silently deploys
            // the previous Commerce credentials and reads as "my change didn't
            // apply". Dynamic import keeps the cross-feature dependency at the
            // call site, matching projectResetService.
            //
            // BEST-EFFORT here, unlike the dashboard add path (which aborts).
            // The difference is whether a .env already exists: an add has none,
            // so deploying without one is the ENOENT being fixed. This path only
            // ever runs on an installed mesh, which creation already wrote a .env
            // for — so a mesh whose id has no registry definition should deploy
            // with its existing file, not stop working. Warn loudly instead.
            const meshComponentId = getMeshComponentId(project);
            if (meshComponentId) {
                onProgress?.('Generating mesh configuration...');
                try {
                    const { regenerateComponentEnvFile } = await import(
                        '@/features/project-creation/helpers/envFileGenerator'
                    );
                    await regenerateComponentEnvFile(
                        project,
                        registry,
                        logger,
                        meshComponentId,
                        meshComponent.path as string,
                        deps.secrets,
                    );
                } catch (envError) {
                    logger.warn(
                        `[Mesh Deployment] Could not refresh the mesh .env (${
                            (envError as Error).message
                        }) — deploying with the existing file, which may be stale.`,
                    );
                }
            }

            // Bounded pre-deploy subscribe (API Mesh API + baseline) BEFORE deploying.
            await ensureMeshApiSubscribed({ project, authService: authManager, logger });

            // Create-or-update from REMOTE truth — the shared rule lives in
            // deployMeshCreateOrUpdate (one copy, was three). Untargeted this
            // queried the WRONG project, failed, and reported no existing mesh
            // — sending a live mesh down the create path.
            const result = await deployMeshCreateOrUpdate(
                meshComponent.path as string,
                deps.commandManager,
                logger,
                (message: string, subMessage?: string) => onProgress?.(message, subMessage),
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
            // The instance status is NOT set here. updateMeshState below routes
            // through recordDeployOutcome, which advances the keyed entry AND
            // mirrors onto this same instance object — with a lastUpdated stamp
            // the hand-write never set. Two writers of one fact is the shape that
            // produced six mesh bugs in a day; this leaves one.
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
        });
    } catch (error) {
        await onStatus?.('error', 'Deployment failed');
        // Same as the success path: recordDeployOutcome below mirrors 'error'
        // onto the instance, so setting it by hand here only risks the two
        // disagreeing.
        // Persist WHY. Redacted + first-line-only: this lands in the project
        // manifest on disk, and raw `aio` output can carry tokens and home paths.
        recordDeployOutcome(project, 'mesh', meshComponent.id, {
            status: 'error',
            error: sanitizeErrorForLogging(error instanceof Error ? error : String(error)),
        });
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
