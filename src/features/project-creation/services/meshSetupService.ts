/**
 * MeshSetupService
 *
 * Handles API Mesh configuration and deployment during project creation.
 * Phase 3: Generate mesh .env + Deploy to Adobe I/O (or link existing mesh)
 *
 * Supports retry on failure with user interaction via meshPhase progress state.
 */

import { ProgressTracker } from '../handlers/shared';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getMeshNodeVersion } from '@/features/mesh/services/meshConfig';
import { extractAndParseJSON } from '@/features/mesh/utils/meshHelpers';
import {
    ProjectSetupContext,
    generateComponentEnvFile,
    deployMeshComponent,
} from '@/features/project-creation/helpers';
import type { Project, TransformedComponentDefinition, Logger } from '@/types';
import { getMeshComponentInstance, getMeshComponentId } from '@/types/typeGuards';
import type { MeshPhaseState } from '@/types/webview';

/** Maximum number of mesh deployment retry attempts */
const MAX_MESH_ATTEMPTS = 3;

/** User decision for mesh retry flow */
export type MeshUserDecision = 'retry' | 'cancel';

export interface MeshSetupContext {
    setupContext: ProjectSetupContext;
    meshDefinition?: TransformedComponentDefinition;
    progressTracker: ProgressTracker;
    onMeshCreated?: (workspace: string | undefined) => void;
    /** Send mesh phase state for UI display */
    onMeshPhaseUpdate?: (meshPhase: MeshPhaseState) => void;
    /** Wait for user decision on retry/cancel (resolves with 'retry' or 'cancel') */
    waitForMeshDecision?: () => Promise<MeshUserDecision>;
}

export interface MeshApiConfig {
    meshId?: string;
    endpoint?: string;
    meshStatus?: string;
    workspace?: string;
}

/**
 * Determine if we should configure an existing mesh (vs deploy new one)
 *
 * @param meshConfig - Mesh config from wizard (meshId, endpoint from workspace check)
 * @param existingEndpoint - Endpoint already set on component instance (if any)
 * @returns True if workspace has existing mesh that should be linked
 */
export function shouldConfigureExistingMesh(
    meshConfig: MeshApiConfig | undefined,
    existingEndpoint: string | undefined,
): boolean {
    const hasExistingMesh = Boolean(meshConfig?.meshId && meshConfig?.endpoint);
    const notAlreadyConfigured = !existingEndpoint; // Skip if endpoint already set
    return hasExistingMesh && notAlreadyConfigured;
}

/**
 * Deploy a new mesh and update project state
 *
 * Supports retry on failure when onMeshPhaseUpdate and waitForMeshDecision are provided.
 * Shows mesh deployment progress UI and allows user to retry or cancel on failure.
 */
