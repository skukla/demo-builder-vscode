/**
 * Verifies API Mesh deployment status with Adobe I/O
 * Checks if mesh actually exists, not just if we think it's deployed
 */

import { getMeshNodeVersion } from './meshConfig';
import { ServiceLocator } from '@/core/di';
import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { MeshVerificationResult } from '@/features/mesh/services/types';
import { Project, ComponentInstance } from '@/types';
import { parseJSON } from '@/types/typeGuards';

export type { MeshVerificationResult };

/**
 * Fetch mesh info from Adobe I/O via aio api-mesh:describe
 * Returns mesh ID and endpoint if found
 */
async function fetchMeshInfoFromAdobeIO(): Promise<{ meshId?: string; endpoint?: string } | null> {
    const commandManager = ServiceLocator.getCommandExecutor();
    const logger = getLogger();

    try {
        const result = await commandManager.execute(
            'aio api-mesh:describe',
            {
                timeout: TIMEOUTS.MESH_DESCRIBE,
                configureTelemetry: false,
                useNodeVersion: getMeshNodeVersion(),
                enhancePath: true,
            },
        );

        logger.debug(`[Mesh Verifier] describe command: code=${result.code}, stdout=${result.stdout?.length || 0} chars, stderr=${result.stderr?.length || 0} chars`);

        if (result.code !== 0) {
            logger.debug(`[Mesh Verifier] describe command failed: ${result.stderr?.substring(0, 200)}`);
            return null;
        }

        const output = result.stdout;

        if (!output || output.trim().length === 0) {
            logger.debug('[Mesh Verifier] describe command returned empty output');
            return null;
        }

        logger.trace(`[Mesh Verifier] Raw output (first 500 chars): ${output.substring(0, 500)}`);


        // Try JSON parsing first
        try {
            const meshData = parseJSON<{ meshId?: string; mesh_id?: string; meshEndpoint?: string; endpoint?: string }>(output);
            if (meshData) {
                return {
                    meshId: meshData.meshId || meshData.mesh_id,
                    endpoint: meshData.meshEndpoint || meshData.endpoint,
                };
            }
        } catch {
            // Not JSON, try regex
        }

        // Try regex patterns - handle formats like "Mesh ID:", "mesh_id:", "meshId:"
        const meshIdMatch = /mesh[\s_-]?id[:\s]+([a-f0-9-]+)/i.exec(output);
        const endpointMatch = /(?:mesh\s+)?endpoint[:\s]+([^\s\n]+)/i.exec(output);

        if (meshIdMatch || endpointMatch) {
            return {
                meshId: meshIdMatch ? meshIdMatch[1] : undefined,
                endpoint: endpointMatch ? endpointMatch[1] : undefined,
            };
        }

        // Log parsing failure (output already logged above)
        logger.debug('[Mesh Verifier] Could not parse mesh info from describe output');
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Attempt to recover missing mesh ID by fetching from Adobe I/O
 * This is a self-healing mechanism for projects created before mesh ID was saved
 */
async function tryRecoverMeshId(meshComponent: ComponentInstance): Promise<string | null> {
    const logger = getLogger();
    logger.debug('[Mesh Verifier] Attempting to recover missing mesh ID from Adobe I/O...');

    const meshInfo = await fetchMeshInfoFromAdobeIO();

    if (meshInfo?.meshId) {
        logger.debug('[Mesh Verifier] Successfully recovered mesh ID from Adobe I/O');

        // Update the component metadata with recovered mesh ID
        meshComponent.metadata = {
            ...meshComponent.metadata,
            meshId: meshInfo.meshId,
            meshStatus: 'deployed',
        };

        // Update endpoint if we got one
        if (meshInfo.endpoint) {
            meshComponent.endpoint = meshInfo.endpoint;
        }

        return meshInfo.meshId;
    }

    logger.debug('[Mesh Verifier] Could not recover mesh ID from Adobe I/O');
    return null;
}

/**
 * Verify that a mesh actually exists in Adobe I/O
 * Calls `aio api-mesh:describe` to check real deployment status
 *
 * Note: If mesh ID is missing from metadata, attempts to recover it from Adobe I/O.
 * The caller should save the project if meshIdRecovered is true in the result.
 */
export async function verifyMeshDeployment(project: Project): Promise<MeshVerificationResult> {
    const meshComponent = project.componentInstances?.['commerce-mesh'];

    // No mesh component = no mesh
    if (!meshComponent) {
        return { success: true, data: { exists: false } };
    }

    // Get mesh ID from metadata, or try to recover it
    let meshId = meshComponent.metadata?.meshId;
    let meshIdRecovered = false;

    if (!meshId) {
        // Attempt to recover mesh ID from Adobe I/O (self-healing for older projects)
        meshId = await tryRecoverMeshId(meshComponent);
        if (meshId) {
            meshIdRecovered = true;
        } else {
            return {
                success: false,
                error: 'No mesh ID found in project metadata',
            };
        }
    }

    try {
        const commandManager = ServiceLocator.getCommandExecutor();
        
        // Call aio api-mesh:describe to verify mesh exists
        // Uses Node version defined in commerce-mesh component configuration
        const result = await commandManager.execute(
            'aio api-mesh:describe',
            {
                timeout: TIMEOUTS.MESH_DESCRIBE,
                configureTelemetry: false,
                useNodeVersion: getMeshNodeVersion(),
                enhancePath: true,
            },
        );
        
        if (result.code !== 0) {
            // Mesh doesn't exist or command failed
            return {
                success: false,
                error: result.stderr || 'Failed to verify mesh deployment',
            };
        }
        
        // Parse output to extract mesh info
        const output = result.stdout;
        
        // Try to find mesh ID in output - handle formats like "Mesh ID:", "mesh_id:", "meshId:"
        const meshIdMatch = /mesh[\s_-]?id[:\s]+([a-f0-9-]+)/i.exec(output);
        const foundMeshId = meshIdMatch ? meshIdMatch[1] : null;
        
        // Try to find endpoint
        const endpointMatch = /endpoint[:\s]+([^\s\n]+)/i.exec(output);
        const endpoint = endpointMatch ? endpointMatch[1] : undefined;
        
        // Try JSON parsing as fallback
        if (!foundMeshId || !endpoint) {
            try {
                const meshData = parseJSON<{ meshId?: string; endpoint?: string }>(output);
                if (meshData) {
                    return {
                        success: true,
                        data: {
                            exists: true,
                            meshId: (meshData.meshId || foundMeshId || meshId) as string,
                            endpoint: meshData.endpoint || endpoint,
                            meshIdRecovered,
                        },
                    };
                }
            } catch {
                // Not JSON, use regex matches
            }
        }

        // Verify the mesh ID matches what we expect
        if (foundMeshId && foundMeshId !== meshId) {
            return {
                success: false,
                error: `Mesh ID mismatch: expected ${meshId}, found ${foundMeshId}`,
            };
        }

        return {
            success: true,
            data: {
                exists: true,
                meshId: foundMeshId ?? (meshId as string),
                endpoint,
                meshIdRecovered,
            },
        };
        
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error verifying mesh',
        };
    }
}

/**
 * Update project with verified mesh status
 * Call this after verification to sync project state with Adobe I/O reality
 */
export async function syncMeshStatus(
    project: Project,
    verificationResult: MeshVerificationResult,
): Promise<void> {
    const meshComponent = project.componentInstances?.['commerce-mesh'];
    if (!meshComponent) {
        return;
    }

    // Handle failure case
    if (!verificationResult.success || !verificationResult.data) {
        return;
    }

    if (!verificationResult.data.exists) {
        // Mesh doesn't exist in Adobe I/O - clear meshState
        project.meshState = undefined;
        meshComponent.status = 'ready'; // Mesh component exists but not deployed
        meshComponent.endpoint = undefined;
    } else {
        // Mesh exists - update endpoint if needed
        if (verificationResult.data.endpoint && verificationResult.data.endpoint !== meshComponent.endpoint) {
            meshComponent.endpoint = verificationResult.data.endpoint;
        }

        // Ensure status reflects reality
        if (meshComponent.status !== 'deployed' && project.meshState) {
            meshComponent.status = 'deployed';
        }
    }
}

