/**
 * MeshSetupService
 *
 * Handles API Mesh configuration and deployment during project creation.
 * Phase 3: Generate mesh .env + Deploy to Adobe I/O (or link existing mesh)
 *
 * Supports retry on failure with user interaction via meshPhase progress state.
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
import type { MeshPhaseState } from '@/types/webview';
import { hasEntries } from '@/types/typeGuards';

/** Maximum number of mesh deployment retry attempts */
const MAX_MESH_ATTEMPTS = 3;

/** User decision for mesh retry flow */
export type MeshUserDecision = 'retry' | 'cancel';

export interface MeshSetupContext {
    project: Project;
    meshDefinition?: TransformedComponentDefinition;
    sharedEnvVars: Record<string, Omit<EnvVarDefinition, 'key'>>;
    config: Record<string, unknown>;
    progressTracker: ProgressTracker;
    logger: Logger;
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
 * @param meshStepEnabled - Whether mesh wizard step is enabled
 * @returns True if workspace has existing mesh that should be linked
 */
export function shouldConfigureExistingMesh(
    meshConfig: MeshApiConfig | undefined,
    existingEndpoint: string | undefined,
    meshStepEnabled: boolean | undefined,
): boolean {
    const hasExistingMesh = Boolean(meshConfig?.meshId && meshConfig?.endpoint);
    const notAlreadyConfigured = !existingEndpoint; // Skip if endpoint already set
    const notHandledByWizardStep = !meshStepEnabled;
    return hasExistingMesh && notAlreadyConfigured && notHandledByWizardStep;
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
        project,
        meshDefinition,
        sharedEnvVars,
        config,
        progressTracker,
        logger,
        onMeshCreated,
        onMeshPhaseUpdate,
        waitForMeshDecision,
    } = context;
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
            );

            if (meshDeployResult.success) {
                // Success! Update mesh phase and continue
                const finalElapsed = Math.floor((Date.now() - startTime) / 1000);

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

                // Update mesh phase to success
                updateMeshPhase({
                    status: 'success',
                    attempt,
                    maxAttempts: MAX_MESH_ATTEMPTS,
                    elapsedSeconds: finalElapsed,
                    endpoint,
                    message: 'Mesh deployed successfully',
                });

                // Update meshState to track deployment
                await updateProjectMeshState(project, logger);

                logger.info(`[Project Creation] ✅ Phase 3 complete: Mesh deployed${endpoint ? ' at ' + endpoint : ''}`);
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

                logger.info('[Project Creation] Waiting for user decision (retry or cancel)...');
                const decision = await waitForMeshDecision();

                if (decision === 'cancel') {
                    logger.info('[Project Creation] User cancelled mesh deployment');
                    throw new Error('Mesh deployment cancelled by user');
                }

                // User chose retry, continue to next iteration
                logger.info(`[Project Creation] User chose to retry mesh deployment (attempt ${attempt + 1}/${MAX_MESH_ATTEMPTS})`);
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
    const { project, progressTracker, logger } = context;

    progressTracker('Configuring API Mesh', 75, 'Adding existing mesh to project...');
    logger.info('[Project Creation] 🔗 Phase 3: Linking existing API Mesh...');

    // Preserve existing component properties (like path from Phase 1 cloning)
    const existingMeshComponent = project.componentInstances?.['commerce-mesh'];

    project.componentInstances!['commerce-mesh'] = {
        ...existingMeshComponent, // Preserve path if component was cloned
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
