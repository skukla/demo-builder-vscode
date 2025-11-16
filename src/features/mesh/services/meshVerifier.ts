/**
 * Verifies API Mesh deployment status with Adobe I/O
 * Checks if mesh actually exists, not just if we think it's deployed
 */

import { ServiceLocator } from '@/core/di';
import type { MeshVerificationResult } from '@/features/mesh/services/types';
import { Project } from '@/types';
import { parseJSON } from '@/types/typeGuards';
import { getMeshNodeVersion } from './meshConfig';

export type { MeshVerificationResult };

/**
 * Verify that a mesh actually exists in Adobe I/O
 * Calls `aio api-mesh:describe` to check real deployment status
 */
export async function verifyMeshDeployment(project: Project): Promise<MeshVerificationResult> {
    const meshComponent = project.componentInstances?.['commerce-mesh'];
    
    // No mesh component = no mesh
    if (!meshComponent) {
        return { success: true, data: { exists: false } };
    }
    
    // Get mesh ID from metadata
    const meshId = meshComponent.metadata?.meshId;
    if (!meshId) {
        return {
            success: false,
            error: 'No mesh ID found in project metadata',
        };
    }
    
    try {
        const commandManager = ServiceLocator.getCommandExecutor();
        
        // Call aio api-mesh:describe to verify mesh exists
        // Uses Node version defined in commerce-mesh component configuration
        const result = await commandManager.execute(
            'aio api-mesh:describe',
            {
                timeout: 30000,
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
        
        // Try to find mesh ID in output
        const meshIdMatch = /mesh[_-]?id[:\s]+([a-f0-9-]+)/i.exec(output);
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