export async function deployNewMesh(
    context: MeshSetupContext,
    apiMeshConfig: MeshApiConfig | undefined,
): Promise<void> {
    const {
        setupContext,
        meshDefinition,
        progressTracker,
        onMeshCreated,
        onMeshPhaseUpdate,
        waitForMeshDecision,
    } = context;
    const { project, logger } = setupContext;
    const meshComponent = getMeshComponentInstance(project);
    const meshComponentId = getMeshComponentId(project);

    if (!meshComponent?.path || !meshDefinition || !meshComponentId) {
        return;
    }

    // Generate mesh .env BEFORE deployment (mesh needs commerce URLs from .env)
    progressTracker('Configuring API Mesh', 70, 'Generating mesh configuration...');
    logger.info('[Project Creation] Phase 3: Configuring and deploying API Mesh...');

    await generateComponentEnvFile(
        meshComponent.path,
        meshComponentId,
        meshDefinition,
        setupContext,
    );
    logger.debug('[Project Creation] Mesh .env generated');

    // Helper to update mesh phase state
    const updateMeshPhase = (state: Partial<MeshPhaseState> & { status: MeshPhaseState['status'] }) => {
        if (onMeshPhaseUpdate) {
            onMeshPhaseUpdate({
                attempt: 1,
                maxAttempts: MAX_MESH_ATTEMPTS,
                elapsedSeconds: 0,
                ...state,
            });
        }
    };

    // Retry loop for mesh deployment
    let attempt = 0;
    const startTime = Date.now();

    while (attempt < MAX_MESH_ATTEMPTS) {
        attempt++;
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

        // Update progress and mesh phase
        progressTracker('Deploying API Mesh', 75, 'Deploying mesh to Adobe I/O...');
        updateMeshPhase({
            status: 'deploying',
            attempt,
            maxAttempts: MAX_MESH_ATTEMPTS,
            elapsedSeconds,
            message: 'Deploying mesh to Adobe I/O...',
        });

        try {
            const commandManager = ServiceLocator.getCommandExecutor();
            const meshDeployResult = await deployMeshComponent(
                meshComponent.path,
                commandManager,
                logger,
                (message: string, subMessage?: string) => {
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    progressTracker('Deploying API Mesh', 80, subMessage || message);
                    updateMeshPhase({
                        status: 'verifying',
                        attempt,
                        maxAttempts: MAX_MESH_ATTEMPTS,
                        elapsedSeconds: elapsed,
                        message: subMessage || message,
                    });
                },
                apiMeshConfig?.meshId, // Pass existing mesh ID to enable update strategy
            );

            if (meshDeployResult.success) {
                // Success! Update mesh phase and continue
                const finalElapsed = Math.floor((Date.now() - startTime) / 1000);

                // Notify that mesh was created for this workspace
                if (onMeshCreated) {
                    const adobeConfig = setupContext.config as { adobe?: { workspace?: string } };
                    onMeshCreated(adobeConfig.adobe?.workspace);
                }

                // Get mesh info - prefer from deployment result, fall back to wizard config
                let meshId = meshDeployResult.data?.meshId || apiMeshConfig?.meshId;
                let endpoint = meshDeployResult.data?.endpoint || apiMeshConfig?.endpoint;

                // If wizard didn't capture mesh info (e.g., still provisioning), fetch it now
                if (!meshId || !endpoint) {
                    try {
                        const describeResult = await commandManager.execute('aio api-mesh:describe', {
                            timeout: TIMEOUTS.NORMAL,
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
                                meshId = meshId || meshData.meshId || meshData.mesh_id;
                                endpoint = endpoint || meshData.meshEndpoint || meshData.endpoint;
                            }
                        }
                    } catch (describeError) {
                        logger.warn('[Project Creation] Could not fetch mesh info, continuing without it');
                    }
                }

                // Update component instance with deployment info
                // Note: endpoint is stored in meshState (authoritative), not componentInstance
                meshComponent.status = 'deployed';
                meshComponent.metadata = {
                    meshId: meshId || '',
                    meshStatus: 'deployed',
                };
                project.componentInstances![meshComponentId] = meshComponent;

                // Update mesh phase to success
                updateMeshPhase({
                    status: 'success',
                    attempt,
                    maxAttempts: MAX_MESH_ATTEMPTS,
                    elapsedSeconds: finalElapsed,
                    endpoint,
                    message: 'Mesh deployed successfully',
                });

                // Update meshState to track deployment (includes endpoint as single source of truth)
                // See docs/architecture/state-ownership.md
                await updateProjectMeshState(project, logger, endpoint);

                logger.info(`[Project Creation] Phase 3 complete: Mesh deployed${endpoint ? ' at ' + endpoint : ''}`);
                return; // Success, exit the retry loop
            } else {
                throw new Error(meshDeployResult.error || 'Mesh deployment failed');
            }
        } catch (meshError) {
            const errorElapsed = Math.floor((Date.now() - startTime) / 1000);
            logger.error(`[Project Creation] Mesh deployment attempt ${attempt}/${MAX_MESH_ATTEMPTS} failed`, meshError as Error);

            const { formatMeshDeploymentError } = await import('@/features/mesh/utils/errorFormatter');
            const errorMessage = formatMeshDeploymentError(meshError as Error);

            // If we have retry capability and haven't exhausted attempts, ask user
            if (waitForMeshDecision && attempt < MAX_MESH_ATTEMPTS) {
                updateMeshPhase({
                    status: 'error',
                    attempt,
                    maxAttempts: MAX_MESH_ATTEMPTS,
                    elapsedSeconds: errorElapsed,
                    errorMessage,
                    message: 'Mesh deployment failed',
                });

                logger.debug('[Project Creation] Waiting for user decision (retry or cancel)...');
                const decision = await waitForMeshDecision();

                if (decision === 'cancel') {
                    logger.debug('[Project Creation] User cancelled mesh deployment');
                    throw new Error('Mesh deployment cancelled by user');
                }

                // User chose retry, continue to next iteration
                logger.debug(`[Project Creation] User chose to retry mesh deployment (attempt ${attempt + 1}/${MAX_MESH_ATTEMPTS})`);
                continue;
            }

            // No retry capability or max attempts reached - throw the error
            updateMeshPhase({
                status: 'error',
                attempt,
                maxAttempts: MAX_MESH_ATTEMPTS,
                elapsedSeconds: errorElapsed,
                errorMessage,
                message: attempt >= MAX_MESH_ATTEMPTS
                    ? `Mesh deployment failed after ${MAX_MESH_ATTEMPTS} attempts`
                    : 'Mesh deployment failed',
            });

            throw new Error(errorMessage);
        }
    }

    // Should not reach here, but just in case
    throw new Error(`Mesh deployment failed after ${MAX_MESH_ATTEMPTS} attempts`);
}

