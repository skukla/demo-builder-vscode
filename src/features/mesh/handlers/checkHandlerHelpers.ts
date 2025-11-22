/**
 * Check Handler Helper Functions (Step 8 - Phase 2)
 *
 * Extracted helper functions to reduce cognitive complexity in checkHandler.ts
 */

import { CommandExecutor } from '@/core/shell';
import { getMeshStatusCategory, extractAndParseJSON } from '@/features/mesh/utils/meshHelpers';

/**
 * Service object structure from workspace config
 */
interface WorkspaceService {
    name?: string;
    code?: string;
    code_name?: string;
}

/**
 * API services configuration structure
 */
interface ApiServicesConfig {
    services?: {
        apiMesh?: {
            detection?: {
                namePatterns?: string[];
                codes?: string[];
                codeNames?: string[];
            };
        };
    };
}

/**
 * Mesh data structure from CLI response
 */
interface MeshData {
    meshId?: string;
    meshStatus?: string;
    error?: string;
}

/**
 * Check if API Mesh service is enabled in workspace configuration
 *
 * @param services - Array of services from workspace config
 * @param config - Optional API services configuration (from sharedState)
 * @returns Object with enabled status
 */
export function checkApiMeshEnabled(
    services: unknown[],
    config?: ApiServicesConfig,
): { enabled: boolean } {
    // Use configuration for service detection with fallback to hardcoded values
    const meshConfig = config?.services?.apiMesh;
    const namePatterns = meshConfig?.detection?.namePatterns || ['API Mesh'];
    const codes = meshConfig?.detection?.codes || ['MeshAPI'];
    const codeNames = meshConfig?.detection?.codeNames || ['MeshAPI'];

    const hasMeshApi = (services as WorkspaceService[]).some((s) =>
        namePatterns.some((pattern: string) => s.name?.includes(pattern)) ||
        codes.some((code: string) => s.code === code) ||
        codeNames.some((codeName: string) => s.code_name === codeName),
    );

    return { enabled: hasMeshApi };
}

/**
 * Check if mesh exists and get its status
 *
 * @param commandExecutor - Command executor for running Adobe CLI commands
 * @returns Object with mesh existence status, meshId, status category, and optional endpoint/error
 */
export async function checkMeshExistence(
    commandExecutor: CommandExecutor,
): Promise<{
    meshExists: boolean;
    meshId?: string;
    meshStatus?: 'deployed' | 'error' | 'pending';
    endpoint?: string;
    error?: string;
}> {
    try {
        const { stdout, stderr, code } = await commandExecutor.execute('aio api-mesh get');

        if (code !== 0) {
            // Command failed - check if it's because no mesh exists
            const combined = `${stdout}\n${stderr}`;
            const noMeshFound = /no mesh found|unable to get mesh config/i.test(combined);

            if (noMeshFound) {
                return { meshExists: false };
            }

            // Other error - treat as no mesh
            return { meshExists: false };
        }

        // Parse JSON response using Step 2 helper
        const meshData = extractAndParseJSON<MeshData>(stdout);
        if (!meshData) {
            // Could not parse response - treat as no mesh
            return { meshExists: false };
        }

        const rawMeshStatus = meshData.meshStatus || '';
        const statusCategory = getMeshStatusCategory(rawMeshStatus);
        const meshId = meshData.meshId;

        // Map status category to result
        switch (statusCategory) {
            case 'deployed':
                return {
                    meshExists: true,
                    meshStatus: 'deployed',
                    meshId,
                    endpoint: undefined, // Endpoint is fetched separately in actual handler
                };

            case 'error':
                return {
                    meshExists: true,
                    meshStatus: 'error',
                    meshId,
                    endpoint: undefined,
                    error: meshData.error,
                };

            case 'pending':
                return {
                    meshExists: true,
                    meshStatus: 'pending',
                    meshId,
                    endpoint: undefined,
                };
        }

        // Fallback - shouldn't reach here
        return { meshExists: false };
    } catch (_error) {
        // Command execution failed - treat as no mesh
        return { meshExists: false };
    }
}

/**
 * Fallback mesh check when workspace config download fails
 *
 * Uses `aio api-mesh get --active` to determine API status and mesh existence
 * Parses output/error patterns to categorize the state
 *
 * @param commandExecutor - Command executor for running Adobe CLI commands
 * @returns Object with API enabled status, mesh existence, and optional meshId
 * @throws Re-throws unknown errors that don't match known patterns
 */
export async function fallbackMeshCheck(
    commandExecutor: CommandExecutor,
): Promise<{
    apiEnabled: boolean;
    meshExists: boolean;
    meshId?: string;
    meshStatus?: 'deployed';
}> {
    try {
        const { stdout, stderr } = await commandExecutor.execute('aio api-mesh get --active');
        const combined = `${stdout}\n${stderr}`;

        // "Unable to get mesh config" indicates API is NOT enabled
        const unableToGet = /unable to get mesh config/i.test(combined);
        if (unableToGet) {
            return {
                apiEnabled: false,
                meshExists: false,
            };
        }

        // Check for "No mesh found" without "unable to get" (API enabled, no mesh exists)
        const noMeshOnly = /no mesh found/i.test(combined) && !unableToGet;
        if (noMeshOnly) {
            return {
                apiEnabled: true,
                meshExists: false,
            };
        }

        // If we got here without error, mesh exists
        // Match patterns: "Mesh ID:", "mesh_id:", "mesh-id:", etc.
        const meshIdMatch = /mesh[\s_-]?id\s*:\s*([a-z0-9-]+)/i.exec(combined);
        const meshId = meshIdMatch ? meshIdMatch[1] : undefined;

        return {
            apiEnabled: true,
            meshExists: true,
            meshId,
            meshStatus: 'deployed',
        };
    } catch (error) {
        // Build combined error message from all possible sources
        const err = error as { message?: string; stderr?: string; stdout?: string };
        const combined = `${err.message || ''}\n${err.stderr || ''}\n${err.stdout || ''}`;

        // Check for permission errors (API not enabled)
        const forbidden = /403|forbidden|not authorized|not enabled|no access|missing permission/i.test(combined);
        if (forbidden) {
            return {
                apiEnabled: false,
                meshExists: false,
            };
        }

        // "Unable to get mesh config" indicates API is NOT enabled
        const unableToGet = /unable to get mesh config/i.test(combined);
        if (unableToGet) {
            return {
                apiEnabled: false,
                meshExists: false,
            };
        }

        // Check for "No mesh found" (API enabled, just no mesh)
        const noMesh = /no mesh found/i.test(combined);
        if (noMesh) {
            return {
                apiEnabled: true,
                meshExists: false,
            };
        }

        // Unknown error - rethrow
        throw error;
    }
}
