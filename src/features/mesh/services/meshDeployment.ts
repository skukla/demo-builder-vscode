/**
 * Mesh deployment orchestration
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getMeshNodeVersion } from '@/features/mesh/services/meshConfig';
import type { MeshDeploymentResult } from '@/features/mesh/services/types';
import type { Logger } from '@/types/logger';
import { parseJSON, toError } from '@/types/typeGuards';

export type { MeshDeploymentResult };

/**
 * Deploy mesh component from cloned repository
 * Reads mesh.json from component path and deploys it to Adobe I/O
 *
 * @param componentPath - Path to the component directory containing mesh.json
 * @param commandManager - ExternalCommandManager instance for executing commands
 * @param logger - Logger instance for info/error messages
 * @param onProgress - Optional callback for progress updates
 * @returns Deployment result with success status, meshId, endpoint, or error
 */
export async function deployMeshComponent(
    componentPath: string,
    commandManager: CommandExecutor,
    logger: Logger,
    onProgress?: (message: string, subMessage?: string) => void,
): Promise<MeshDeploymentResult> {
    try {
        // Check for mesh.json in component directory
        const meshConfigPath = path.join(componentPath, 'mesh.json');
        await fsPromises.access(meshConfigPath);

        onProgress?.('Reading mesh configuration...', '');

        // Validate mesh config exists and is valid JSON
        const meshConfigContent = await fsPromises.readFile(meshConfigPath, 'utf-8');
        try {
            const config = parseJSON<Record<string, unknown>>(meshConfigContent);
            if (!config) {
                throw new Error('Invalid JSON');
            }
        } catch (parseError) {
            throw new Error('Invalid mesh.json file: ' + (parseError as Error).message);
        }

        // Use the original mesh.json path directly (not a temp copy)
        // This ensures relative paths in mesh.json (like build/resolvers/*.js) resolve correctly
        logger.debug(`[Mesh Deployment] Using config from: ${meshConfigPath}`);

        // Try create first (faster than checking existence)
        // If mesh already exists, create will fail fast and we'll fall back to update
        let meshCommand: 'create' | 'update' = 'create';
        logger.debug('[Mesh Deployment] Attempting mesh creation...');
        onProgress?.('Deploying API Mesh...', 'Creating mesh');

        let deployResult = await commandManager.execute(
            `aio api-mesh:${meshCommand} "${meshConfigPath}" --autoConfirmAction`,
            {
                cwd: componentPath, // Run from mesh component directory (where .env file is)
                streaming: true,
                shell: true, // Required for command string with arguments and quoted paths
                timeout: TIMEOUTS.API_MESH_CREATE,
                onOutput: (data: string) => {
                    const output = data.toLowerCase();
                    if (output.includes('validating')) {
                        onProgress?.('Deploying...', 'Validating configuration');
                    } else if (output.includes('updating') || output.includes('creating')) {
                        onProgress?.('Deploying...', 'Creating mesh infrastructure');
                    } else if (output.includes('deploying')) {
                        onProgress?.('Deploying...', 'Deploying mesh');
                    } else if (output.includes('success')) {
                        onProgress?.('Deploying...', 'Mesh created successfully');
                    }
                },
                configureTelemetry: false,
                useNodeVersion: getMeshNodeVersion(),
                enhancePath: true,
            },
        );

        // If create fails with "mesh already exists", fall back to update
        if (deployResult.code !== 0) {
            const combined = `${deployResult.stdout}\n${deployResult.stderr}`;
            // Adobe CLI returns "already has a mesh" when workspace has existing mesh
            const meshAlreadyExists = /already has a mesh|mesh already exists/i.test(combined);

            if (meshAlreadyExists) {
                logger.debug('[Mesh Deployment] Mesh already exists, falling back to update...');
                meshCommand = 'update';
                onProgress?.('Deploying API Mesh...', 'Updating existing mesh');

                deployResult = await commandManager.execute(
                    `aio api-mesh:update "${meshConfigPath}" --autoConfirmAction`,
                    {
                        cwd: componentPath,
                        streaming: true,
                        shell: true,
                        timeout: TIMEOUTS.API_MESH_UPDATE,
                        onOutput: (data: string) => {
                            const output = data.toLowerCase();
                            if (output.includes('validating')) {
                                onProgress?.('Deploying...', 'Validating configuration');
                            } else if (output.includes('updating')) {
                                onProgress?.('Deploying...', 'Updating mesh infrastructure');
                            } else if (output.includes('deploying')) {
                                onProgress?.('Deploying...', 'Deploying mesh');
                            } else if (output.includes('success')) {
                                onProgress?.('Deploying...', 'Mesh updated successfully');
                            }
                        },
                        configureTelemetry: false,
                        useNodeVersion: getMeshNodeVersion(),
                        enhancePath: true,
                    },
                );
            }
        }

        if (deployResult.code !== 0) {
            const errorMsg = deployResult.stderr || deployResult.stdout || 'Mesh deployment failed';
            const { formatAdobeCliError } = await import('@/features/mesh/utils/errorFormatter');
            throw new Error(formatAdobeCliError(errorMsg));
        }

        logger.debug(`[Mesh Deployment] ${meshCommand} command completed, verifying deployment...`);

        // Use shared verification utility (same as manual deploy command)
        const { waitForMeshDeployment } = await import('./meshDeploymentVerifier');

        const verificationResult = await waitForMeshDeployment({
            onProgress: (_attempt, _maxRetries, _elapsedSeconds) => {
                // Don't show individual mesh timing during project creation
                // The overall "This could take up to 3 minutes" is already shown
                onProgress?.(
                    'Verifying deployment...',
                    'Checking deployment status...',
                );
            },
            logger: logger,
        });

        if (!verificationResult.deployed) {
            throw new Error(verificationResult.error || 'Mesh deployment verification failed');
        }

        logger.info('[Mesh Deployment] ✅ Mesh verified and deployed successfully');
        onProgress?.('✓ Deployment Complete', 'Mesh deployed successfully');

        return {
            success: true,
            data: {
                meshId: verificationResult.meshId!,
                endpoint: verificationResult.endpoint!,
            },
        };

    } catch (error) {
        logger.error('[Mesh Deployment] Deployment failed', error as Error);
        return {
            success: false,
            error: toError(error).message,
        };
    }
}
