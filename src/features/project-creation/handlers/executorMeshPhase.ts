/**
 * Project Creation — Phase 3: mesh configuration.
 *
 * Deploy a fresh mesh, link an existing one, or skip — plus the pre-flight
 * auth check that keeps `aio api-mesh:*` calls from each opening their own
 * browser window, and the componentConfigs population from the generated
 * `.env`. Extracted from `executor.ts` (2026-08-23 god-file decomposition).
 *
 * @module features/project-creation/handlers/executorMeshPhase
 */

import {
    deployNewMesh,
    linkExistingMesh,
    shouldConfigureExistingMesh,
    type ComponentDefinitionEntry,
    type MeshApiConfig,
} from '../services';
import type { ProgressTracker } from './shared';
import type { HandlerContext } from '@/commands/handlers/HandlerContext';
import {
    buildOrgTargetFromProjectAdobe,
    withOrgContext,
    type OrgContextTarget,
} from '@/core/shell';
import type { Logger } from '@/types/logger';
import {
    getMeshComponentInstance,
    getMeshComponentId,
    getMeshEndpointUrl,
} from '@/types/typeGuards';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/**
 * A project's deployed mesh endpoint, if any — keyed-first via the shared
 * accessor (legacy meshState fallback inside, ADR-011 D3 Steps 07+09).
 */
function getMeshEndpoint(project?: import('@/types').Project): string | undefined {
    return getMeshEndpointUrl(project);
}

/**
 * Pre-flight authentication check before mesh CLI operations.
 *
 * Adobe CLI commands (`aio api-mesh:*`) each independently open a browser
 * window when the token is expired. This check ensures the token is valid
 * before any CLI calls run, preventing multiple browser popups. Follows the
 * pattern from DeployMeshCommand (deployMesh.ts:51-92).
 *
 * @param authManager - Authentication service (may be undefined)
 * @param logger - Logger for diagnostics
 * @param adobeConfig - Adobe org/project/workspace for context restoration after login
 * @returns true if authenticated (or no authManager), false if re-auth failed
 */
export async function ensureMeshPreflightAuth(
    authManager: HandlerContext['authManager'],
    logger: Logger,
    adobeConfig: { organization?: string; projectId?: string; workspace?: string },
): Promise<boolean> {
    if (!authManager) {
        return true; // Graceful degradation
    }

    const isAuthenticated = await authManager.isAuthenticated();
    if (isAuthenticated) {
        return true;
    }

    // Token expired — attempt re-login with context restoration
    logger.warn(
        '[Mesh Setup] Adobe auth token expired before mesh deployment — attempting re-login',
    );
    const loginSuccess = await authManager.loginAndRestoreProjectContext({
        organization: adobeConfig.organization,
        projectId: adobeConfig.projectId,
        workspace: adobeConfig.workspace,
    });

    if (!loginSuccess) {
        logger.warn('[Mesh Setup] Re-login failed — mesh deployment will likely fail');
        return false;
    }

    // Verify token is actually valid after login
    const postLoginAuth = await authManager.isAuthenticated();
    if (!postLoginAuth) {
        logger.warn('[Mesh Setup] Re-login completed but token still invalid');
        return false;
    }

    logger.info('[Mesh Setup] Re-login successful — continuing with mesh deployment');
    return true;
}

/**
 * Execute Phase 3: Mesh configuration (deploy new, link existing, or skip).
 */
export async function executeMeshPhase(
    context: HandlerContext,
    setupContext: import('@/features/project-creation/services/ProjectSetupContext').ProjectSetupContext,
    project: import('@/types').Project,
    typedConfig: ProjectCreationConfig,
    componentDefinitions: Map<string, ComponentDefinitionEntry>,
    progressTracker: ProgressTracker,
    isEditMode: string | boolean | undefined,
    existingProject: import('@/types').Project | undefined,
): Promise<void> {
    // App Builder permission gate. Mesh deployment is an App Builder operation:
    // it creates a workspace credential and deploys an action package, both of
    // which require the Developer/System-Admin role in the IMS org. Demos
    // without App Builder components don't trigger this gate.
    //
    // See `projectAppBuilderPredicate.ts` for the source of truth on which
    // components count as App Builder.
    const { projectRequiresAppBuilder } = await import(
        '@/features/components/services/projectAppBuilderPredicate'
    );
    if (projectRequiresAppBuilder(project, setupContext.registry)) {
        const { ServiceLocator } = await import('@/core/di');
        const authService = ServiceLocator.getAuthenticationService();
        const permissionCheck = await authService.testDeveloperPermissions();
        if (!permissionCheck.hasPermissions) {
            const errorMessage =
                permissionCheck.error ||
                'Your account lacks Developer or System Admin role for this organization. ' +
                    'API Mesh deployment requires App Builder access. ' +
                    'Please select a different organization or contact your administrator.';
            context.logger.error(`[Mesh Setup] Developer permission gate failed: ${errorMessage}`);
            throw new Error(errorMessage);
        }
        context.logger.debug('[Mesh Setup] Developer permission gate passed');
    }

    const meshComponent = getMeshComponentInstance(project);
    const meshId = getMeshComponentId(project);
    const meshDefinition = meshId ? componentDefinitions.get(meshId)?.definition : undefined;

    const meshContext = {
        setupContext,
        meshDefinition,
        progressTracker,
        onMeshCreated: (workspace: string | undefined) => {
            context.sharedState.meshCreatedForWorkspace = workspace;
        },
    };

    logMeshDecisionContext(
        context,
        typedConfig,
        project,
        meshComponent,
        meshId,
        meshDefinition,
        isEditMode,
        existingProject,
    );

    // Check for same-workspace import FIRST
    const isSameWorkspaceImport =
        typedConfig.importedWorkspaceId &&
        typedConfig.importedMeshEndpoint &&
        typedConfig.importedWorkspaceId === typedConfig.adobe?.workspace;

    if (isSameWorkspaceImport) {
        context.logger.info(
            `[Mesh Setup] Skipping deployment - reusing mesh from imported settings`,
        );
        const importedApiMesh = {
            endpoint: typedConfig.importedMeshEndpoint,
            meshId: '',
            meshStatus: 'deployed' as const,
            workspace: typedConfig.adobe?.workspace,
        };
        await linkExistingMesh(meshContext, importedApiMesh);
    } else if (shouldConfigureExistingMesh(typedConfig.apiMesh, getMeshEndpoint(project))) {
        await linkExistingMesh(meshContext, typedConfig.apiMesh as MeshApiConfig);
    } else if (isEditMode && getMeshEndpoint(existingProject)) {
        context.logger.info('[Mesh Setup] Edit mode - reusing existing mesh from project');
        const existingMesh = {
            endpoint: getMeshEndpoint(existingProject) as string,
            meshId: (getMeshComponentInstance(existingProject)?.metadata?.meshId as string) || '',
            meshStatus: 'deployed' as const,
            workspace: typedConfig.adobe?.workspace,
        };
        await linkExistingMesh(meshContext, existingMesh);
    } else if (meshComponent?.path && meshDefinition) {
        await deployFreshMesh(context, typedConfig, meshContext);
    }
}

