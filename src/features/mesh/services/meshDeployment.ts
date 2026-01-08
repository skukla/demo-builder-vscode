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
    existingMeshId?: string,
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

        // Determine deployment strategy based on whether mesh already exists
        // If mesh exists (detected in wizard or from previous deployment), use update instead of create
        const meshCommand: 'create' | 'update' = existingMeshId ? 'update' : 'create';
        
        if (existingMeshId) {
            logger.debug(`[Mesh Deployment] Existing mesh detected (${existingMeshId}), using update strategy`);
        } else {
            logger.debug('[Mesh Deployment] No existing mesh, using create strategy');
        }
        
        onProgress?.(
            'Deploying API Mesh...', 
            existingMeshId ? 'Updating existing mesh' : 'Creating mesh'
        );

        const deployResult = await commandManager.execute(
            `aio api-mesh:${meshCommand} "${meshConfigPath}" --autoConfirmAction`,
            {
                cwd: componentPath, // Run from mesh component directory (where .env file is)
                streaming: true,
                shell: true, // Required for command string with arguments and quoted paths
                timeout: TIMEOUTS.LONG,
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

        if (deployResult.code !== 0) {
            // Log full result for debugging
            logger.debug('[Mesh Deployment] Command failed', {
                code: deployResult.code,
                stdoutLength: deployResult.stdout?.length || 0,
                stderrLength: deployResult.stderr?.length || 0,
                stdout: deployResult.stdout?.substring(0, 500),
                stderr: deployResult.stderr?.substring(0, 500),
            });

            // Use .trim() to handle whitespace-only output (e.g., "\n")
            const errorMsg = deployResult.stderr?.trim() || deployResult.stdout?.trim() || 
                `Mesh deployment command failed with exit code ${deployResult.code}`;
            const { formatAdobeCliError } = await import('@/features/mesh/utils/errorFormatter');
            const formattedError = formatAdobeCliError(errorMsg);
            // Ensure we always have a meaningful error message
            throw new Error(formattedError || `Mesh deployment failed with exit code ${deployResult.code}`);
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
        logger.debug(`[Mesh Deployment] Verification result: meshId=${verificationResult.meshId}, endpoint=${verificationResult.endpoint}`);
        onProgress?.('✓ Deployment Complete', 'Mesh deployed successfully');

        return {
            success: true,
            data: {
                meshId: verificationResult.meshId || '',
                endpoint: verificationResult.endpoint || '',
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
