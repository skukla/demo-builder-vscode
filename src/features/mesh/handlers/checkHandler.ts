/**
 * Mesh Check Handler
 *
 * Handles the check-api-mesh message:
 * - Checks if API Mesh is enabled for workspace
 * - Detects existing mesh instances
 * - Uses multi-layer detection approach
 *
 * Note: Mesh check helpers inlined from meshCheckHelpers.ts (Step 6.3)
 * per "Extract for Reuse, Section for Clarity" SOP.
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ServiceLocator } from '@/core/di';
import { CommandExecutor } from '@/core/shell';
import { validateWorkspaceId } from '@/core/validation';
import { ensureAuthenticated, getSetupInstructions, getEndpoint } from '@/features/mesh/handlers/shared';
import { getMeshStatusCategory, extractAndParseJSON } from '@/features/mesh/utils/meshHelpers';
import { ErrorCode } from '@/types/errorCodes';
import { parseJSON, toError } from '@/types/typeGuards';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Type for workspace configuration structure
 */
type WorkspaceConfig = {
    project?: {
        workspace?: {
            details?: {
                services?: unknown[];
            };
        };
    };
};

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

// ============================================================================
// WORKSPACE CONFIG HELPERS
// ============================================================================

/**
 * Extract services array from workspace config
 *
 * Uses early returns to avoid deep optional chaining per SOP §4.
 * Returns empty array if any level is missing.
 *
 * @param config - Parsed workspace configuration
 * @returns Array of services or empty array
 */
function getWorkspaceServices(config: WorkspaceConfig | null): unknown[] {
    if (!config?.project) return [];
    if (!config.project.workspace) return [];
    if (!config.project.workspace.details) return [];
    return config.project.workspace.details.services ?? [];
}

