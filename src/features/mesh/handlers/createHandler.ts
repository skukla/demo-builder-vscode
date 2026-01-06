/**
 * Mesh Handlers - Create Handler
 *
 * Handles creating new API Mesh instances with deployment verification.
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateWorkspaceId } from '@/core/validation';
import { createProgressCallback, handleMeshAlreadyExists } from '@/features/mesh/handlers/createHandlerHelpers';
import { ensureAuthenticated, getEndpoint } from '@/features/mesh/handlers/shared';
import { getMeshNodeVersion } from '@/features/mesh/services/meshConfig';
import { getMeshStatusCategory, extractAndParseJSON } from '@/features/mesh/utils/meshHelpers';
import { ErrorCode } from '@/types/errorCodes';
import { parseJSON, toError } from '@/types/typeGuards';

/**
 * Handler: create-api-mesh
 *
 * Create new API Mesh instance
 * Handles mesh creation, deployment, and polling for completion
 *
 * SECURITY: Validates workspaceId parameter to prevent command injection attacks.
 * workspaceId is passed to Adobe CLI commands via shell, so validation blocks
 * malicious patterns like pipes, semicolons, command substitution, etc.
 *
 * @param context - Handler context with logger and extension context
 * @param payload - Request payload containing workspaceId (validated) and optional progress callback
 * @returns Result object with mesh creation status, meshId, and endpoint
 */
