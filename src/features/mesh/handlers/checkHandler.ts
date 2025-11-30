/**
 * Mesh Check Handler
 *
 * Handles the check-api-mesh message:
 * - Checks if API Mesh is enabled for workspace
 * - Detects existing mesh instances
 * - Uses multi-layer detection approach
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { checkApiMeshEnabled, checkMeshExistence, fallbackMeshCheck } from './checkHandlerHelpers';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ServiceLocator } from '@/core/di';
import { validateWorkspaceId } from '@/core/validation';
import { getSetupInstructions, getEndpoint } from '@/features/mesh/handlers/shared';
import { ErrorCode } from '@/types/errorCodes';
import { parseJSON, toError } from '@/types/typeGuards';

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
    const authManager = ServiceLocator.getAuthenticationService();
    const isAuthenticated = await authManager.isAuthenticated();

    if (!isAuthenticated) {
        context.logger.warn('[API Mesh] Authentication required to check mesh status');

        // Direct user to dashboard for authentication
        const selection = await vscode.window.showWarningMessage(
            'Adobe authentication required to check API Mesh status. Please sign in via the Project Dashboard.',
            'Open Dashboard',
        );

        if (selection === 'Open Dashboard') {
            await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
        }

        return {
            success: false,
            apiEnabled: false,
            meshExists: false,
            error: 'Adobe authentication required. Please sign in via the Project Dashboard.',
            code: ErrorCode.AUTH_REQUIRED,
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
                        context.debugLogger.debug('[API Mesh] Error details:', meshCheck.error.substring(0, 500));
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