// ============================================================================
// MESH CHECK HELPERS
// ============================================================================

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
    } catch {
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

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handler: check-api-mesh
 *
 * Check if API Mesh exists for workspace
 * Uses multi-layer approach:
 * - Layer 1: Download workspace config (most reliable)
 * - Layer 2: Check mesh status via CLI
 *
 * SECURITY: Validates workspaceId parameter to prevent command injection attacks.
 * workspaceId is used in Adobe CLI commands, so validation is critical to prevent
 * malicious input like $(rm -rf /) from being executed in the shell.
 *
 * @param context - Handler context with logger and extension context
 * @param payload - Request payload containing workspaceId (validated) and optional selectedComponents
 * @returns Result object with mesh availability status and details
 */
export async function handleCheckApiMesh(
    context: HandlerContext,
    payload: { workspaceId: string; selectedComponents?: string[] },
): Promise<{
    success: boolean;
    apiEnabled: boolean;
    meshExists: boolean;
    meshId?: string;
    meshStatus?: 'deployed' | 'not-deployed' | 'pending' | 'error';
    endpoint?: string;
    error?: string;
    code?: ErrorCode;
    setupInstructions?: { step: string; details: string; important?: boolean }[];
}> {
    const { workspaceId, selectedComponents = [] } = payload;

    // SECURITY: Validate workspaceId to prevent command injection
    try {
        validateWorkspaceId(workspaceId);
    } catch (validationError) {
        context.logger.error('[API Mesh] Invalid workspace ID provided', validationError as Error);
        return {
            success: false,
            apiEnabled: false,
            meshExists: false,
            error: `Invalid workspace ID: ${(validationError as Error).message}`,
            code: ErrorCode.MESH_CONFIG_INVALID,
        };
    }

    context.logger.debug(`[API Mesh] Checking workspace ${workspaceId}`);

    // PRE-FLIGHT: Check authentication before any Adobe CLI operations
    const authResult = await ensureAuthenticated(context.logger, 'check mesh status');
    if (!authResult.authenticated) {
        return {
            success: false,
            apiEnabled: false,
            meshExists: false,
            error: authResult.error,
            code: authResult.code,
        };
    }

    const commandManager = ServiceLocator.getCommandExecutor();

    try {
        // LAYER 1: Download workspace configuration (most reliable)
        context.debugLogger.trace('[API Mesh] Layer 1: Downloading workspace config');

        // Use extension's global storage instead of OS temp for better control and isolation
        const extensionTempPath = path.join(context.context.globalStorageUri.fsPath, 'temp');
        await fsPromises.mkdir(extensionTempPath, { recursive: true });

        const tempDir = await fsPromises.mkdtemp(path.join(extensionTempPath, 'aio-workspace-'));
        const configPath = path.join(tempDir, 'workspace-config.json');

        context.debugLogger.trace('[API Mesh] Using temp path', { tempDir });

        try {
            await commandManager.execute(
                `aio console workspace download "${configPath}" --workspaceId ${workspaceId}`,
            );

            const configContent = await fsPromises.readFile(configPath, 'utf-8');
            const config = parseJSON<WorkspaceConfig>(configContent);
            if (!config) {
                throw new Error('Failed to parse workspace configuration');
            }
            const services = getWorkspaceServices(config);

            context.debugLogger.trace('[API Mesh] Workspace services', { services });

            // Check if API Mesh service is enabled (extracted helper)
            const { enabled: apiEnabled } = checkApiMeshEnabled(services, context.sharedState.apiServicesConfig);

            // Cleanup temp directory
            await fsPromises.rm(tempDir, { recursive: true, force: true });

            if (!apiEnabled) {
                context.logger.warn('[API Mesh] API Mesh API not found in workspace services');
                context.debugLogger.debug('[API Mesh] Available services', { serviceNames: (services as { name?: string; code?: string }[]).map((s) => s.name || s.code) });
                return {
                    success: true,
                    apiEnabled: false,
                    meshExists: false,
                    setupInstructions: getSetupInstructions(context, selectedComponents),
                };
            }

            context.logger.debug('[API Mesh] API enabled, checking for existing mesh');

            // Check mesh existence using extracted helper
            const meshCheck = await checkMeshExistence(commandManager);

            if (!meshCheck.meshExists) {
                context.logger.debug('[API Mesh] API enabled, no mesh exists yet');
                return {
                    success: true,
                    apiEnabled: true,
                    meshExists: false,
                };
            }

            // Mesh exists - fetch endpoint and track state
            const endpoint = meshCheck.meshId ? await getEndpoint(context, meshCheck.meshId) : undefined;

            // Track that mesh existed before this session (prevent deletion on cancel)
            context.sharedState.meshExistedBeforeSession = workspaceId;

            // Handle mesh status based on category
            switch (meshCheck.meshStatus) {
                case 'deployed':
                    context.logger.debug(`[API Mesh] Mesh deployed: ${meshCheck.meshId}`);
                    return {
                        success: true,
                        apiEnabled: true,
                        meshExists: true,
                        meshId: meshCheck.meshId,
                        meshStatus: 'deployed',
                        endpoint,
                    };

                case 'error':
                    context.logger.warn('[API Mesh] Mesh exists but is in error state');
                    if (meshCheck.error) {
                        context.debugLogger.trace('[API Mesh] Error details:', meshCheck.error.substring(0, 500));
                    }
                    return {
                        success: true,
                        apiEnabled: true,
                        meshExists: true,
                        meshId: meshCheck.meshId,
                        meshStatus: 'error',
                        endpoint,
                        error: 'Mesh exists but deployment failed. Click "Recreate Mesh" to delete and redeploy it.',
                    };

                case 'pending':
                    context.logger.debug('[API Mesh] Mesh exists but is still provisioning');
                    return {
                        success: true,
                        apiEnabled: true,
                        meshExists: true,
                        meshId: meshCheck.meshId,
                        meshStatus: 'pending',
                        endpoint,
                        error: 'Mesh is currently being provisioned. This could take up to 2 minutes.',
                    };

                default:
                    // Fallback: meshExists but no status (shouldn't happen)
                    context.logger.warn('[API Mesh] Mesh exists but status is unknown');
                    return {
                        success: true,
                        apiEnabled: true,
                        meshExists: false,
                        error: 'Unable to determine mesh status. Try refreshing or check Adobe Console.',
                    };
            }

        } catch (configError) {
            context.debugLogger.debug('[API Mesh] Layer 1 failed, falling back to Layer 2', { error: String(configError) });
            // Cleanup temp directory on error
            try {
                await fsPromises.rm(tempDir, { recursive: true, force: true });
            } catch {
                // Ignore cleanup errors
            }

            // FALLBACK: Layer 1 failed, use Layer 2 to check both API status and mesh existence
            context.logger.debug('[API Mesh] Layer 2 (fallback): Checking API status and mesh');

            try {
                // Use fallback helper to check API/mesh status
                const fallbackResult = await fallbackMeshCheck(commandManager);

                if (!fallbackResult.apiEnabled) {
                    context.logger.warn('[API Mesh] API Mesh API not enabled');
                    return {
                        success: true,
                        apiEnabled: false,
                        meshExists: false,
                        setupInstructions: getSetupInstructions(context, selectedComponents),
                    };
                }

                if (!fallbackResult.meshExists) {
                    context.logger.debug('[API Mesh] API enabled, no mesh exists yet (fallback check)');
                    return {
                        success: true,
                        apiEnabled: true,
                        meshExists: false,
                    };
                }

                // Mesh exists
                context.logger.debug('[API Mesh] Existing mesh found (fallback check)', { meshId: fallbackResult.meshId });
                return {
                    success: true,
                    apiEnabled: true,
                    meshExists: true,
                    meshId: fallbackResult.meshId,
                    meshStatus: fallbackResult.meshStatus,
                    endpoint: undefined,
                };
            } catch (meshError) {
                // Unknown error from fallback - log and continue to outer catch
                context.logger.warn('[API Mesh] Fallback check failed with unknown error', meshError as Error);
                throw meshError;
            }
        }

    } catch (error) {
        context.logger.error('[API Mesh] Check failed', error as Error);
        return {
            success: false,
            apiEnabled: false,
            meshExists: false,
            error: toError(error).message,
            code: ErrorCode.UNKNOWN,
        };
    }
}
