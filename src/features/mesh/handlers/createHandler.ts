/**
 * Mesh Handlers - Create Handler
 *
 * Handles creating new API Mesh instances with deployment verification.
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { ServiceLocator } from '../../../services/serviceLocator';
import { parseJSON } from '@/types/typeGuards';
import { TIMEOUTS } from '@/utils/timeoutConfig';
import { HandlerContext } from '../../../commands/handlers/HandlerContext';
import { getEndpoint } from './shared';

/**
 * Handler: create-api-mesh
 *
 * Create new API Mesh instance
 * Handles mesh creation, deployment, and polling for completion
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
}> {
    const { workspaceId, onProgress } = payload;

    context.logger.info('[API Mesh] Creating new mesh for workspace', { workspaceId });

    const commandManager = ServiceLocator.getCommandExecutor();
    const storagePath = context.context.globalStorageUri.fsPath;
    let meshConfigPath: string | undefined;

    try {
        // Ensure storage directory exists
        await fsPromises.mkdir(storagePath, { recursive: true });

        // Load minimal mesh configuration from template
        onProgress?.('Creating API Mesh...', 'Loading mesh configuration template');
        const templatePath = path.join(context.context.extensionPath, 'templates', 'mesh-config.json');
        const templateContent = await fsPromises.readFile(templatePath, 'utf-8');
        const minimalMeshConfig = parseJSON<Record<string, unknown>>(templateContent);
        if (!minimalMeshConfig) {
            throw new Error('Failed to parse mesh configuration template');
        }

        // Write mesh config to temporary file in extension storage
        meshConfigPath = path.join(storagePath, `mesh-config-${Date.now()}.json`);
        await fsPromises.writeFile(meshConfigPath, JSON.stringify(minimalMeshConfig, null, 2), 'utf-8');

        context.logger.info('[API Mesh] Created minimal mesh configuration from template', {
            templatePath,
            outputPath: meshConfigPath,
        });
        context.debugLogger.debug('[API Mesh] Mesh config content', minimalMeshConfig);

        // Create mesh with the configuration file
        onProgress?.('Creating API Mesh...', 'Submitting configuration to Adobe');

        let lastOutput = '';
        const createResult = await commandManager.execute(
            `aio api-mesh create "${meshConfigPath}" --autoConfirmAction`,
            {
                streaming: true,
                timeout: TIMEOUTS.API_MESH_CREATE,
                onOutput: (data: string) => {
                    lastOutput += data;

                    // Parse output for progress indicators (don't show raw CLI output)
                    const output = data.toLowerCase();
                    if (output.includes('validating')) {
                        onProgress?.('Creating API Mesh...', 'Validating configuration');
                    } else if (output.includes('creating')) {
                        onProgress?.('Creating API Mesh...', 'Provisioning mesh infrastructure');
                    } else if (output.includes('deploying')) {
                        onProgress?.('Creating API Mesh...', 'Deploying mesh');
                    } else if (output.includes('success')) {
                        onProgress?.('Creating API Mesh...', 'Finalizing mesh setup');
                    }
                    // Note: Don't show raw CLI output - it may contain masked credentials (*******) or other noise
                },
                configureTelemetry: false,
                useNodeVersion: null,
                enhancePath: true,
            },
        );

        if (createResult.code !== 0) {
            const errorMsg = createResult.stderr || lastOutput || 'Failed to create mesh';

            // Special case 1: mesh already exists - update it instead
            // Special case 2: mesh was created but deployment failed - update to redeploy
            const meshAlreadyExists = errorMsg.includes('already has a mesh') || lastOutput.includes('already has a mesh');
            const meshCreatedButFailed = createResult.stdout.includes('Mesh created') ||
                                     createResult.stdout.includes('mesh created') ||
                                     lastOutput.includes('Mesh created');

            if (meshAlreadyExists || meshCreatedButFailed) {
                if (meshCreatedButFailed) {
                    context.logger.info('[API Mesh] Mesh created but deployment failed, attempting update to redeploy');
                    onProgress?.('Completing API Mesh Setup...', 'Detected partial creation, now deploying mesh');
                } else {
                    context.logger.info('[API Mesh] Mesh already exists, updating with new configuration');
                    onProgress?.('Updating Existing Mesh...', 'Found existing mesh, updating configuration');
                }

                // Update the existing mesh to ensure proper deployment
                try {
                    const updateResult = await commandManager.execute(
                        `aio api-mesh update "${meshConfigPath}" --autoConfirmAction`,
                        {
                            streaming: true,
                            timeout: TIMEOUTS.API_MESH_UPDATE,
                            onOutput: (data: string) => {
                                const output = data.toLowerCase();
                                if (output.includes('validating')) {
                                    onProgress?.('Deploying API Mesh...', 'Validating mesh configuration');
                                } else if (output.includes('updating')) {
                                    onProgress?.('Deploying API Mesh...', 'Updating mesh infrastructure');
                                } else if (output.includes('deploying')) {
                                    onProgress?.('Deploying API Mesh...', 'Deploying to Adobe infrastructure');
                                } else if (output.includes('success')) {
                                    onProgress?.('API Mesh Ready', 'Mesh deployed successfully');
                                }
                            },
                            configureTelemetry: false,
                            useNodeVersion: null,
                            enhancePath: true,
                        },
                    );

                    if (updateResult.code === 0) {
                        context.logger.info('[API Mesh] Mesh updated successfully');

                        // Extract mesh ID from output
                        const meshIdMatch = /mesh[_-]?id[:\s]+([a-f0-9-]+)/i.exec(updateResult.stdout);
                        const meshId = meshIdMatch ? meshIdMatch[1] : undefined;

                        // Get endpoint using single source of truth
                        const endpoint = meshId ? await getEndpoint(context, meshId) : undefined;

                        onProgress?.('✓ API Mesh Ready', 'Mesh successfully deployed and ready to use');

                        return {
                            success: true,
                            meshId,
                            endpoint,
                            message: 'API Mesh deployed successfully',
                        };
                    } else {
                        const updateError = updateResult.stderr || 'Failed to update mesh';
                        context.logger.error('[API Mesh] Update failed', new Error(updateError));
                        throw new Error(updateError);
                    }
                } catch (updateError) {
                    context.logger.error('[API Mesh] Failed to update existing mesh', updateError as Error);
                    throw updateError;
                }
            }

            // Other errors: fail
            context.logger.error('[API Mesh] Creation failed', new Error(errorMsg));
            throw new Error(errorMsg);
        }

        context.logger.info('[API Mesh] Mesh created successfully');
        context.debugLogger.debug('[API Mesh] Create output', { stdout: createResult.stdout });

        // Mesh creation is asynchronous - poll until it's deployed
        // Typical deployment time: 60-90 seconds, with 2 minute buffer for safety
        context.logger.info('[API Mesh] Starting deployment verification polling...');
        onProgress?.('Waiting for mesh deployment...', 'Mesh is being provisioned (typically takes 60-90 seconds)');

        const maxRetries = 10; // 10 attempts with strategic timing = ~2 minutes max
        const pollInterval = 10000; // 10 seconds between checks
        const initialWait = 20000; // 20 seconds before first check (avoid premature polling)
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

            context.logger.info(`[API Mesh] Verification attempt ${attempt}/${maxRetries}`);

            try {
                // Use 'get' without --active flag to get JSON response with meshStatus
                const verifyResult = await commandManager.execute(
                    'aio api-mesh get',
                    {
                        timeout: TIMEOUTS.API_CALL,
                        configureTelemetry: false,
                        useNodeVersion: null,
                        enhancePath: true,
                    },
                );

                if (verifyResult.code === 0) {
                    // Parse JSON response to check meshStatus
                    try {
                        // Extract JSON from output (skip "Successfully retrieved mesh" line)
                        const jsonMatch = /\{[\s\S]*\}/.exec(verifyResult.stdout);
                        if (!jsonMatch) {
                            context.logger.warn('[API Mesh] Could not parse JSON from get response');
                            context.debugLogger.debug('[API Mesh] Output:', verifyResult.stdout);
                            continue; // Try next iteration
                        }

                        const meshData = parseJSON<{ meshId?: string; meshStatus?: string; error?: string }>(jsonMatch[0]);
                        if (!meshData) {
                            context.logger.warn('[API Mesh] Failed to parse mesh data');
                            continue; // Try next iteration
                        }
                        const meshStatus = meshData.meshStatus?.toLowerCase();

                        context.debugLogger.debug('[API Mesh] Mesh status:', { meshStatus, meshId: meshData.meshId });

                        if (meshStatus === 'deployed' || meshStatus === 'success') {
                            // Success! Mesh is fully deployed - store the mesh data
                            const totalTime = Math.floor((initialWait + (attempt - 1) * pollInterval) / 1000);
                            context.logger.info(`[API Mesh] Mesh deployed successfully after ${attempt} attempts (~${totalTime}s total)`);
                            deployedMeshId = meshData.meshId;
                            // Get endpoint using single source of truth
                            deployedEndpoint = meshData.meshId ? await getEndpoint(context, meshData.meshId) : undefined;
                            meshDeployed = true;
                            break;
                        } else if (meshStatus === 'error' || meshStatus === 'failed') {
                            // Deployment failed - return error
                            const errorMsg = meshData.error || 'Mesh deployment failed';
                            context.logger.error('[API Mesh] Mesh deployment failed with error status');
                            context.debugLogger.debug('[API Mesh] Error details:', errorMsg.substring(0, 500));

                            return {
                                success: false,
                                meshExists: true,
                                meshStatus: 'error',
                                error: 'Mesh deployment failed. Click "Recreate Mesh" to delete and try again.',
                            };
                        } else {
                            // Status is pending/provisioning/building - continue polling
                            context.logger.info(`[API Mesh] Mesh status: ${meshStatus || 'unknown'} (attempt ${attempt}/${maxRetries})`);
                        }
                    } catch (parseError) {
                        context.logger.warn('[API Mesh] Failed to parse mesh status JSON', parseError as Error);
                        context.debugLogger.debug('[API Mesh] Raw output:', verifyResult.stdout);
                        // Continue polling
                    }
                } else {
                    // Non-zero exit code - likely mesh doesn't exist yet or other error
                    context.logger.warn(`[API Mesh] Get command returned exit code ${verifyResult.code}`);
                    context.debugLogger.debug('[API Mesh] stderr:', verifyResult.stderr);
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
            context.logger.info('[API Mesh] Mesh is still provisioning but taking longer than expected');
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
            error: error instanceof Error ? error.message : String(error),
        };
    } finally {
        // Clean up temporary mesh config file
        if (meshConfigPath) {
            try {
                await fsPromises.rm(meshConfigPath, { force: true });
                context.logger.info('[API Mesh] Cleaned up temporary mesh config file');
            } catch (cleanupError) {
                context.logger.warn('[API Mesh] Failed to clean up mesh config file', cleanupError as Error);
            }
        }
    }
}
