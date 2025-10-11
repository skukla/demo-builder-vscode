/**
 * Shared mesh deployment verification logic
 * Used by both project creation wizard and manual deploy command
 */

import { getExternalCommandManager } from '../extension';
import { Logger } from './logger';
import { TIMEOUTS } from './timeoutConfig';

export interface MeshDeploymentResult {
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
    options: VerificationOptions = {}
): Promise<MeshDeploymentResult> {
    const pollInterval = options.pollInterval ?? 10000;     // 10 seconds between attempts
    const initialWait = options.initialWait ?? 20000;       // 20 seconds initial wait
    
    // Calculate maxRetries from configured timeout if not provided
    // Formula: (totalTimeout - initialWait) / pollInterval
    const maxRetries = options.maxRetries ?? 
        Math.floor((TIMEOUTS.API_MESH_UPDATE - initialWait) / pollInterval);
    
    const {
        onProgress,
        logger
    } = options;
    
    const commandManager = getExternalCommandManager();
    
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
                    timeout: 30000,
                    configureTelemetry: false,
                    useNodeVersion: null,
                    enhancePath: true
                }
            );
            
            if (verifyResult.code === 0) {
                // Parse JSON response
                const jsonMatch = verifyResult.stdout.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const meshData = JSON.parse(jsonMatch[0]);
                    const meshStatus = meshData.meshStatus?.toLowerCase();
                    
                    logger?.info(`[Mesh Verification] Status: ${meshStatus || 'unknown'}`);
                    
                    if (meshStatus === 'deployed' || meshStatus === 'success') {
                        // Success! Mesh is fully deployed
                        const totalTime = Math.floor((initialWait + (attempt - 1) * pollInterval) / 1000);
                        logger?.info(`[Mesh Verification] ✅ Verified deployment after ${totalTime}s`);
                        
                        deployedMeshId = meshData.meshId;
                        
                        // Get endpoint using describe command
                        if (deployedMeshId) {
                            deployedEndpoint = await getEndpoint(deployedMeshId, logger);
                        }
                        
                        meshDeployed = true;
                        break;
                    } else if (meshStatus === 'error' || meshStatus === 'failed') {
                        const error = 'Mesh deployment failed with error status';
                        logger?.error(`[Mesh Verification] ${error}`);
                        return {
                            deployed: false,
                            error
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
            error
        };
    }
    
    return {
        deployed: true,
        meshId: deployedMeshId,
        endpoint: deployedEndpoint
    };
}

/**
 * Get mesh endpoint using aio api-mesh:describe
 */
async function getEndpoint(meshId: string, logger?: Logger): Promise<string | undefined> {
    try {
        const commandManager = getExternalCommandManager();
        const result = await commandManager.execute(
            'aio api-mesh:describe',
            {
                timeout: 30000,
                configureTelemetry: false,
                useNodeVersion: null,
                enhancePath: true
            }
        );

        if (result.code === 0 && result.stdout) {
            // Parse the output to extract endpoint
            const endpointMatch = result.stdout.match(/endpoint[:\s]+([^\s\n]+)/i);
            if (endpointMatch && endpointMatch[1]) {
                return endpointMatch[1].trim();
            }

            // Try JSON parsing
            try {
                const meshData = JSON.parse(result.stdout);
                if (meshData.endpoint) {
                    return meshData.endpoint;
                }
            } catch {
                // Not JSON, continue
            }
        }

        // Fallback: construct endpoint from mesh ID
        if (meshId) {
            logger?.info('[Mesh Verification] Constructing endpoint from mesh ID');
            return `https://graph.adobe.io/api/${meshId}/graphql`;
        }

    } catch (error) {
        logger?.warn('[Mesh Verification] Could not retrieve endpoint', error as Error);
    }

    return undefined;
}