export async function handleCreateApiMesh(
    context: HandlerContext,
    payload: {
        workspaceId: string;
        onProgress?: (message: string, subMessage?: string) => void;
    },
): Promise<{
    success: boolean;
    meshId?: string;
    endpoint?: string;
    meshExists?: boolean;
    meshStatus?: 'deployed' | 'error';
    message?: string;
    error?: string;
    code?: ErrorCode;
}> {
    const { workspaceId, onProgress } = payload;

    // SECURITY: Validate workspaceId to prevent command injection
    try {
        validateWorkspaceId(workspaceId);
    } catch (validationError) {
        context.logger.error('[API Mesh] Invalid workspace ID provided', validationError as Error);
        return {
            success: false,
            error: `Invalid workspace ID: ${(validationError as Error).message}`,
            code: ErrorCode.MESH_CONFIG_INVALID,
        };
    }

    context.logger.debug('[API Mesh] Creating new mesh for workspace', { workspaceId });

    // PRE-FLIGHT: Check authentication before any Adobe CLI operations
    const authResult = await ensureAuthenticated(context.logger, 'create mesh');
    if (!authResult.authenticated) {
        return {
            success: false,
            error: authResult.error,
            code: authResult.code,
        };
    }

    const commandManager = ServiceLocator.getCommandExecutor();
    const storagePath = context.context.globalStorageUri.fsPath;
    let meshConfigPath: string | undefined;

    try {
        // Ensure storage directory exists
        await fsPromises.mkdir(storagePath, { recursive: true });

        // Load minimal mesh configuration from template
        onProgress?.('Creating API Mesh...', 'Loading mesh configuration template');
        const templatePath = path.join(context.context.extensionPath, 'src', 'features', 'mesh', 'config', 'mesh-config.json');
        const templateContent = await fsPromises.readFile(templatePath, 'utf-8');
        const minimalMeshConfig = parseJSON<Record<string, unknown>>(templateContent);
        if (!minimalMeshConfig) {
            throw new Error('Failed to parse mesh configuration template');
        }

        // Write mesh config to temporary file in extension storage
        meshConfigPath = path.join(storagePath, `mesh-config-${Date.now()}.json`);
        await fsPromises.writeFile(meshConfigPath, JSON.stringify(minimalMeshConfig, null, 2), 'utf-8');

        context.logger.debug('[API Mesh] Created minimal mesh configuration from template', {
            templatePath,
            outputPath: meshConfigPath,
        });
        context.debugLogger.trace('[API Mesh] Mesh config content', minimalMeshConfig);

        // Create mesh with the configuration file
        onProgress?.('Creating API Mesh...', 'Submitting configuration to Adobe');

        const lastOutput = { value: '' };
        const createResult = await commandManager.execute(
            `aio api-mesh create "${meshConfigPath}" --autoConfirmAction`,
            {
                streaming: true,
                timeout: TIMEOUTS.LONG,
                onOutput: createProgressCallback('create', onProgress, lastOutput),
                configureTelemetry: false,
                useNodeVersion: getMeshNodeVersion(),
                enhancePath: true,
            },
        );

        if (createResult.code !== 0) {
            // Try to handle as "mesh already exists" or "partially created" case
            const meshExistsResult = await handleMeshAlreadyExists(
                context,
                commandManager,
                meshConfigPath,
                createResult,
                lastOutput,
                onProgress,
            );

            if (meshExistsResult) {
                return meshExistsResult; // Mesh exists case handled successfully
            }

            // Other errors: fail
            const errorMsg = createResult.stderr || lastOutput.value || 'Failed to create mesh';
            context.logger.error('[API Mesh] Creation failed', new Error(errorMsg));
            throw new Error(errorMsg);
        }

        context.logger.info('[API Mesh] Mesh created successfully');
        context.debugLogger.trace('[API Mesh] Create output', { stdout: createResult.stdout });

        // Mesh creation is asynchronous - poll until it's deployed
        // Typical deployment time: 60-90 seconds, with 2 minute buffer for safety
        context.logger.debug('[API Mesh] Starting deployment verification polling...');
        onProgress?.('Waiting for mesh deployment...', 'Mesh is being provisioned (typically takes 60-90 seconds)');

        const maxRetries = 10; // 10 attempts with strategic timing = ~2 minutes max
        const pollInterval = TIMEOUTS.POLL.INTERVAL;
        const initialWait = TIMEOUTS.POLL.INITIAL;
        let attempt = 0;
        let meshDeployed = false;
        let deployedMeshId: string | undefined;
        let deployedEndpoint: string | undefined;

        // Initial wait: mesh won't be ready for at least 20 seconds
        onProgress?.('Waiting for mesh deployment...', 'Provisioning mesh (~20 seconds)');
        await new Promise(resolve => setTimeout(resolve, initialWait));

        while (attempt < maxRetries && !meshDeployed) {
            attempt++;

            const elapsed = initialWait + (attempt - 1) * pollInterval;
            const elapsedSeconds = Math.floor(elapsed / 1000);
            onProgress?.(
                'Waiting for mesh deployment...',
                `Checking deployment status (~${elapsedSeconds}s elapsed, attempt ${attempt}/${maxRetries})`,
            );

            // Wait between attempts (but not before first check, we already waited)
            if (attempt > 1) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }

            context.logger.debug(`[API Mesh] Verification attempt ${attempt}/${maxRetries}`);

            try {
                // Use 'get' without --active flag to get JSON response with meshStatus
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
                    // Parse JSON response to check meshStatus
                    try {
                        // Extract JSON from output using Step 2 helper (skips "Successfully retrieved mesh" line)
                        const meshData = extractAndParseJSON<{ meshId?: string; mesh_id?: string; meshStatus?: string; error?: string }>(verifyResult.stdout);
                        if (!meshData) {
                            context.logger.warn('[API Mesh] Could not parse JSON from get response');
                            context.debugLogger.trace('[API Mesh] Output:', verifyResult.stdout);
                            continue; // Try next iteration
                        }
                        const rawMeshStatus = meshData.meshStatus || '';
                        const statusCategory = getMeshStatusCategory(rawMeshStatus);

                        // Handle both camelCase (meshId) and snake_case (mesh_id) responses from Adobe CLI
                        const extractedMeshId = meshData.meshId || meshData.mesh_id;
                        context.debugLogger.debug('[API Mesh] Mesh status:', { rawMeshStatus, statusCategory, meshId: extractedMeshId });

                        switch (statusCategory) {
                            case 'deployed': {
                                // Success! Mesh is fully deployed - store the mesh data
                                const totalTime = Math.floor((initialWait + (attempt - 1) * pollInterval) / 1000);
                                context.logger.info(`[API Mesh] Mesh deployed successfully after ${attempt} attempts (~${totalTime}s total)`);
                                deployedMeshId = extractedMeshId;
                                // Get endpoint using single source of truth
                                deployedEndpoint = extractedMeshId ? await getEndpoint(context, extractedMeshId) : undefined;
                                meshDeployed = true;
                                break;
                            }

                            case 'error': {
                                // Deployment failed - return error
                                const errorMsg = meshData.error || 'Mesh deployment failed';
                                context.logger.error('[API Mesh] Mesh deployment failed with error status');
                                context.debugLogger.debug('[API Mesh] Error details:', errorMsg.substring(0, 500));

                                return {
                                    success: false,
                                    meshExists: true,
                                    meshStatus: 'error',
                                    error: 'Mesh deployment failed. Click "Recreate Mesh" to delete and try again.',
                                    code: ErrorCode.UNKNOWN,
                                };
                            }

                            case 'pending':
                                // Status is pending/provisioning/building - continue polling
                                context.logger.debug(`[API Mesh] Mesh status: ${rawMeshStatus || 'unknown'} (attempt ${attempt}/${maxRetries})`);
                                break;
                        }
                    } catch (parseError) {
                        context.logger.warn('[API Mesh] Failed to parse mesh status JSON', parseError as Error);
                        context.debugLogger.trace('[API Mesh] Raw output:', verifyResult.stdout);
                        // Continue polling
                    }
                } else {
                    // Non-zero exit code - likely mesh doesn't exist yet or other error
                    context.logger.warn(`[API Mesh] Get command returned exit code ${verifyResult.code}`);
                    context.debugLogger.trace('[API Mesh] stderr:', verifyResult.stderr);
                    // Continue polling - mesh might still be initializing
                }
            } catch (verifyError) {
                // Command execution failed - log and continue polling
                context.logger.warn('[API Mesh] Verification command failed', verifyError as Error);
                context.debugLogger.debug('[API Mesh] Error details:', verifyError);
                // Continue polling - transient network issues shouldn't fail the entire process
            }
        }

        // Check if we succeeded or timed out
        if (!meshDeployed) {
            const totalWaitTime = Math.floor((initialWait + maxRetries * pollInterval) / 1000);
            context.logger.warn(`[API Mesh] Mesh deployment verification timed out after ${maxRetries} attempts (~${totalWaitTime}s)`);
            context.logger.debug('[API Mesh] Mesh is still provisioning but taking longer than expected');
            onProgress?.('Mesh still provisioning', 'Deployment is taking longer than usual');

            // TIMEOUT is not an ERROR - mesh is likely still being deployed
            // Return success but note that verification is pending
            return {
                success: true, // Don't block user - mesh was submitted successfully
                meshId: undefined, // We don't have the ID yet
                message: `Mesh is still provisioning after ${totalWaitTime} seconds. This is unusual but not necessarily an error. You can continue - the mesh will be available once deployment completes (check Adobe Console for status).`,
            };
        }

        // Use mesh data from successful polling result
        onProgress?.('✓ API Mesh Ready', 'Mesh successfully created and deployed');

        return {
            success: true,
            meshId: deployedMeshId,
            endpoint: deployedEndpoint,
            message: 'API Mesh created and deployed successfully',
        };

    } catch (error) {
        context.logger.error('[API Mesh] Creation failed', error as Error);
        return {
            success: false,
            error: toError(error).message,
            code: ErrorCode.UNKNOWN,
        };
    } finally {
        // Clean up temporary mesh config file
        if (meshConfigPath) {
            try {
                await fsPromises.rm(meshConfigPath, { force: true });
                context.logger.debug('[API Mesh] Cleaned up temporary mesh config file');
            } catch (cleanupError) {
                context.logger.warn('[API Mesh] Failed to clean up mesh config file', cleanupError as Error);
            }
        }
    }
}