/**
 * Log mesh deployment decision context for debugging.
 */
function logMeshDecisionContext(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
    project: import('@/types').Project,
    meshComponent: import('@/types').ComponentInstance | undefined,
    meshId: string | undefined,
    meshDefinition: import('@/types').TransformedComponentDefinition | undefined,
    isEditMode: string | boolean | undefined,
    existingProject: import('@/types').Project | undefined,
): void {
    context.logger.debug(`[Mesh Setup] Decision context:`);
    context.logger.debug(`  - isEditMode: ${isEditMode}`);
    context.logger.debug(`  - existing project mesh endpoint: ${getMeshEndpoint(existingProject)}`);
    context.logger.debug(`  - typedConfig.apiMesh: ${JSON.stringify(typedConfig.apiMesh)}`);
    context.logger.debug(`  - meshComponent?.path: ${meshComponent?.path}`);
    context.logger.debug(`  - meshId: ${meshId}`);
    context.logger.debug(`  - meshDefinition: ${meshDefinition ? 'found' : 'NOT FOUND'}`);
    context.logger.debug(
        `  - shouldConfigureExistingMesh result: ${shouldConfigureExistingMesh(typedConfig.apiMesh, getMeshEndpoint(project))}`,
    );
}

/**
 * Build the org-context target for the create-time mesh deploy via the shared
 * builder (enriches org code/name from the cached org only on an id match).
 */
export function buildDeployOrgTarget(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
): OrgContextTarget {
    return buildOrgTargetFromProjectAdobe(
        typedConfig.adobe,
        context.authManager?.getCachedOrganization(),
    );
}

/**
 * Deploy a fresh mesh after pre-flight auth.
 *
 * Targets the project's KNOWN org/project/workspace via per-invocation
 * AIO_CONSOLE_* env (withOrgContext) instead of mutating the shared `aio`
 * global with selectWorkspace (which races concurrent processes). The deploy
 * and all dependent `aio api-mesh` calls run inside the wrapper.
 */
export async function deployFreshMesh(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
    meshContext: import('../services').MeshSetupContext,
): Promise<void> {
    if (
        typedConfig.importedWorkspaceId &&
        typedConfig.importedWorkspaceId !== typedConfig.adobe?.workspace
    ) {
        context.logger.debug(
            `[Mesh Setup] Imported workspace differs from selected - deploying new mesh`,
        );
    }

    const authOk = await ensureMeshPreflightAuth(context.authManager, context.logger, {
        organization: typedConfig.adobe?.organization,
        projectId: typedConfig.adobe?.projectId,
        workspace: typedConfig.adobe?.workspace,
    });
    if (!authOk) {
        throw new Error(
            'Adobe authentication expired and re-login failed. Please sign in again and retry.',
        );
    }

    const target = buildDeployOrgTarget(context, typedConfig);
    await withOrgContext(target, () => deployNewMesh(meshContext, typedConfig.apiMesh));
}

/**
 * Populate componentConfigs for mesh from the generated .env file.
 */
export async function populateMeshComponentConfigs(
    context: HandlerContext,
    project: import('@/types').Project,
): Promise<void> {
    const meshInstance = getMeshComponentInstance(project);
    const meshId = getMeshComponentId(project);
    if (!meshInstance?.path || !meshId) return;

    const { readMeshEnvVarsFromFile } = await import('@/features/mesh/services/stalenessDetector');
    const meshEnvVars = await readMeshEnvVarsFromFile(meshInstance.path);
    const envVarCount = meshEnvVars ? Object.keys(meshEnvVars).length : 0;
    if (meshEnvVars && envVarCount > 0) {
        if (!project.componentConfigs) {
            project.componentConfigs = {};
        }
        project.componentConfigs[meshId] = meshEnvVars;
        context.logger.debug(
            `[Project Creation] Populated componentConfigs[${meshId}] with ${envVarCount} env vars`,
        );
    }
}
