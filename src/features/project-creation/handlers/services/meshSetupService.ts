/**
 * MeshSetupService
 *
 * Handles API Mesh configuration and deployment during project creation.
 * Phase 3: Generate mesh .env + Deploy to Adobe I/O (or link existing mesh)
 */

import { ProgressTracker } from '../shared';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getMeshNodeVersion } from '@/features/mesh/services/meshConfig';
import { extractAndParseJSON } from '@/features/mesh/utils/meshHelpers';
import {
    generateComponentEnvFile,
    deployMeshComponent,
} from '@/features/project-creation/helpers';
import type { Project, TransformedComponentDefinition, EnvVarDefinition } from '@/types';
import type { Logger } from '@/types/logger';
import { hasEntries } from '@/types/typeGuards';

export interface MeshSetupContext {
    project: Project;
    meshDefinition?: TransformedComponentDefinition;
    sharedEnvVars: Record<string, Omit<EnvVarDefinition, 'key'>>;
    config: Record<string, unknown>;
    progressTracker: ProgressTracker;
    logger: Logger;
    onMeshCreated?: (workspace: string | undefined) => void;
}

export interface MeshApiConfig {
    meshId?: string;
    endpoint?: string;
    meshStatus?: string;
    workspace?: string;
}

/**
 * Determine if we should configure an existing mesh (vs clone new one)
 */
export function shouldConfigureExistingMesh(
    meshConfig: MeshApiConfig | undefined,
    meshComponent: unknown,
    meshStepEnabled: boolean | undefined,
): boolean {
    const hasExistingMesh = Boolean(meshConfig?.meshId && meshConfig?.endpoint);
    const notAlreadyInstalled = !meshComponent;
    const notHandledByWizardStep = !meshStepEnabled;
    return hasExistingMesh && notAlreadyInstalled && notHandledByWizardStep;
}

/**
 * Deploy a new mesh and update project state
 */
export async function deployNewMesh(
    context: MeshSetupContext,
    apiMeshConfig: MeshApiConfig | undefined,
): Promise<void> {
    const { project, meshDefinition, sharedEnvVars, config, progressTracker, logger, onMeshCreated } = context;
    const meshComponent = project.componentInstances?.['commerce-mesh'];

    if (!meshComponent?.path || !meshDefinition) {
        return;
    }

    // Generate mesh .env BEFORE deployment (mesh needs commerce URLs from .env)
    progressTracker('Configuring API Mesh', 70, 'Generating mesh configuration...');
    logger.info('[Project Creation] 🔧 Phase 3: Configuring and deploying API Mesh...');

    await generateComponentEnvFile(
        meshComponent.path,
        'commerce-mesh',
        meshDefinition,
        sharedEnvVars,
        config,
        logger,
    );
    logger.debug('[Project Creation] Mesh .env generated');

    // Now deploy mesh
    progressTracker('Deploying API Mesh', 75, 'Deploying mesh to Adobe I/O...');

    try {
        const commandManager = ServiceLocator.getCommandExecutor();
        const meshDeployResult = await deployMeshComponent(
            meshComponent.path,
            commandManager,
            logger,
            (message: string, subMessage?: string) => {
                progressTracker('Deploying API Mesh', 80, subMessage || message);
            },
        );

        if (meshDeployResult.success) {
            // Notify that mesh was created for this workspace
            if (onMeshCreated) {
                const adobeConfig = config as { adobe?: { workspace?: string } };
                onMeshCreated(adobeConfig.adobe?.workspace);
            }

            // Get mesh info - prefer from wizard, but fetch if not available
            let meshId = apiMeshConfig?.meshId;
            let endpoint = apiMeshConfig?.endpoint;

            // If wizard didn't capture mesh info (e.g., still provisioning), fetch it now
            if (!meshId || !endpoint) {
                logger.debug('[Project Creation] Fetching mesh info via describe...');
                try {
                    const describeResult = await commandManager.execute('aio api-mesh:describe', {
                        timeout: TIMEOUTS.MESH_DESCRIBE,
                        configureTelemetry: false,
                        useNodeVersion: getMeshNodeVersion(),
                        enhancePath: true,
                    });

                    if (describeResult.code === 0) {
                        const meshData = extractAndParseJSON<{
                            meshId?: string;
                            mesh_id?: string;
                            meshEndpoint?: string;
                            endpoint?: string;
                        }>(describeResult.stdout);
                        if (meshData) {
                            meshId = meshData.meshId || meshData.mesh_id;
                            endpoint = meshData.meshEndpoint || meshData.endpoint;
                        }
                    }
                } catch {
                    logger.warn('[Project Creation] Could not fetch mesh info, continuing without it');
                }
            }

            // Update component instance with deployment info
            meshComponent.endpoint = endpoint;
            meshComponent.status = 'deployed';
            meshComponent.metadata = {
                meshId: meshId || '',
                meshStatus: 'deployed',
            };
            project.componentInstances!['commerce-mesh'] = meshComponent;

            // Update meshState to track deployment
            await updateProjectMeshState(project, logger);

            logger.info(`[Project Creation] ✅ Phase 3 complete: Mesh deployed${endpoint ? ' at ' + endpoint : ''}`);
        } else {
            throw new Error(meshDeployResult.error || 'Mesh deployment failed');
        }
    } catch (meshError) {
        logger.error('[Project Creation] Failed to deploy mesh', meshError as Error);
        const { formatMeshDeploymentError } = await import('@/features/mesh/utils/errorFormatter');
        throw new Error(formatMeshDeploymentError(meshError as Error));
    }
}

/**
 * Link an existing mesh to the project (no deployment needed)
 */
export async function linkExistingMesh(
    context: MeshSetupContext,
    meshConfig: MeshApiConfig,
): Promise<void> {
    const { project, progressTracker, logger } = context;

    progressTracker('Configuring API Mesh', 75, 'Adding existing mesh to project...');
    logger.info('[Project Creation] 🔗 Phase 3: Linking existing API Mesh...');

    project.componentInstances!['commerce-mesh'] = {
        id: 'commerce-mesh',
        name: 'Commerce API Mesh',
        type: 'dependency',
        subType: 'mesh',
        status: 'deployed',
        endpoint: meshConfig.endpoint,
        lastUpdated: new Date(),
        metadata: {
            meshId: meshConfig.meshId,
            meshStatus: meshConfig.meshStatus,
        },
    };

    await updateProjectMeshState(project, logger);

    logger.info('[Project Creation] ✅ Phase 3 complete: Existing mesh linked');
}

/**
 * Update project mesh state after deployment/linking
 */
async function updateProjectMeshState(project: Project, logger: Logger): Promise<void> {
    const { updateMeshState, fetchDeployedMeshConfig } = await import('@/features/mesh/services/stalenessDetector');

    await updateMeshState(project);
    logger.debug('[Project Creation] Updated mesh state after deployment');

    const deployedConfig = await fetchDeployedMeshConfig();
    if (hasEntries(deployedConfig)) {
        project.meshState!.envVars = deployedConfig;
        logger.debug('[Project Creation] Populated meshState.envVars with deployed config');
    }
}
