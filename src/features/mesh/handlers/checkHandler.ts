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
import { ServiceLocator } from '@/core/di';
import { validateWorkspaceId } from '@/core/validation';
import { getSetupInstructions, getEndpoint } from '@/features/mesh/handlers/shared';
import { HandlerContext } from '@/features/project-creation/handlers/HandlerContext';
import { parseJSON, toError } from '@/types/typeGuards';

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
        };
    }

    context.logger.info('[API Mesh] Checking API Mesh availability for workspace', { workspaceId });
    context.debugLogger.debug('[API Mesh] Starting multi-layer check');

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
        };
    }

    const commandManager = ServiceLocator.getCommandExecutor();

    try {
        // LAYER 1: Download workspace configuration (most reliable)
        context.logger.info('[API Mesh] Layer 1: Downloading workspace configuration');

        // Use extension's global storage instead of OS temp for better control and isolation
        const extensionTempPath = path.join(context.context.globalStorageUri.fsPath, 'temp');
        await fsPromises.mkdir(extensionTempPath, { recursive: true });

        const tempDir = await fsPromises.mkdtemp(path.join(extensionTempPath, 'aio-workspace-'));
        const configPath = path.join(tempDir, 'workspace-config.json');

        context.debugLogger.debug('[API Mesh] Using extension temp path', { tempDir });

        try {
            await commandManager.execute(
                `aio console workspace download "${configPath}" --workspaceId ${workspaceId}`,
            );

            const configContent = await fsPromises.readFile(configPath, 'utf-8');
            const config = parseJSON<{ project?: { workspace?: { details?: { services?: unknown[] } } } }>(configContent);
            if (!config) {
                throw new Error('Failed to parse workspace configuration');
            }
            const services = config.project?.workspace?.details?.services || [];

            context.debugLogger.debug('[API Mesh] Workspace services', { services });

            // Use configuration for service detection with fallback to hardcoded values
            const meshConfig = context.sharedState.apiServicesConfig?.services?.apiMesh;
            const namePatterns = meshConfig?.detection?.namePatterns || ['API Mesh'];
            const codes = meshConfig?.detection?.codes || ['MeshAPI'];
            const codeNames = meshConfig?.detection?.codeNames || ['MeshAPI'];

            const hasMeshApi = (services as { name?: string; code?: string; code_name?: string }[]).some((s) =>
                namePatterns.some((pattern: string) => s.name?.includes(pattern)) ||
                codes.some((code: string) => s.code === code) ||
                codeNames.some((codeName: string) => s.code_name === codeName),
            );

            // Cleanup temp directory
            await fsPromises.rm(tempDir, { recursive: true, force: true });

            if (!hasMeshApi) {
                context.logger.warn('[API Mesh] API Mesh API not found in workspace services');
                context.debugLogger.debug('[API Mesh] Available services', { serviceNames: (services as { name?: string; code?: string }[]).map((s) => s.name || s.code) });
                return {
                    success: true,
                    apiEnabled: false,
                    meshExists: false,
                    setupInstructions: getSetupInstructions(context, selectedComponents),
                };
            }

            context.logger.info('[API Mesh] API Mesh API is enabled (confirmed via workspace config)');

            // LAYER 2: Now check if a mesh exists (API is already confirmed as enabled)
            context.logger.info('[API Mesh] Layer 2: Checking for existing mesh');

            try {
                // Use 'get' without --active to get JSON response with meshStatus
                const { stdout, stderr, code } = await commandManager.execute('aio api-mesh get');

                if (code !== 0) {
                    // Command failed - check if it's because no mesh exists
                    const combined = `${stdout}\n${stderr}`;
                    const noMeshFound = /no mesh found|unable to get mesh config/i.test(combined);

                    if (noMeshFound) {
                        context.logger.info('[API Mesh] API enabled, no mesh exists yet');
                        return {
                            success: true,
                            apiEnabled: true,
                            meshExists: false,
                        };
                    }

                    // Other error - treat as unknown state
                    context.logger.warn('[API Mesh] Mesh check command failed with unexpected error');
                    context.debugLogger.debug('[API Mesh] Error output:', combined);
                    throw new Error(`Mesh check failed: ${stderr || stdout}`);
                }

                // Parse JSON response
                const jsonMatch = /\{[\s\S]*\}/.exec(stdout);
                if (!jsonMatch) {
                    context.logger.warn('[API Mesh] Could not parse JSON from get response');
                    context.debugLogger.debug('[API Mesh] Output:', stdout);
                    // Assume no mesh if we can't parse
                    return {
                        success: true,
                        apiEnabled: true,
                        meshExists: false,
                    };
                }

                const meshData = parseJSON<{ meshId?: string; meshStatus?: string; error?: string }>(jsonMatch[0]);
                if (!meshData) {
                    context.logger.warn('[API Mesh] Failed to parse mesh data');
                    return {
                        success: true,
                        apiEnabled: true,
                        meshExists: false,
                    };
                }
                const meshStatus = meshData.meshStatus?.toLowerCase();
                const meshId = meshData.meshId;

                // Get endpoint using single source of truth (cached, describe, or construct)
                const endpoint = meshId ? await getEndpoint(context, meshId) : undefined;

                context.debugLogger.debug('[API Mesh] Parsed mesh data', { meshStatus, meshId, endpoint });

                // Mesh exists - check its status
                if (meshStatus === 'deployed' || meshStatus === 'success') {
                    context.logger.info('[API Mesh] Existing mesh found and deployed', { meshId, endpoint });
                    // Track that mesh existed before this session (prevent deletion on cancel)
                    context.sharedState.meshExistedBeforeSession = workspaceId;
                    return {
                        success: true,
                        apiEnabled: true,
                        meshExists: true,
                        meshId,
                        meshStatus: 'deployed',
                        endpoint,
                    };
                } else if (meshStatus === 'error' || meshStatus === 'failed') {
                    context.logger.warn('[API Mesh] Mesh exists but is in error state');
                    const errorMsg = meshData.error || 'Mesh deployment failed';
                    context.debugLogger.debug('[API Mesh] Error details:', errorMsg.substring(0, 500));

                    // Track that mesh existed (even in error state) to prevent deletion on cancel
                    context.sharedState.meshExistedBeforeSession = workspaceId;

                    return {
                        success: true,
                        apiEnabled: true,
                        meshExists: true,
                        meshId,
                        meshStatus: 'error',
                        endpoint,
                        error: 'Mesh exists but deployment failed. Click "Recreate Mesh" to delete and redeploy it.',
                    };
                } else {
                    // Status is pending/provisioning/building
                    context.logger.info('[API Mesh] Mesh exists but is still provisioning', { meshStatus });
                    // Track that mesh existed to prevent deletion on cancel
                    context.sharedState.meshExistedBeforeSession = workspaceId;
                    return {
                        success: true,
                        apiEnabled: true,
                        meshExists: true,
                        meshId,
                        meshStatus: 'pending',
                        endpoint,
                        error: 'Mesh is currently being provisioned. This could take up to 2 minutes.',
                    };
                }

            } catch (meshError) {
                const err = meshError as { message?: string; stderr?: string; stdout?: string };
                const combined = `${err.message || ''}\n${err.stderr || ''}\n${err.stdout || ''}`;
                context.logger.warn('[API Mesh] Mesh check failed', meshError as Error);
                context.debugLogger.debug('[API Mesh] Full error output:', combined);

                // Check if it's "no mesh found"
                const noMeshFound = /no mesh found|unable to get mesh config/i.test(combined);

                if (noMeshFound) {
                    context.logger.info('[API Mesh] API enabled, no mesh exists yet');
                    return {
                        success: true,
                        apiEnabled: true,
                        meshExists: false,
                    };
                }

                // Other error - treat as unknown/error state
                return {
                    success: true,
                    apiEnabled: true,
                    meshExists: false,
                    error: 'Unable to check mesh status. Try refreshing or check Adobe Console.',
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
            context.logger.info('[API Mesh] Layer 2 (fallback): Checking API status and mesh');

            try {
                const { stdout, stderr } = await commandManager.execute('aio api-mesh get --active');
                const combined = `${stdout}\n${stderr}`;

                context.debugLogger.debug('[API Mesh] get --active output (fallback)', { stdout, stderr });

                // "Unable to get mesh config" indicates API is NOT enabled
                const unableToGet = /unable to get mesh config/i.test(combined);
                if (unableToGet) {
                    context.logger.warn('[API Mesh] API Mesh API not enabled (unable to get mesh config)');
                    return {
                        success: true,
                        apiEnabled: false,
                        meshExists: false,
                    };
                }

                // Check for "No mesh found" without "unable to get" (API enabled, no mesh exists)
                const noMeshOnly = /no mesh found/i.test(combined) && !unableToGet;
                if (noMeshOnly) {
                    context.logger.info('[API Mesh] API enabled, no mesh exists yet (fallback check)');
                    return {
                        success: true,
                        apiEnabled: true,
                        meshExists: false,
                    };
                }

                // If we got here without error, mesh exists
                const meshIdMatch = /mesh[_-]?id[:\s]+([a-f0-9-]+)/i.exec(combined);
                const meshId = meshIdMatch ? meshIdMatch[1] : undefined;

                context.logger.info('[API Mesh] Existing mesh found (fallback check)', { meshId });

                return {
                    success: true,
                    apiEnabled: true,
                    meshExists: true,
                    meshId,
                    meshStatus: 'deployed',
                    endpoint: undefined,
                };

            } catch (meshError) {
                const err = meshError as { message?: string; stderr?: string; stdout?: string };
                const combined = `${err.message || ''}\n${err.stderr || ''}\n${err.stdout || ''}`;
                context.debugLogger.debug('[API Mesh] Mesh get error (fallback)', { combined });

                // Check for permission errors (API not enabled)
                const forbidden = /403|forbidden|not authorized|not enabled|no access|missing permission/i.test(combined);
                if (forbidden) {
                    context.logger.warn('[API Mesh] API Mesh API not enabled (permission denied)');
                    return {
                        success: true,
                        apiEnabled: false,
                        meshExists: false,
                    };
                }

                // "Unable to get mesh config" indicates API is NOT enabled
                const unableToGet = /unable to get mesh config/i.test(combined);
                if (unableToGet) {
                    context.logger.warn('[API Mesh] API Mesh API not enabled (unable to get mesh config)');
                    return {
                        success: true,
                        apiEnabled: false,
                        meshExists: false,
                    };
                }

                // Check for "No mesh found" (API enabled, just no mesh)
                const noMesh = /no mesh found/i.test(combined);
                if (noMesh) {
                    context.logger.info('[API Mesh] API enabled, no mesh exists yet');
                    return {
                        success: true,
                        apiEnabled: true,
                        meshExists: false,
                    };
                }

                // Unknown error
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
        };
    }
}