/**
 * Link an existing mesh to the project (no deployment needed)
 */
export async function linkExistingMesh(
    context: MeshSetupContext,
    meshConfig: MeshApiConfig,
): Promise<void> {
    const { setupContext, meshDefinition, progressTracker } = context;
    const { project, logger } = setupContext;
    const meshComponent = getMeshComponentInstance(project);
    const meshComponentId = getMeshComponentId(project);

    progressTracker('Configuring API Mesh', 75, 'Updating existing mesh configuration...');
    logger.info('[Project Creation] Phase 3: Configuring and deploying API Mesh...');

    // Generate mesh .env file (needed for deployment)
    if (meshComponent?.path && meshDefinition && meshComponentId) {
        await generateComponentEnvFile(
            meshComponent.path,
            meshComponentId,
            meshDefinition,
            setupContext,
        );
        logger.debug('[Project Creation] Mesh .env generated');

        // CRITICAL: Deploy/update the mesh with the configuration from the cloned repository
        // Even if a mesh exists in the workspace, we need to update it with our mesh.json
        // This ensures the mesh has the correct schema (e.g., CATALOG_SERVICE_ENDPOINT vs ADOBE_CATALOG_SERVICE_ENDPOINT)
        logger.debug('[Mesh Setup] Deploying mesh configuration to Adobe I/O...');
        
        const commandManager = ServiceLocator.getCommandExecutor();
        const meshDeployResult = await deployMeshComponent(
            meshComponent.path,
            commandManager,
            logger,
            (message: string, subMessage?: string) => {
                progressTracker('Deploying API Mesh', 78, subMessage || message);
            },
            meshConfig.meshId, // Pass existing mesh ID to enable update strategy
        );

        if (!meshDeployResult.success) {
            // Deployment failed - throw error to trigger cleanup
            throw new Error(`Mesh deployment failed: ${meshDeployResult.error || 'Unknown error'}`);
        }

        // Update mesh config with deployment result
        meshConfig = {
            ...meshConfig,
            meshId: meshDeployResult.data?.meshId || meshConfig.meshId,
            endpoint: meshDeployResult.data?.endpoint || meshConfig.endpoint,
            meshStatus: 'deployed',
        };

        logger.debug('[Project Creation] Mesh deployment complete');
    }

    // Preserve existing component properties (like path from Phase 1 cloning)
    // Note: endpoint is stored in meshState (authoritative), not componentInstance
    if (meshComponentId) {
        project.componentInstances![meshComponentId] = {
            ...meshComponent, // Preserve path if component was cloned
            id: meshComponentId,
            name: 'Commerce API Mesh',
            type: 'dependency',
            subType: 'mesh',
            status: 'deployed',
            lastUpdated: new Date(),
            metadata: {
                meshId: meshConfig.meshId,
                meshStatus: meshConfig.meshStatus,
            },
        };
    }

    // Update meshState with endpoint as single source of truth
    // See docs/architecture/state-ownership.md
    await updateProjectMeshState(project, logger, meshConfig.endpoint);

    logger.info('[Project Creation] Phase 3 complete: Existing mesh linked');
}

/**
 * Update project mesh state after deployment/linking
 *
 * Sets meshState with envVars from componentConfigs, source hash, endpoint, and timestamp.
 * The endpoint is stored in meshState as the single source of truth.
 * See docs/architecture/state-ownership.md for details.
 *
 * Staleness detection (comparing local vs deployed) happens later via detectMeshChanges().
 *
 * @param project - The project to update
 * @param logger - Logger instance
 * @param endpoint - The mesh endpoint URL (optional)
 */
async function updateProjectMeshState(project: Project, logger: Logger, endpoint?: string): Promise<void> {
    const { updateMeshState } = await import('@/features/mesh/services/stalenessDetector');

    await updateMeshState(project, endpoint);
    logger.debug('[Project Creation] Updated mesh state after deployment');
}
