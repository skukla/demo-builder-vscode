/**
 * Shared mesh deployment verification logic
 * Used by both project creation wizard and manual deploy command
 */

import { getMeshNodeVersion } from './meshConfig';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateMeshId } from '@/core/validation';
import type { Logger } from '@/types/logger';
import { parseJSON } from '@/types/typeGuards';

/**
 * MeshDeploymentVerificationResult - Result from deployment verification polling
 *
 * Used by waitForMeshDeployment to track verification progress.
 * Uses 'deployed' boolean to indicate if the mesh is fully deployed.
 * This is an internal type, different from:
 * - MeshDeploymentResult (types.ts) - has 'success' field
 * - MeshVerificationResult (types.ts) - has 'exists' field
 */
export interface MeshDeploymentVerificationResult {
    deployed: boolean;
    meshId?: string;
    endpoint?: string;
    error?: string;
}

export interface VerificationOptions {
    maxRetries?: number;        // Calculated from timeout if not provided
    pollInterval?: number;      // Default: 10000ms (10 seconds)
    initialWait?: number;       // Default: 20000ms (20 seconds)
    onProgress?: (attempt: number, maxRetries: number, elapsedSeconds: number) => void;
    logger?: Logger;
}

/**
 * Poll Adobe I/O until mesh is fully deployed
 * Mesh deployment is asynchronous - command can succeed while mesh is still deploying
 * This function waits until Adobe confirms deployment is complete
 */
export async function waitForMeshDeployment(
    options: VerificationOptions = {},
): Promise<MeshDeploymentVerificationResult> {
    const pollInterval = options.pollInterval ?? TIMEOUTS.POLL.INTERVAL;
    const initialWait = options.initialWait ?? TIMEOUTS.POLL.INITIAL;

    // Calculate maxRetries from configured timeout if not provided
    // Formula: (totalTimeout - initialWait) / pollInterval
    const maxRetries = options.maxRetries ??
        Math.floor((TIMEOUTS.LONG - initialWait) / pollInterval);
    
    const {
        onProgress,
        logger,
    } = options;
    
    const commandManager = ServiceLocator.getCommandExecutor();
    
    // Initial wait - mesh won't be ready immediately after update command
    logger?.info(`[Mesh Verification] Waiting ${initialWait / 1000}s for mesh provisioning...`);
    await new Promise(resolve => setTimeout(resolve, initialWait));
    
    let attempt = 0;
    let meshDeployed = false;
    let deployedMeshId: string | undefined;
    let deployedEndpoint: string | undefined;
    
    while (attempt < maxRetries && !meshDeployed) {
        attempt++;
        
        const elapsed = initialWait + (attempt - 1) * pollInterval;
        const elapsedSeconds = Math.floor(elapsed / 1000);
        
        // Notify progress
        onProgress?.(attempt, maxRetries, elapsedSeconds);
        
        // Wait between attempts (except first)
        if (attempt > 1) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        
        logger?.info(`[Mesh Verification] Attempt ${attempt}/${maxRetries} (${elapsedSeconds}s elapsed)`);
        
        try {
            // Call aio api-mesh get to check deployment status
            const verifyResult = await commandManager.execute(
                'aio api-mesh get',
                {
                    timeout: TIMEOUTS.NORMAL,
                    configureTelemetry: false,
                    useNodeVersion: getMeshNodeVersion(),
                    enhancePath: true,
                    shell: true,
                },
            );
            
            if (verifyResult.code === 0) {
                // Parse JSON response
                const jsonMatch = /\{[\s\S]*\}/.exec(verifyResult.stdout);
                if (jsonMatch) {
                    const meshData = parseJSON<{ meshStatus?: string; meshId?: string; mesh_id?: string; endpoint?: string; error?: string }>(jsonMatch[0]);
                    if (!meshData) {
                        logger?.warn('[Mesh Verification] Failed to parse mesh data');
                        continue;
                    }
                    const meshStatus = meshData.meshStatus?.toLowerCase();
                    
                    logger?.info(`[Mesh Verification] Status: ${meshStatus || 'unknown'}`);
                    
                    if (meshStatus === 'deployed' || meshStatus === 'success') {
                        // Success! Mesh is fully deployed
                        const totalTime = Math.floor((initialWait + (attempt - 1) * pollInterval) / 1000);
                        logger?.info(`[Mesh Verification] ✅ Verified deployment after ${totalTime}s`);

                        // Handle both camelCase (meshId) and snake_case (mesh_id) responses from Adobe CLI
                        deployedMeshId = meshData.meshId || meshData.mesh_id;

                        // Get endpoint using describe command
                        if (deployedMeshId) {
                            deployedEndpoint = await getEndpoint(deployedMeshId, logger);
                        } else {
                            logger?.warn(`[Mesh Verification] No meshId found in response, cannot retrieve endpoint`);
                        }

                        meshDeployed = true;
                        break;
                    } else if (meshStatus === 'error' || meshStatus === 'failed') {
                        // Log full response for deep debugging - Adobe's error field is often truncated
                        logger?.trace('[Mesh Verification] Full API response:', verifyResult.stdout);

                        // Try to extract more meaningful error from full response
                        const { extractMeshErrorSummary } = await import('../utils/errorFormatter');
                        const fullError = meshData.error || verifyResult.stdout || 'Mesh deployment failed with error status';
                        const userFriendlyError = extractMeshErrorSummary(fullError);

                        return {
                            deployed: false,
                            error: userFriendlyError,
                        };
                    }
                    // Otherwise continue polling (status is pending/building/etc)
                }
            }
        } catch (verifyError) {
            logger?.warn('[Mesh Verification] Verification attempt failed', verifyError as Error);
            // Continue polling - transient errors are common
        }
    }
    
    if (!meshDeployed) {
        const error = 'Mesh deployment verification timed out. The mesh may still be deploying - check the Developer Console.';
        logger?.warn(`[Mesh Verification] ${error}`);
        return {
            deployed: false,
            error,
        };
    }
    
    return {
        deployed: true,
        meshId: deployedMeshId,
        endpoint: deployedEndpoint,
    };
}

/**
 * Get mesh endpoint using aio api-mesh:describe
 */
async function getEndpoint(meshId: string, logger?: Logger): Promise<string | undefined> {
    // SECURITY: Validate meshId before using in URL construction (defense-in-depth)
    validateMeshId(meshId);

    try {
        const commandManager = ServiceLocator.getCommandExecutor();
        const result = await commandManager.execute(
            'aio api-mesh:describe',
            {
                timeout: TIMEOUTS.NORMAL,
                configureTelemetry: false,
                useNodeVersion: getMeshNodeVersion(),
                enhancePath: true,
            },
        );

        if (result.code === 0 && result.stdout) {
            // Parse the output to extract endpoint - try regex first (handles non-JSON output)
            const endpointMatch = /endpoint[:\s]+([^\s\n]+)/i.exec(result.stdout);
            if (endpointMatch && endpointMatch[1]) {
                return endpointMatch[1].trim();
            }

            // Try JSON parsing as fallback
            try {
                const meshData = parseJSON<{ endpoint?: string }>(result.stdout);
                if (meshData?.endpoint) {
                    return meshData.endpoint;
                }
            } catch {
                // Not JSON, continue to fallback
            }
        }

        // Fallback: construct endpoint from mesh ID
        if (meshId) {
            return `https://graph.adobe.io/api/${meshId}/graphql`;
        }

    } catch (error) {
        logger?.warn('[Mesh Verification] Could not retrieve endpoint', error as Error);
    }

    return undefined;
}

